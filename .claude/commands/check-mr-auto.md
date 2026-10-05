---
description: Check a GitLab MR for production-risk patterns via the automated LLM path (uses LLM_API_KEY, not agent reasoning)
argument-hint: <projectId> <mergeRequestIid>
---

Parse `$ARGUMENTS` as two values: `projectId` and `mergeRequestIid` (e.g. `82 1142`). If either is missing, ask for it before continuing.

Unlike `/check-mr`, this calls the fully automated path — the backend's own configured LLM provider (`LLM_BASE_URL`/`LLM_MODEL`/`LLM_API_KEY` in `backend/.env`) does the pattern-matching reasoning itself, not you. Use this to verify the automated/unattended path actually works end to end (e.g. after changing `.env`'s LLM provider), or when you specifically want the configured model's own judgment instead of your own.

1. Call the `check_production_risk` MCP tool (from the `pr-reviewer` server) with `projectId` and `mergeRequestIid`.
2. If it fails with a `429`/`503`/quota or overload error, say so plainly — don't silently retry in a loop. Mention that `/check-mr` (the agent-reasoned path) works regardless of LLM quota/credits, as a fallback.
3. Present the result as a short table: pattern name, verdict (finding/abstain), confidence if any, and a one-line reason. Call out anything genuinely flagged (non-abstain) clearly at the top.
4. Do **not** call `post_production_risk_comment` automatically — only do that if explicitly asked afterward, since posting writes a real comment to the MR.

If it fails because Postgres isn't reachable, tell the user to run `docker compose up -d postgres` from the repo root first, rather than guessing at the cause.
