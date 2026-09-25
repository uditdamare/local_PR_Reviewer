# Project Brief: Production-Risk PR Reviewer (for Claude / Claude Code)

Use this document as full context for the project. Read the existing codebase
in this repo first, compare it against the "V1 Checklist" below, and produce:

1. An honest status report — what's actually built vs. stubbed vs. missing,
   based on the real code (not assumptions).
2. A prioritized checklist of what's left to reach v1.
3. Flag anywhere the existing code deviates from the design decisions below,
   so we can decide whether to keep the deviation or fix it.

## What this project is

Production-Risk PR Reviewer — an AI-assisted code review tool that flags
merge requests likely to introduce specific, known production-failure
patterns — not general code style, bugs, or best-practice nits (that's what
tools like CodeRabbit already do well). This tool is narrower and
evidence-grounded: it only flags a diff against a small, curated set of
failure-pattern classes derived from real, researched postmortems, with a
confidence score, and it explicitly abstains when it isn't confident rather
than guessing.

## Why this project exists (the actual motivation, keep this in mind for framing/README)

- Built as a personal side project to (a) demonstrate real AI-integration +
  production-engineering judgment for job applications, and (b) close a real
  skill gap: hands-on backend TypeScript and MCP-server development.
- Directly reuses research and design philosophy from the "Blast Radius"
  hackathon project (Forge the Future 2026 — Agentic Incident Response
  Agent): the same three real postmortems (CircleCI Nov 2021 bad-deploy
  regression, Allegro Jul 2018 connection-pool saturation, CircleCI Apr 2025
  config drift outside IaC) and the same core design philosophy:
  propose-only, human-approval — the tool never auto-blocks or auto-fixes,
  it only surfaces evidence-grounded findings for a human to judge.
- Also reuses a real personal incident: the author root-caused and fixed a
  production outage caused by Googlebot aggressively crawling a
  ~200,000-URL sitemap. This is exactly the kind of "diff introduces an
  unbounded crawl/loop/request pattern" failure class this tool should be
  able to flag.

## The five-filter bar this project must pass (used to reject other project ideas — keep applying this to scope decisions)

1. Solves a real problem (not a cloned tutorial pattern)
2. Integrates AI meaningfully (reasoning over curated evidence, not a single
   generic "review this code" prompt)
3. Shows production-level thinking (propose-only, confidence scoring,
   abstains when unsure, documents its own limitations)
4. Demonstrates business impact (even at small scale — real evaluation
   numbers, not vague claims)
5. Goes deep, not wide (a handful of well-understood failure patterns, not
   "reviews everything")

## Architecture decision: MCP-first (updated direction — supersedes the original webhook-bot-only plan)

Original plan was a webhook bot: MR opened → fetch diff → match against
patterns → LLM call → post MR comment automatically.

Updated direction (current): build this primarily as an MCP server that
exposes the failure-pattern-detection logic as a callable tool (e.g.,
`check_production_risk(diff)` or `review_pr(mr_url)`), invoked on-demand by
a human through Claude Code / Claude Desktop — e.g., "check this MR for
known production-risk patterns."

Why this is a better fit than a pure webhook bot:

- It is propose-only by construction — a human has to explicitly invoke it,
  rather than an automated bot commenting on every MR unprompted. This fits
  the "propose-only, human-approval" philosophy more precisely than a
  webhook bot does.
- It's more aligned with current agentic-tooling direction (MCP ecosystem),
  which is directly relevant to the job-search narrative.
- It still allows an optional webhook/CI-integration mode later (v2) if
  desired, but that is not the primary interface for v1.

## Source control platform: GitLab (decided — supersedes any earlier GitHub-first framing)

This project targets **GitLab**, not GitHub. The existing codebase already
has a working, previously-debugged GitLab integration
([backend/src/services/gitlab.service.ts](backend/src/services/gitlab.service.ts))
that fetches MR metadata and diffs via the GitLab REST API — that's the
platform actually in use day-to-day, so the brief is written around it
rather than adding a second, unused provider.

Plumbing decision: it's fine to consume the GitLab REST API directly (as
the existing `GitLabService` already does) for diff-fetching and
comment-posting boilerplate — that part is not the differentiator and
doesn't need to be reinvented. A GitLab MCP server can be substituted later
if one is worth adopting, but is not required for v1. The differentiator is
the pattern-matching + evidence-grounded reasoning + confidence/abstain
logic, which should be original, custom-built logic exposed as your own MCP
tool.

Known bit of prior art worth remembering: the GitLab
`/merge_requests/:iid/diffs` endpoint returns a raw array, not
`{diffs: [...]}` — this already bit a prior implementation in this repo and
is now handled correctly in `GitLabService`. Don't reintroduce the
wrapped-shape assumption if this code is touched or reused.

## Known limitation — must be documented, not hidden (this is itself a "production-level thinking" signal, don't skip it)

This tool reasons over a single diff in isolation. It cannot detect:

- Cross-MR interaction effects (e.g., MR #2 pushes cumulative load over a
  threshold that MR #1 quietly moved closer to)
- Gradual resource exhaustion across multiple merges
- Whole-system state (current connection pool headroom, current traffic
  patterns, etc.)

This is a limitation shared by every AI PR-review tool on the market
(CodeRabbit included) — none of them model cross-MR cumulative system
state. State this explicitly in the README as a stated non-goal for v1, not
as a silently missing feature. Note this is distinct from the existing
README's "no cross-file reasoning" limitation (single-diff blindness to the
rest of the codebase at a point in time) — both should be stated, since
they're different gaps.

Optional cheap mitigation for v2 (not required for v1): maintain a small
list of "risk-sensitive" files/configs (e.g., connection pool settings,
rate-limit configs, retry logic) — any MR touching those gets flagged for
mandatory human review regardless of AI confidence, purely because those
files/areas have caused real incidents before. This is a heuristic, not
real cross-MR reasoning — label it as such if built.

## Failure pattern set (target: 4-6 for v1 — done, 6/6)

Confirmed patterns, each with name, description, example code signature,
and source postmortem/incident — full detail in
[backend/src/patterns/failure-patterns.ts](backend/src/patterns/failure-patterns.ts):

1. Unbounded crawl/loop/request pattern — from the Googlebot ~200k-URL
   sitemap outage.
2. Connection-pool exhaustion / saturation — from Allegro (Jul 2018).
3. Config drift outside IaC — from CircleCI (Apr 2025).
4. Bad-deploy regression pattern — from CircleCI (Nov 2021).
5. Unbounded/unthrottled retry loop ("retry storm") — from GitHub's own
   postmortem of the August 17, 2026 outage
   ([github.blog](https://github.blog/news-insights/company-news/the-august-17-outage-and-the-work-ahead/)):
   a VS Code extension retried a failed auth-token refresh in a tight,
   unthrottled loop instead of backing off, driving the Copilot Token
   Service from ~7-9k RPS to 70-100k RPS and compounding a service-mesh
   capacity failure into a 7h47m outage.
6. Missing rate limiting / no circuit breaker on an internal service
   dependency — from Cloudflare's own postmortem of the September 12, 2025
   dashboard and API outage
   ([blog.cloudflare.com](https://blog.cloudflare.com/deep-dive-into-cloudflares-sept-12-dashboard-and-api-outage/)):
   a `useEffect` dependency-array bug caused a dashboard component to
   re-call an API on every render instead of once, and the downstream
   Tenant Service had no rate limit to absorb it, causing a ~75-minute
   outage. A rate limit was only added *during* incident response — it
   didn't exist beforehand.

**N+1 query pattern — researched, deliberately not added.** This was the
brief's own suggested 5th/6th pattern, but no real, named, dated postmortem
attributing a production outage specifically to N+1 queries turned up to
the same evidentiary bar as the six patterns above — a promising-looking
Sentry blog post turned out to be an anonymized hypothetical on closer
read, and a Mastodon GitHub issue/status-page incident's root cause traced
to a cache-storage regression, not confirmed N+1 queries. Per this
project's own "abstain when unsure" philosophy, better to leave this
pattern out until a real primary-source postmortem is found than to lower
the bar for one pattern while holding the rest to it. Revisit if a solid
source turns up.

## Tech stack (confirm against actual repo state — flag any mismatch)

- Backend/MCP server: Node.js + TypeScript (this is intentional — closing
  the "backend TypeScript" skill gap is a project goal, not incidental; do
  NOT build this in plain JavaScript)
- Database: PostgreSQL (intentional — closing the PostgreSQL skill gap;
  pairs with Prisma or Drizzle ORM if an ORM is used)
- LLM: Claude or OpenAI API — used for structured reasoning over diff +
  curated evidence, returning JSON (`pattern | confidence | reasoning | abstain`)
- GitLab integration: GitLab REST API (direct — see decision above), reusing
  the existing `GitLabService` where possible
- Deployment: should end up always-on and reachable (Render/Railway/Fly.io
  free tier), not just local dev, once past initial local dev — optional for
  v1 if the primary interface is MCP-only

## V1 Checklist (compare actual repo state against this — mark each done / partial / missing)

- [x] MCP server scaffolded, exposing a callable tool for MR/diff review —
      `review_merge_request` in
      [backend/src/mcp/server.ts](backend/src/mcp/server.ts), verified with
      a real stdio handshake. Still runs the pre-existing general-findings
      pipeline, not yet the pattern-matching/confidence/abstain logic below.
- [x] GitLab diff fetch (via GitLab REST API) — reused existing
      `GitLabService` as-is, no changes needed.
- [x] GitLab MR comment post capability (via GitLab REST API) —
      `GitLabService.createMergeRequestNote` plus a `post_production_risk_comment`
      MCP tool, deliberately kept separate from `check_production_risk` so
      posting is always an explicit second step, not a side effect of checking.
- [x] Postgres table of failure patterns — `failure_patterns` table via
      Prisma ([backend/prisma/schema.prisma](backend/prisma/schema.prisma)),
      seeded from
      [backend/src/patterns/failure-patterns.ts](backend/src/patterns/failure-patterns.ts)
      ([backend/prisma/seed.ts](backend/prisma/seed.ts)). Verified against a
      real local Postgres via docker-compose, not just typechecked.
- [x] Prompt + LLM call: diff + patterns in, structured JSON out (pattern,
      confidence, reasoning, or abstain) —
      [backend/src/services/production-risk.service.ts](backend/src/services/production-risk.service.ts)
      + [backend/src/utils/production-risk-prompt.ts](backend/src/utils/production-risk-prompt.ts),
      exposed as the `check_production_risk` MCP tool. Requires one
      assessment per pattern per batch, unknown pattern ids dropped, line
      numbers validated against real diff hunks.
- [x] Format JSON into a readable output (MR comment or MCP tool response) —
      [backend/src/utils/production-risk-comment.ts](backend/src/utils/production-risk-comment.ts)
      formats the JSON as Markdown for the `post_production_risk_comment` tool.
- [x] Confidence-threshold logic — stay silent / abstain below a set bar —
      `PRODUCTION_RISK_CONFIDENCE_THRESHOLD` env var (default 0.6), enforced
      server-side in `ProductionRiskService`, verified with both a
      below-threshold and an overridden-threshold real run.
- [ ] Error handling: huge diffs, LLM call failures, GitLab API rate limits
      — diff batching and per-batch try/catch exist (inherited from the
      earlier reviewer); GitLab API rate-limit handling specifically not
      addressed yet.
- [ ] Deployed somewhere always-on (if webhook/CI mode is also built) — not
      required if MCP-only for v1
- [ ] Evaluated against 10-15 real MRs with actual precision/recall/abstain
      numbers recorded
- [ ] README written: problem statement, architecture, failure-pattern list
      with sources, example output, evaluation numbers, and the "Known
      Limitations" section above

## What I need from you (Claude / Claude Code) right now

1. Look at the actual code in this repo.
2. Tell me honestly, item by item against the V1 checklist above, what's
   done, partial, or missing.
3. Flag any place the existing code uses plain JavaScript instead of
   TypeScript, or MongoDB instead of PostgreSQL, or a webhook-only design
   instead of the MCP-first direction — these are deviations from stated
   goals, not just implementation details, so surface them explicitly
   rather than silently going along with what's already there.
4. Give me a prioritized, concrete next-steps list to reach v1 from
   wherever we actually are.
