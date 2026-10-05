// Curated production-risk failure patterns. See PROJECT_BRIEF.md for the
// project this feeds into: a diff gets checked against this set (not a
// generic "review this code" prompt) — each pattern here is grounded in a
// real, named postmortem, not a guess at what "could" go wrong.
//
// `exampleSignature` for patterns 1-4 was authored now, for use by the
// pattern-matching prompt — it was not sourced from the original incident's
// actual code (that level of detail wasn't part of this research pass).
// Patterns 5-6 were researched end-to-end for this file, including their
// example signatures.
//
// This is a static seed list, not the Postgres table described in the V1
// checklist — it exists so that table has real data to load once it's built.

export interface FailurePattern {
  id: string;
  name: string;
  description: string;
  exampleSignature: string;
  source: {
    name: string;
    date: string;
    url?: string;
  };
}

export const FAILURE_PATTERNS: FailurePattern[] = [
  {
    id: "unbounded-crawl-loop",
    name: "Unbounded crawl/loop/request pattern",
    description:
      "Code that issues requests (or does work) proportional to an external, " +
      "unbounded input — e.g. a sitemap, a paginated API, a user-controlled " +
      "list — with no cap on total count, concurrency, or rate. A crawler or " +
      "batch job that looks fine in testing can generate an unbounded burst " +
      "of load once it runs against the real, much larger input.",
    exampleSignature:
      "A loop or recursive fetch driven by an external count (e.g. `for (const url of sitemap.urls) await fetch(url)`) " +
      "with no concurrency limit, no rate limit, and no upper bound on `sitemap.urls.length`.",
    source: {
      name: "Personal incident: production outage from Googlebot aggressively crawling a ~200,000-URL sitemap",
      date: "undated (personal incident, author-reported)",
    },
  },
  {
    id: "connection-pool-exhaustion",
    name: "Connection-pool exhaustion / saturation",
    description:
      "A change that increases per-request connection usage, removes a " +
      "connection-release path, or raises concurrency without a matching " +
      "increase in pool size — eventually every connection is checked out " +
      "and new requests queue or fail, even though the underlying resource " +
      "(DB, cache, upstream service) itself isn't overloaded.",
    exampleSignature:
      "A code path that acquires a connection/client from a pool without a `finally`/`using` release, " +
      "or a new call site added inside an existing request that opens an additional connection instead of reusing the request-scoped one.",
    source: {
      name: "Allegro — connection-pool saturation incident",
      date: "July 2018",
    },
  },
  {
    id: "config-drift-outside-iac",
    name: "Config drift outside IaC",
    description:
      "A production configuration change made outside the infrastructure-" +
      "as-code source of truth (a manual console edit, a hotfix applied " +
      "directly, a config pushed by a separate out-of-band tool) that IaC " +
      "doesn't know about — so a later, unrelated IaC apply silently reverts " +
      "it, reintroducing the original problem.",
    exampleSignature:
      "A diff that edits a config value in a place other than the repo's IaC source (a runbook doing a manual " +
      "console/API change, a script that patches config directly) instead of through the IaC pipeline.",
    source: {
      name: "CircleCI — config drift outside IaC incident",
      date: "April 2025",
    },
  },
  {
    id: "bad-deploy-regression",
    name: "Bad-deploy regression pattern",
    description:
      "A deploy that reintroduces a previously-fixed bug or regresses a " +
      "previously-tuned setting — typically because a rollback, a stale " +
      "branch merge, or a config default reset carried old, wrong state " +
      "back into production without anyone noticing it was a regression.",
    exampleSignature:
      "A diff that reverts, or merges over, a change whose commit message/PR indicates it was itself a fix for a prior incident " +
      "(e.g. re-introducing a removed guard clause, resetting a tuned timeout/retry value back to a library default).",
    source: {
      name: "CircleCI — bad-deploy regression incident",
      date: "November 2021",
    },
  },
  {
    id: "unbounded-retry-loop",
    name: "Unbounded/unthrottled retry loop (\"retry storm\")",
    description:
      "A client that retries a failed call (timeout, 401, 5xx) without " +
      "exponential backoff, jitter, a max-attempt cap, or a circuit " +
      "breaker. Under a real upstream failure, every affected client " +
      "retries in a tight loop simultaneously, multiplying load on the " +
      "already-struggling dependency and turning a partial failure into a " +
      "wider outage.",
    exampleSignature:
      "A retry-on-failure loop with no backoff/jitter/cap, e.g. `while (true) { try { await refreshToken(); break; } catch { continue; } }`, " +
      "or a retry wrapper whose only failure handling is \"call again immediately.\"",
    source: {
      name: "GitHub — August 17 outage postmortem",
      date: "2026-08-17",
      url: "https://github.blog/news-insights/company-news/the-august-17-outage-and-the-work-ahead/",
    },
  },
  {
    id: "missing-rate-limiting",
    name: "Missing rate limiting / no circuit breaker on an internal service dependency",
    description:
      "A code path that can call a downstream service an unbounded or " +
      "much-larger-than-intended number of times — often from a bug " +
      "elsewhere (e.g. an effect/watcher re-firing every render) — with no " +
      "rate limit, debounce, or circuit breaker on the calling side or the " +
      "callee protecting against it. The caller ends up self-inflicting a " +
      "denial-of-service on its own dependency.",
    exampleSignature:
      "An effect/watcher/subscription whose dependency array contains a non-memoized object/array/function literal " +
      "(recreated every render), paired with a network call inside that effect and no rate limiting on the callee it hits.",
    source: {
      name: "Cloudflare — dashboard and API outage postmortem",
      date: "2025-09-12",
      url: "https://blog.cloudflare.com/deep-dive-into-cloudflares-sept-12-dashboard-and-api-outage/",
    },
  },
];
