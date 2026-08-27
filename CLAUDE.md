# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

Run from the repository root unless noted.

```bash
npm run install:all      # installs root, backend/, and frontend/ deps
npm run dev               # runs backend + frontend together (concurrently)
npm run dev:backend       # backend only — tsx watch src/server.ts (port 4000)
npm run dev:frontend      # frontend only — next dev (port 3000)
npm run build              # builds backend then frontend
```

Backend-only, from `backend/`:

```bash
npm run typecheck   # tsc --noEmit — run this after any backend change
npm run build        # tsc -p tsconfig.json -> dist/
```

Frontend-only, from `frontend/`:

```bash
npm run typecheck
```

There is no test suite in this repo yet — `typecheck` is the only automated
verification step. Manually exercise changes via curl/Postman against the
running backend (see README for example requests).

## Architecture: two independent review pipelines

This backend contains **two unrelated PR-review features** that happen to
share an Express app. Do not conflate them — they have different inputs,
different LLM wiring, and different maturity levels.

### 1. GitLab MR review (`POST /api/gitlab-reviews`) — primary, actively developed

Entry point: [backend/src/routes/review.routes.ts](backend/src/routes/review.routes.ts)
→ [backend/src/services/review.service.ts](backend/src/services/review.service.ts) (`ReviewService`).

Pipeline, in order:
1. Fetch MR metadata + diffs from GitLab (`GitLabService`,
   [gitlab.service.ts](backend/src/services/gitlab.service.ts)). **The
   `/merge_requests/:iid/diffs` endpoint returns a raw array, not
   `{diffs: [...]}`** — this bit a prior implementation; don't reintroduce
   the wrapped-shape assumption.
2. Filter out non-code diffs (`diff-filter.ts`) — docs, lockfiles, binaries
   never reach the LLM prompt.
3. Fetch each changed file's full content once (`fetchChangedFileContents`)
   — shared by every check below so nothing re-fetches the same file.
4. Run deterministic checks against that content — **these have no LLM
   involved and are the one part of this codebase that's unconditionally
   trustworthy**:
   - `syntax-check.ts` — parses each file with the TS compiler API, flags
     anything that doesn't parse.
   - `unused-declarations.ts` — AST-based, single-file "declared but never
     referenced again" check for local `const`/`let` and imports.
     Deliberately excludes function parameters, destructuring, and
     exported bindings (too much legitimate ambiguity — see the git log
     for the exact false-positive cases that shaped this scope).
   - `secret-scan.ts` — fixed-format credential patterns plus a
     hardcoded-personal-path pattern.
5. Batch the diffs (`diff-batch.ts`) into multiple LLM calls sized to fit
   the model's context window (`REVIEW_BATCH_MAX_DIFF_CHARS`) — a large MR
   sent as one prompt gets silently truncated server-side with no error,
   not rejected. This is why review results are assembled from N batch
   calls, not one.
6. For each batch, call the LLM (`LLMService`,
   [llm.service.ts](backend/src/services/llm.service.ts)) with the diff
   plus each changed file's full content as `relevantFiles` context
   (`REVIEW_RELEVANT_FILE_MAX_CHARS` caps this per file).
7. Validate every LLM-reported line number against the diff's actual hunk
   ranges (`diff-hunks.ts`) — small models are unreliable at mapping a
   hunk to an absolute line number; anything outside the real range gets
   stripped rather than trusted.
8. Merge deterministic + LLM findings into one `CodeReview` JSON response.

`LLMService` talks plain OpenAI-style `/chat/completions` — it works
against any OpenAI-compatible provider (local Ollama, Gemini's
OpenAI-compat endpoint, etc.) purely by changing `LLM_BASE_URL`/
`LLM_MODEL`/`LLM_API_KEY`. Don't add provider-specific branching here; if
a new provider needs special handling, that's a sign the base URL isn't
being used correctly, not a reason to fork the client.

### 2. Local-repo review (`POST /api/reviews`) — earlier iteration, still present

Entry point: [reviewRoutes.ts](backend/src/routes/reviewRoutes.ts) →
`ReviewOrchestrator.runReview` → `GitService` (local git ops) +
`OllamaCodeReviewer` (implements the `CodeReviewer` interface). Reviews a
diff between two branches of a **local** git checkout (`repoPath`), not a
GitLab MR. In-memory `ReviewStore`, synchronous execution, no persistence.
The frontend's `ReviewForm` targets this endpoint, not the GitLab one.

Both routers are mounted in [routes/index.ts](backend/src/routes/index.ts).
Note `apiRouter` is itself mounted at `/api` in
[server.ts](backend/src/server.ts) — sub-routers must not re-add an `/api`
prefix (this doubled to `/api/api/...` once already).

## Frontend

Next.js 14 app router, talks only to `POST /api/reviews` /
`GET /api/reviews/:id` (the local-repo flow) via
[frontend/lib/api.ts](frontend/lib/api.ts) — every HTTP call goes through
that module, no component calls `fetch` directly. It does not yet have a UI
for the GitLab MR review endpoint.

## Review philosophy

Loosely adapted from Raj Kundalia's 4-phase AI-PR-review framework
(["How I Review PRs with AI — Without Losing My Own Judgment"](https://medium.com/@rajkundalia/how-i-review-prs-with-ai-without-losing-my-own-judgment-f930ad30dc60)),
mapped onto what this project actually is: an automated pipeline, not an
interactive chat session. Keep these in mind when extending it:

- **Signal extraction, not decision-making.** The LLM layer's job is to
  surface candidates worth a human's attention, not to render a verdict.
  Never design a feature that acts on an LLM finding without a human (or
  a deterministic check) in the loop — that's the line this project has
  consistently held.
- **Deterministic checks are the trustworthy core; LLM output is the
  noisy first pass.** This is the direct, automated analogue of the
  framework's Phase 2 ("AI first pass — filter the noise") — except here
  the noise-filtering for an entire class of findings (syntax, dead code,
  secrets) is done by real static analysis instead of a human dismissing
  wrong suggestions by hand. When adding a new check, always ask first
  "can this be deterministic instead of a model guess?" before reaching
  for another LLM call.
- **Findings need "must-fix vs. noise" triage before anyone acts on
  them** (the framework's Phase 4). This project doesn't do that
  classification today — it returns a flat findings list. If a triage/
  scoring layer gets added, keep it a separate, explicit step rather than
  quietly folding it into severities the LLM already assigns (those are
  self-reported and not currently validated).
- **Context isolation matters for consistency.** The framework's golden
  rule is one session per PR so context doesn't bleed across reviews.
  This project already gets that for free by construction — each
  `reviewMergeRequest` call is stateless and re-fetches everything fresh.
  Don't add caching/session state across MRs without deliberately
  deciding whether that's actually wanted (a prior finding recurring
  after a real fix, because the model has no memory of past runs, is a
  known and currently-accepted limitation, not a bug to silently patch
  over with hidden state).

## Known constraints worth designing around

- Local Ollama on modest hardware has a small context window (often 4096
  tokens, auto-sized from available VRAM) — batching and the
  relevant-files cap exist specifically to stay under that without
  silent truncation. Don't casually raise those defaults without
  remembering a local model may be on the other end.
- The LLM layer's findings (bugs/security/performance/etc.) are
  probabilistic and have measured a wide range of real-world precision
  depending on model and context — see
  [backend/docs/pr-reviewer-experiment-notes.md](backend/docs/pr-reviewer-experiment-notes.md)
  for the actual numbers. Never promote LLM-sourced findings to the same
  trust level as the deterministic checks in code or docs.
