---
description: Check a GitLab MR for known production-risk patterns (agent-reasoned, no LLM API key needed)
argument-hint: <projectId> <mergeRequestIid>
---

Parse `$ARGUMENTS` as two values: `projectId` and `mergeRequestIid` (e.g. `82 1142`). If either is missing, ask for it before continuing.

Then, using the `pr-reviewer` MCP server's tools:

1. Call `prepare_production_risk_check` with `projectId` and `mergeRequestIid`. This fetches the real diff and the curated failure-pattern set from `git.aurumproptech.in` — no LLM call is made here.
2. Read the returned `instructions` and `prompt` carefully. Reason over the diff yourself, pattern by pattern, exactly as the instructions describe — evidence-grounded, abstain when unsure, never invent a pattern outside the given `patternIds`.
3. Call `finalize_production_risk_check` with `projectId`, `mergeRequestIid`, and your own `assessments` array (one entry per pattern id, matching the schema in the instructions). This validates your reasoning the same way an LLM's output would be validated — unknown pattern ids dropped, line numbers checked against the real diff, low confidence downgraded to abstain.
4. Present the final result as a short table: pattern name, verdict (finding/abstain), confidence if any, and a one-line reason. Call out anything genuinely flagged (non-abstain) clearly at the top.
5. Do **not** call `post_production_risk_comment` automatically — only do that if explicitly asked afterward, since posting writes a real comment to the MR.

If `prepare_production_risk_check` fails because Postgres isn't reachable, tell the user to run `docker compose up -d postgres` from the repo root first, rather than guessing at the cause.
