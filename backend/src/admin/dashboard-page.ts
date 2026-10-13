// Self-contained dashboard for the project-token registry. Served at /admin by
// server.ts with a per-request CSP nonce. All dynamic content is written with
// textContent / createElement (never innerHTML), so a hostile project name
// can't inject markup.
export function renderDashboardPage(nonce: string): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Project tokens</title>
<style nonce="${nonce}">
  :root { --bg:#f6f7f9; --card:#fff; --text:#1c2230; --muted:#667085; --line:#e4e7ec; --accent:#2457d6; --danger:#c0392b; --warn:#9a6700; --warnbg:#fff4d6; --ok:#1a7f4b; }
  @media (prefers-color-scheme: dark) { :root { --bg:#0f1218; --card:#171b24; --text:#e8ebf2; --muted:#9aa3b5; --line:#2a3040; --accent:#6c93ff; --danger:#ff7b6b; --warn:#f0c14b; --warnbg:#3a2f10; --ok:#4cc38a; } }
  * { box-sizing: border-box; }
  body { margin:0; background:var(--bg); color:var(--text); font:15px/1.5 system-ui, -apple-system, sans-serif; }
  main { max-width: 920px; margin: 0 auto; padding: 32px 16px 64px; }
  h1 { font-size: 22px; margin: 0 0 4px; }
  p.sub { color: var(--muted); margin: 0 0 24px; }
  .card { background: var(--card); border: 1px solid var(--line); border-radius: 12px; padding: 18px; margin-bottom: 18px; }
  .card h2 { font-size: 15px; margin: 0 0 12px; }
  label { display:block; font-size: 13px; color: var(--muted); margin-bottom: 4px; }
  input { width: 100%; padding: 9px 11px; border: 1px solid var(--line); border-radius: 8px; background: var(--bg); color: var(--text); font: inherit; }
  .row { display: grid; grid-template-columns: 1fr 1fr auto; gap: 12px; align-items: end; }
  .row.admin { grid-template-columns: 1fr auto; }
  @media (max-width: 640px) { .row, .row.admin { grid-template-columns: 1fr; } }
  button { padding: 9px 14px; border: 1px solid var(--line); border-radius: 8px; background: var(--card); color: var(--text); font: inherit; cursor: pointer; }
  button.primary { background: var(--accent); border-color: var(--accent); color: #fff; }
  button.danger { color: var(--danger); }
  button:disabled { opacity: .5; cursor: default; }
  table { width: 100%; border-collapse: collapse; }
  th, td { text-align: left; padding: 10px 8px; border-bottom: 1px solid var(--line); vertical-align: top; }
  th { font-size: 12px; color: var(--muted); font-weight: 600; text-transform: uppercase; letter-spacing: .04em; }
  td.actions { white-space: nowrap; text-align: right; }
  td.actions button { margin-left: 6px; }
  .path { color: var(--muted); font-size: 13px; }
  .mono { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 13px; }
  .badge { display:inline-block; padding: 1px 8px; border-radius: 999px; border: 1px solid var(--line); font-size: 12px; margin: 0 4px 4px 0; }
  .badge.warn { background: var(--warnbg); color: var(--warn); border-color: transparent; font-weight: 600; }
  .msg { margin-top: 10px; font-size: 14px; min-height: 20px; }
  .msg.err { color: var(--danger); } .msg.ok { color: var(--ok); }
  .banner { background: var(--warnbg); color: var(--warn); border-radius: 8px; padding: 10px 12px; margin-bottom: 14px; display: none; }
  .empty { color: var(--muted); padding: 14px 0 4px; }
  .note { color: var(--muted); font-size: 13px; margin-top: 10px; }
</style>
</head>
<body>
<main>
  <h1>Project tokens</h1>
  <p class="sub">One GitLab token per project, stored encrypted. The token itself is never shown again after you save it.</p>

  <div class="card">
    <h2>Admin access</h2>
    <div class="row admin">
      <div><label for="admin">Admin token (ADMIN_TOKEN from backend/.env)</label><input id="admin" type="password" autocomplete="off"></div>
      <button id="connect" class="primary" type="button">Connect</button>
    </div>
    <div id="adminMsg" class="msg"></div>
  </div>

  <div id="banner" class="banner"></div>

  <div class="card">
    <h2>Add or replace a token</h2>
    <div class="row">
      <div><label for="project">Project (numeric ID or path, e.g. 85 or proptech/Pulse-Backend)</label><input id="project" autocomplete="off"></div>
      <div><label for="token">GitLab token</label><input id="token" type="password" autocomplete="off"></div>
      <button id="add" class="primary" type="button">Validate &amp; save</button>
    </div>
    <div id="addMsg" class="msg"></div>
    <div class="note">The token is checked against GitLab first and must be able to read that project. Prefer <span class="mono">read_api</span> scope: tokens with <span class="mono">api</span> can also write (e.g. post MR comments) and are flagged below.</div>
  </div>

  <div class="card">
    <h2>Stored tokens</h2>
    <div id="list"></div>
  </div>
</main>

<script nonce="${nonce}">
(function () {
  var $ = function (id) { return document.getElementById(id); };
  var KEY = "pr-reviewer-admin-token";
  var adminInput = $("admin");
  adminInput.value = sessionStorage.getItem(KEY) || "";

  function say(el, text, kind) { el.textContent = text || ""; el.className = "msg" + (kind ? " " + kind : ""); }

  function api(method, path, body) {
    return fetch("/api/admin" + path, {
      method: method,
      headers: { "Content-Type": "application/json", "X-Admin-Token": adminInput.value },
      body: body ? JSON.stringify(body) : undefined
    }).then(function (res) {
      if (res.status === 204) return null;
      return res.json().then(function (data) {
        if (!res.ok) { var e = new Error(data.error || "Request failed"); e.status = res.status; throw e; }
        return data;
      });
    });
  }

  function cell(tr, text, cls) { var td = document.createElement("td"); if (cls) td.className = cls; td.textContent = text; tr.appendChild(td); return td; }

  function render(data) {
    var banner = $("banner");
    if (!data.encryptionConfigured) {
      banner.style.display = "block";
      banner.textContent = "TOKEN_ENCRYPTION_KEY is not set, so new tokens can't be saved. Run: openssl rand -base64 32, put it in backend/.env, restart the backend.";
    } else { banner.style.display = "none"; }

    var list = $("list");
    list.textContent = "";
    if (!data.tokens.length) { var e = document.createElement("div"); e.className = "empty"; e.textContent = "No tokens yet. Projects without one fall back to GITLAB_TOKEN."; list.appendChild(e); return; }

    var table = document.createElement("table");
    var head = document.createElement("tr");
    ["Project", "ID", "Token", "Scopes", "Added", ""].forEach(function (h) { var th = document.createElement("th"); th.textContent = h; head.appendChild(th); });
    table.appendChild(head);

    data.tokens.forEach(function (t) {
      var tr = document.createElement("tr");
      var proj = document.createElement("td");
      var name = document.createElement("div"); name.textContent = t.projectName;
      var path = document.createElement("div"); path.className = "path"; path.textContent = t.projectPath;
      proj.appendChild(name); proj.appendChild(path); tr.appendChild(proj);
      cell(tr, t.gitlabProjectId, "mono");
      cell(tr, "\\u2022\\u2022\\u2022\\u2022" + t.tokenHint, "mono");
      var sc = document.createElement("td");
      if (t.scopes) { t.scopes.forEach(function (s) { var b = document.createElement("span"); b.className = "badge"; b.textContent = s; sc.appendChild(b); }); }
      else { sc.textContent = "unknown"; sc.className = "path"; }
      if (t.writeCapable) { var w = document.createElement("span"); w.className = "badge warn"; w.textContent = "write-capable"; sc.appendChild(w); }
      tr.appendChild(sc);
      cell(tr, new Date(t.createdAt).toLocaleDateString(), "path");

      var act = document.createElement("td"); act.className = "actions";
      var test = document.createElement("button"); test.type = "button"; test.textContent = "Test";
      var del = document.createElement("button"); del.type = "button"; del.className = "danger"; del.textContent = "Remove";
      test.addEventListener("click", function () {
        test.disabled = true; test.textContent = "Testing\\u2026";
        api("POST", "/project-tokens/" + t.id + "/test").then(function (r) { say($("addMsg"), t.projectPath + ": " + r.message, r.ok ? "ok" : "err"); })
          .catch(function (e) { say($("addMsg"), e.message, "err"); })
          .then(function () { test.disabled = false; test.textContent = "Test"; });
      });
      del.addEventListener("click", function () {
        if (!confirm("Remove the stored token for " + t.projectPath + "?")) return;
        api("DELETE", "/project-tokens/" + t.id).then(load).catch(function (e) { say($("addMsg"), e.message, "err"); });
      });
      act.appendChild(test); act.appendChild(del); tr.appendChild(act);
      table.appendChild(tr);
    });
    list.appendChild(table);
  }

  function load() {
    return api("GET", "/project-tokens").then(function (data) { say($("adminMsg"), "Connected.", "ok"); render(data); })
      .catch(function (e) { $("list").textContent = ""; say($("adminMsg"), e.message, "err"); });
  }

  $("connect").addEventListener("click", function () { sessionStorage.setItem(KEY, adminInput.value); load(); });

  $("add").addEventListener("click", function () {
    var btn = $("add"); btn.disabled = true; say($("addMsg"), "Validating against GitLab\\u2026");
    api("POST", "/project-tokens", { project: $("project").value, token: $("token").value })
      .then(function (t) { $("token").value = ""; $("project").value = ""; say($("addMsg"), "Saved token for " + t.projectPath + ".", "ok"); return load(); })
      .catch(function (e) { say($("addMsg"), e.message, "err"); })
      .then(function () { btn.disabled = false; });
  });

  if (adminInput.value) load();
})();
</script>
</body>
</html>`;
}
