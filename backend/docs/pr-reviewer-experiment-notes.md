# Building a local, AI-powered PR reviewer — experiment notes

Running log of what was built, what broke, and what the real-world precision
turned out to be — kept for writing up as a LinkedIn post / Medium article.
Not polished prose; just the facts, numbers, and quotes worth pulling from.

## The setup

- A self-hosted MR reviewer: fetches a GitLab MR's diff via the API, runs it
  through checks, returns structured JSON findings.
- Hardware: a laptop with an NVIDIA RTX 3050 (4GB VRAM, ~3.2GB free) and an
  AMD integrated GPU. No dedicated review infra.
- Started on `qwen2.5-coder:0.5b`, moved to `qwen2.5-coder:7b` locally via
  Ollama, later added Gemini (hosted) as a swappable OpenAI-compatible
  provider.

## The core question

**Can a small, locally-hosted LLM actually be trusted as a PR reviewer?**
Short answer arrived at through the experiment: not on its own — but split
the work between "deterministic checks" (100% reliable, no model needed)
and "LLM judgment" (probabilistic, needs a human spot-check), and the
deterministic half turns out to be genuinely strong.

## Architecture that emerged

**Deterministic layer (no LLM, no false positives by construction):**
- Syntax check — parses every changed file with the TypeScript parser,
  flags anything that doesn't actually parse (unbalanced braces, broken
  statements).
- Unused-declaration check — AST-based, single-file, flags local
  `const`/`let` variables and imports that are declared but never
  referenced again in that file. JSX-aware (doesn't flag `import React`
  when the file has JSX, since the classic transform uses it implicitly).
- Secret/credential scan — fixed-format token patterns (AWS, GitHub,
  GitLab, Slack, private key blocks) plus a hardcoded-personal-file-path
  pattern.
- Line-number validation — any line number the LLM claims gets checked
  against the actual diff hunks and stripped if it doesn't correspond to a
  real changed line.
- Diff filtering — excludes docs/notes/lockfiles/binaries before they ever
  reach the model.
- Batching — diffs split across multiple LLM calls sized to the model's
  context window, so a multi-file MR doesn't get silently truncated.

**Probabilistic layer (LLM free-form review):**
- Categories: BUG, SECURITY, PERFORMANCE, ARCHITECTURE, CODE_QUALITY,
  DOCUMENTATION, TESTING.
- Given the full diff + (later) the full content of each changed file, not
  just the bare hunk.
- Optional project-specific guidelines via `.ai-review/guidelines.md`.

## Bugs found and fixed along the way

1. **GitLab API response-shape bug**: `/merge_requests/:iid/diffs` returns
   a raw array, not `{diffs: [...]}` — the initial (ChatGPT-written) code
   assumed the wrapped shape, so `getMergeRequestDiffs` silently returned
   `undefined` every time. Confirmed via a live curl against the real
   GitLab instance before touching code.
2. **Route double-mounting**: a new GitLab-review route was mounted at the
   same path (`/api/reviews`) as a pre-existing, unrelated reviewer feature
   already used by the frontend — Express always matched the first-registered
   handler, so the new feature was completely unreachable. Separately, both
   new route groups were double-prefixed (`/api/api/gitlab...`) because the
   parent router was already mounted at `/api`.
3. **Wrong LLM endpoint**: pointed at Ollama's native port with no `/v1`
   suffix while posting to an OpenAI-style `/chat/completions` path — 404s
   until the base URL was corrected to include `/v1`.
4. **Context-window truncation, silent**: a 19-file MR produced a
   ~9,663-token prompt; the model's context window (auto-sized down from
   available VRAM to 4096 tokens) meant llama-server truncated the prompt
   to 2,050 tokens with only a warning in the server log, no error surfaced
   to the caller. A "no findings" result under truncation looks identical
   to a clean MR. Fixed by batching diffs into multiple right-sized calls.
5. **Unescaped-quote JSON breakage**: the model periodically writes a code
   snippet inside a `"suggestion"` field that itself contains a literal
   `"` without escaping it, breaking `JSON.parse` for that whole batch.
   Batch-level try/catch means one bad batch doesn't kill the whole review,
   but its findings are lost silently.
6. **Large non-code files drowning the real diff**: a 16KB scratch
   markdown file bundled into a test MR alongside a 423-char real code
   diff caused the model to hallucinate "missing documentation" findings
   about files only *mentioned in prose* in that markdown, not actually
   changed — the real diff got lost in the noise. Fixed by filtering
   non-code files (docs, lockfiles, binaries) out before prompt-building.

## Hardware reality check

- Low GPU utilization (~15-20%) during generation does **not** mean the
  GPU has headroom. Two reasons: (1) autoregressive decode is inherently
  sequential/tiny-per-step (`batch=1`), so the GPU finishes its slice
  almost instantly and waits; (2) with only 12 of 28 layers fitting in
  ~3.2GB free VRAM, every token relays GPU → CPU → GPU, and the CPU segment
  (a 6-core laptop chip doing 7B-parameter matmuls) is the real bottleneck.
- Measured generation speed: ~5.3 tok/s at first (0.5B/7B split loads),
  dropping to ~2.8-3.3 tok/s once full-file context was added to prompts
  (bigger prompts, same hardware ceiling).
- A CPU-only company VM would help the *accuracy* lever (room to run a
  bigger model without VRAM constraints) but not necessarily the *speed*
  lever — CPU token generation is bandwidth/compute-bound, not
  RAM-amount-bound; a bigger model on more RAM would likely be slower in
  wall-clock terms, just more accurate per token.
- Full fix for both speed and accuracy at once: either a GPU with enough
  VRAM to fit the whole model, or a hosted API model (tried: Gemini, via
  its OpenAI-compatible endpoint — trivial to wire up since the existing
  client already spoke plain OpenAI-style chat completions).

## Ground-truth precision data (the actual headline numbers)

Verified independently each time by a colleague's Claude instance with
direct repo access (not by trusting the review's own text) — this is the
part worth quoting directly.

**Round 1** (7B model, MR with 19 changed files, no relevant-file context
yet): of 13 non-syntax findings on files the colleague owned, **1 was
real**, 6 were confirmed false — including two where following the
suggestion would have broken working code (`useEffect` sync removal that
would leave a tab permanently empty on first load; a "null reference" claim
on state that's always initialized as `[]`). Also surfaced a new failure
mode: **fabricated line numbers** — a variable flagged at three different
line numbers, none of which matched its real location.

**Fix applied**: line numbers now validated against actual diff hunk
ranges; anything outside the real changed-line range gets stripped rather
than passed through.

**Round 2** (after adding full-file context + deterministic
unused-declaration/secret checks): ~45 findings, dominated by a new
"possibly unused declaration" pass (~24 hits). Colleague's first pass
(a combined multi-term grep across 5 names at once) judged this "mostly
noise — reads like a broken usage-resolver." On direct, individually-scoped
re-verification of every single item: **22-24 of 24 were genuinely real**
(the 2 disputed ones — `useSelector`/`router` — turned out, on a fresh
re-fetch of the live file, to still show zero live usages outside comments,
suggesting the "correction" that called them false positives was itself
based on an unscoped, repo-wide search rather than a file-scoped one).
**Actual round 2 precision on the deterministic unused-declaration check:
100% on direct verification**, not the "noisy" verdict first assigned to it.
Also confirmed 2 additional true positives via direct code inspection: a
dead `FlameIconSvg` import and an orphaned `trackActivity` function.

Genuinely real problems found in round 2 (not disputed): a self-contradiction
between round 1 and round 2 on the same file (`ExploreProjects.jsx`'s `data`
prop: "unused, remove it" in round 1 vs. "HIGH-severity bug, don't remove"
in round 2) — traced to the free-form LLM layer specifically, since function
*parameters* are deliberately excluded from the deterministic checker (too
much legitimate "unused but required for position" ambiguity in JS/React).
Also: an invalid-React suggested fix, and no "memory" of already-applied
fixes across separate review runs (expected — each run is a fresh,
independently-sampled generation with no state).

**Round 3** (new, unrelated MR, same pipeline): 6 unused-declaration
findings, **6 of 6 confirmed real** by the colleague on direct file
inspection — dead `lucide-react` icon imports and a dead `toast` import,
each verified against the actual inline-SVG/no-click-handler code that
made them genuinely unused.

**Net read across all three rounds**: the deterministic layer
(syntax/unused-declarations/secrets/line-validation) has held up as
essentially 100% reliable every time someone actually checked line-by-line
against the real code — including the one case where "noise" was claimed,
which reversed under closer inspection. The free-form LLM layer stayed
consistently unreliable (~1-in-7 early on) for the same reason every time:
no cross-file context, no memory across runs, and a genuine ceiling on a
small quantized model's ability to reason about anything beyond a diff hunk
in isolation.

## Meta-lesson: verification methodology matters as much as the tool

The round-2 "noise" verdict was itself wrong, and the mistake is
instructive: a combined, multi-term grep search (`"useEffect OR Image OR
useSelector OR router OR Footer"`) returning a plausible-looking aggregate
count made it *look* like all 5 names were in active use, when really only
2 of them accounted for nearly all the hits. Checking each claim
individually, scoped to the exact file, is what actually surfaces the
truth — and this cuts both ways: a second "correction" pass later claimed
2 of those same findings were false positives, and *that* correction turned
out to be wrong too (likely a repo-wide search conflated with a
single-file claim). Two independent verification passes each got fooled by
under-scoped tooling before a third, tightly-scoped check settled it.
**The discipline of verifying against ground truth — and re-verifying the
verification — mattered more than any single model or prompt tweak.**

## Where this leaves the pitch

Not "AI code review that replaces a human." More accurately: **a free,
always-on syntax/dead-code/secret-scanning guarantee, plus an occasional
real catch from the LLM layer worth a human's ten-second glance** — not a
verdict to trust or apply mechanically. That's a real, useful thing to run
on every MR; it's just not what "AI PR reviewer" implies at face value, and
being honest about that gap is probably the more interesting story than
claiming it works better than it does.
