# AI PR Reviewer

**Author:** Udit Damare

## The problem

Code review takes real engineering time, and it doesn't scale with team
size — every merge request needs a human to re-read a diff, hold the rest
of the codebase in their head, and catch the same categories of mistakes
over and over: dead imports left behind after a refactor, a hardcoded
credential that slipped into a commit, a brace commented out by accident,
a bug that's obvious in hindsight but easy to miss on the fifth review of
the day. Hosted "AI code review" products exist, but they typically mean
sending your company's proprietary source code to a third-party SaaS and
paying per seat or per review.

## How this solves it

This is a self-hosted MR reviewer that pulls a GitLab merge request's diff
directly via the GitLab API and runs it through two layers:

1. **Deterministic checks** — plain static analysis, no LLM involved:
   a syntax check (does the changed code actually parse), an unused
   declaration check (dead imports/variables), and a secret/credential
   scanner. These are exhaustive and 100% reliable by construction — no
   hallucination is possible in this layer, because there's no model in it.
2. **LLM-assisted review** — the diff (and, for smaller MRs, the full
   content of each changed file) is sent to a language model for a
   free-form pass across bugs, security, performance, architecture, code
   quality, documentation, and testing. This layer is genuinely useful as
   a first-pass lead generator, but — measured against real code by
   independent verification during development — it's probabilistic, not
   authoritative. Treat its findings as things worth a ten-second glance,
   not verdicts to apply mechanically. The deterministic layer is what you
   can trust without checking.

Both layers merge into one structured JSON report per MR.

## Almost free

- The deterministic layer costs nothing beyond CPU time — no API calls,
  no tokens, no model involved at all.
- Run the LLM layer against a **local model via Ollama** and the entire
  pipeline costs nothing per review — just your own machine's electricity.
  Slower and less capable than a frontier model, but completely free and
  completely private (nothing leaves your machine).
- Or point it at a **cloud model** (see below) for far better accuracy and
  speed. Modern hosted models are cheap enough per request that reviewing
  MRs with this tool costs a small fraction of a cent to a few cents each
  — realistically still close to free for typical team volumes, at the
  cost of your code leaving your machine for that request.

## What this covers today

**Deterministic (always reliable):**
- Syntax errors in changed `.js/.jsx/.ts/.tsx` files
- Unused local variables and imports, single-file scope
- Hardcoded credentials: AWS/GitHub/GitLab/Slack tokens, private key
  blocks, hardcoded personal file paths
- Line-number sanity-checking on whatever the LLM reports, so a fabricated
  line number gets stripped rather than passed through
- Filtering of docs/lockfiles/binaries so they don't pollute the review,
  and batching so large MRs don't get silently truncated by the model's
  context window

**LLM-assisted (useful, but verify before acting):**
- Free-form bug/security/performance/architecture/code-quality/
  documentation/testing review across the diff
- Custom project rules via an optional `.ai-review/guidelines.md` in the
  reviewed repo

**Not covered:**
- Cross-file reasoning (a function signature change breaking a caller in
  another file is invisible — only the diff and, optionally, each
  individual changed file are provided, never the rest of the repo)
- Whole-project type-checking (the syntax check parses one file at a time,
  it isn't a full TypeScript program with type inference)
- Running tests or executing code — everything here is static analysis

## What a better model would add

The deterministic layer's reliability doesn't change with model quality —
it has none of the LLM's failure modes to begin with. The LLM layer,
though, is directly bottlenecked by model capability. A stronger model
(larger, better-trained, or simply not squeezed onto consumer-laptop
VRAM) would plausibly improve:
- Fewer hallucinated findings and self-contradictions between runs
- Better judgment on genuinely ambiguous cases (e.g. "is this function
  parameter meant to be unused") that the deterministic layer deliberately
  stays out of
- If given more context (full repo access, not just the diff/changed
  files), real cross-file bug detection — the single biggest category of
  bug this tool currently cannot see at all

## Using a local model (Ollama)

```bash
ollama serve
ollama pull qwen2.5-coder:7b   # or any other coding-capable model
```

In `backend/.env`:

```bash
LLM_BASE_URL=http://localhost:11434/v1
LLM_MODEL=qwen2.5-coder:7b
LLM_API_KEY=ollama
```

Free, fully private, but bounded by your local hardware — expect slow
generation on a consumer GPU/CPU, and a small context window if VRAM is
limited (this is why the reviewer batches large MRs automatically).

## Using a cloud model (e.g. Gemini)

The LLM client speaks plain OpenAI-style chat completions, so any
OpenAI-compatible endpoint works — including
[Gemini's OpenAI-compatible endpoint](https://ai.google.dev/gemini-api/docs/openai).
Get an API key from [Google AI Studio](https://aistudio.google.com) (this
is separate from a consumer Gemini subscription).

In `backend/.env`:

```bash
LLM_BASE_URL=https://generativelanguage.googleapis.com/v1beta/openai
LLM_MODEL=gemini-2.0-flash
LLM_API_KEY=<your-gemini-api-key>
```

Faster and more accurate, at the cost of sending diffs and file content to
Google's servers for each review — confirm that's acceptable for the
repositories you point this at before switching off local Ollama.

Any other OpenAI-compatible provider (OpenAI itself, a self-hosted vLLM
server, etc.) works the same way — just set the three variables above to
match that provider.

## Requirements

- Node.js 20+ and npm
- A GitLab instance and personal access token with API read access to the
  project(s) you want reviewed
- Either Ollama installed locally, or an API key for an OpenAI-compatible
  hosted model

## Installation

From the repository root:

```bash
npm install
npm run install:all
```

## Environment variables

```bash
cp backend/.env.example backend/.env
```

Backend (`backend/.env`):

| Variable | Default | Description |
|---|---|---|
| `PORT` | `4000` | Backend HTTP port |
| `GITLAB_URL` | — (required) | Base URL of your GitLab instance |
| `GITLAB_TOKEN` | — (required) | Personal access token with API read access |
| `LLM_BASE_URL` | `http://localhost:11434/v1` | OpenAI-compatible chat-completions base URL |
| `LLM_MODEL` | `qwen2.5-coder:0.5b` | Model name to request |
| `LLM_API_KEY` | `ollama` | API key (Ollama ignores the value; required for hosted providers) |
| `LLM_REQUEST_TIMEOUT_MS` | `1800000` (30 min) | Timeout for a single LLM call and the backend's own HTTP server |
| `REVIEW_BATCH_MAX_DIFF_CHARS` | `6000` | Max diff characters per LLM call — raise this substantially for a large-context cloud model to reduce the number of calls |
| `REVIEW_RELEVANT_FILE_MAX_CHARS` | `3000` | Max characters of a changed file's full content attached as extra context per file |

## Running

From the repository root:

```bash
npm run dev
```

Or individually:

```bash
npm run dev:backend
npm run dev:frontend
```

- Backend: http://localhost:4000
- Frontend: http://localhost:3000

## Reviewing a GitLab merge request

```bash
curl -X POST http://localhost:4000/api/gitlab-reviews \
  -H "Content-Type: application/json" \
  -d '{"projectId":"<gitlab-project-id>","mergeRequestIid":<mr-iid>}'
```

Returns a JSON report: `{ summary, findings, documentationNeeded }`, where
each finding has a severity, category, file, optional line number, title,
and explanation.

## Example `.ai-review/guidelines.md`

Place this file at the root of the repository being reviewed to give the
LLM layer project-specific context. If absent, the reviewer proceeds with
general best practices only.

```markdown
# Review Guidelines

## Priorities
- Flag any missing authorization checks on endpoints that mutate user data.
- Flag SQL built via string concatenation instead of parameterized queries.

## Conventions
- This codebase uses Result<T, E> instead of throwing for expected error paths.
- Controllers should stay thin; business logic belongs in services/.

## Out of scope
- Do not flag missing unit tests — that is tracked separately.
- Do not flag formatting; Prettier enforces this in CI.
```

## Known limitations

- **No cross-file reasoning**: only the diff and (optionally) the full
  content of each individually changed file are ever sent — never the
  rest of the repository. A bug that only shows up when combined with
  another file's code is invisible to this tool.
- **No auto-posting to GitLab**: results are returned as JSON, not posted
  as MR comments.
- **No test execution or whole-project type-checking**: everything here
  is static analysis on the changed files.
- **No persistence**: reviews aren't stored; each request re-fetches and
  re-reviews from scratch.
- **No authentication**: intended for local/internal use, not public
  deployment.
- **LLM findings need a human spot-check**: see
  [backend/docs/pr-reviewer-experiment-notes.md](backend/docs/pr-reviewer-experiment-notes.md)
  for the actual measured precision numbers from testing this against
  real merge requests.

There is also an older, separate local-repository review flow
(`POST /api/reviews` with a local `repoPath`/`baseBranch`/`reviewBranch`)
still present from an earlier iteration of this project — it predates the
GitLab integration above and works on a local Git checkout instead of a
GitLab MR.
