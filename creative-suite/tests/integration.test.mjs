import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawn } from "node:child_process";
import { DatabaseSync } from "node:sqlite";
import { createServer } from "node:http";
import { createApp } from "../server/app.mjs";
import { DlsClient } from "../sdk/dls-client.mjs";
test("authenticated owners and guests can download the exact self-contained native theme", async (t) => {
  const d = mkdtempSync(join(tmpdir(), "dls-theme-"));
  const app = await createApp({
    dataDir: d,
    bridgeDir: join(d, "bridge"),
    serveUi: false,
  });
  app.store.addUser("theme-guest", "theme-test-password-123", "guest");
  t.after(async () => {
    await app.close();
    rmSync(d, { recursive: true, force: true });
  });
  assert.equal(
    (await app.inject({ method: "GET", url: "/api/reaper/theme" })).statusCode,
    401,
  );
  const login = await app.inject({
    method: "POST",
    url: "/api/auth/login",
    payload: { name: "theme-guest", password: "theme-test-password-123" },
  });
  const cookie = login.headers["set-cookie"].split(";")[0];
  const result = await app.inject({
    method: "GET",
    url: "/api/reaper/theme",
    headers: { cookie },
  });
  assert.equal(result.statusCode, 200);
  assert.equal(result.headers["content-type"], "application/zip");
  assert.match(
    result.headers["content-disposition"],
    /DLS Satsu\.ReaperThemeZip/,
  );
  assert.deepEqual(
    result.rawPayload,
    readFileSync(
      new URL("../reaper/theme/dist/DLS Satsu.ReaperThemeZip", import.meta.url),
    ),
  );
});
test("shared DLS client discovers capabilities and carries score actions through to receipts", async (t) => {
  const d = mkdtempSync(join(tmpdir(), "dls-sdk-")),
    app = await createApp({
      dataDir: d,
      bridgeDir: join(d, "bridge"),
      serveUi: false,
    });
  app.store.addUser("owner", "sdk-test-password-123");
  await app.listen({ host: "127.0.0.1", port: 0 });
  t.after(async () => {
    await app.close();
    rmSync(d, { recursive: true, force: true });
  });
  const client = new DlsClient(`http://127.0.0.1:${app.server.address().port}`);
  await client.login("owner", "sdk-test-password-123");
  assert.equal((await client.capabilities()).apps.length, 2);
  const score = await client.score("demo-1"),
    action = await client.prepare("tabs", score.id, {
      type: "tempo",
      value: 81,
    });
  assert.equal(action.revision, String(score.revision));
  await client.applyReviewed(action.id);
  assert.equal((await client.receipt(action.id)).status, "applied");
  assert.equal((await client.score(score.id)).tempo, 81);
  await client.logout();
  await assert.rejects(
    () => client.capabilities(),
    (e) => e.status === 401,
  );
});
test("backup command snapshots live scores and accounts and can be opened on another host", async (t) => {
  const d = mkdtempSync(join(tmpdir(), "dls-backup-")),
    app = await createApp({
      dataDir: join(d, "data"),
      bridgeDir: join(d, "bridge"),
      serveUi: false,
    });
  app.store.addUser("owner", "backup-test-password-123");
  app.store.setPreference(
    { id: app.store.db.prepare("SELECT id FROM users").get().id },
    "demo-1",
    { note: "Restore me" },
  );
  t.after(async () => {
    await app.close();
    rmSync(d, { recursive: true, force: true });
  });
  await new Promise((resolveRun, reject) => {
    const child = spawn(
      process.execPath,
      ["scripts/backup.mjs", join(d, "backup")],
      {
        cwd: resolve("."),
        env: { ...process.env, DLS_DATA_DIR: join(d, "data") },
        stdio: "pipe",
      },
    );
    let error = "";
    child.stderr.on("data", (b) => (error += b));
    child.on("error", reject);
    child.on("exit", (code) =>
      code === 0 ? resolveRun() : reject(new Error(error)),
    );
  });
  const backup = new DatabaseSync(join(d, "backup/dls.sqlite"), {
    readOnly: true,
  });
  try {
    assert.equal(
      backup.prepare("SELECT count(*) AS count FROM scores").get().count,
      3,
    );
    assert.equal(
      backup.prepare("SELECT data FROM preferences").get().data,
      '{"note":"Restore me"}',
    );
    assert.equal(
      backup.prepare("PRAGMA integrity_check").get().integrity_check,
      "ok",
    );
  } finally {
    backup.close();
  }
  assert.equal(
    JSON.parse(readFileSync(join(d, "backup/manifest.json"))).version,
    1,
  );
});
test("configured Satsu route receives bounded score/session context and returns genuine model advice", async (t) => {
  const saved = {
    SATSU_BASE_URL: process.env.SATSU_BASE_URL,
    SATSU_MODEL: process.env.SATSU_MODEL,
    SATSU_API_KEY: process.env.SATSU_API_KEY,
  };
  let received;
  const provider = createServer(async (req, res) => {
    let bytes = "";
    for await (const chunk of req) bytes += chunk;
    received = JSON.parse(bytes);
    res.setHeader("Content-Type", "application/json");
    res.end(
      JSON.stringify({
        choices: [
          { message: { content: "Focus on the second phrase at 60% speed." } },
        ],
      }),
    );
  });
  await new Promise((resolve) => provider.listen(0, "127.0.0.1", resolve));
  process.env.SATSU_BASE_URL = `http://127.0.0.1:${provider.address().port}/v1`;
  process.env.SATSU_MODEL = "test-local-model";
  delete process.env.SATSU_API_KEY;
  const d = mkdtempSync(join(tmpdir(), "dls-satsu-")),
    app = await createApp({
      dataDir: d,
      bridgeDir: join(d, "bridge"),
      serveUi: false,
    });
  app.store.addUser("owner", "satsu-test-password-123");
  t.after(async () => {
    await app.close();
    await new Promise((resolve) => provider.close(resolve));
    for (const [key, value] of Object.entries(saved))
      value === undefined
        ? delete process.env[key]
        : (process.env[key] = value);
    rmSync(d, { recursive: true, force: true });
  });
  const login = await app.inject({
      url: "/api/auth/login",
      method: "POST",
      payload: { name: "owner", password: "satsu-test-password-123" },
    }),
    cookie = login.headers["set-cookie"].split(";")[0];
  const response = await app.inject({
    url: "/api/satsu/ask",
    method: "POST",
    headers: { cookie },
    payload: { app: "studio", resource: "demo-1", prompt: "Help with my song" },
  });
  assert.equal(response.json().payload.mode, "model");
  assert.equal(received.model, "test-local-model");
  const context = JSON.parse(received.messages[1].content).context;
  assert.equal(context.app, "studio");
  assert.equal(context.relatedScore.title, "Glass");
  assert.equal(context.connected, false);
  assert.ok(!JSON.stringify(context).includes("password"));
  assert.ok(!context.relatedScore.source);
});
test("score import preview acceptance is atomic and repeat requests return the same score", async (t) => {
  const d = mkdtempSync(join(tmpdir(), "dls-import-")),
    app = await createApp({
      dataDir: d,
      bridgeDir: join(d, "bridge"),
      serveUi: false,
    });
  const user = app.store.addUser("owner", "import-test-password-123");
  t.after(async () => {
    await app.close();
    rmSync(d, { recursive: true, force: true });
  });
  const login = app.store.login(user.name, "import-test-password-123"),
    cookie = `dls_session=${login.token}`;
  const request = (url, payload, headers = {}) =>
    app.inject({
      url,
      method: "POST",
      payload,
      headers: { cookie, ...headers },
    });
  const boundary = "DLSFixture",
    raw = Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="idea.tex"\r\nContent-Type: text/plain\r\n\r\n\\title "Import fixture" . 0.6.4 2.5.4 4.4.4 2.5.4\r\n--${boundary}--\r\n`,
    );
  const preview = await request("/api/imports", raw, {
    "content-type": `multipart/form-data; boundary=${boundary}`,
  });
  assert.equal(preview.statusCode, 200);
  const a = (
      await request(`/api/imports/${preview.json().id}/accept`, {})
    ).json(),
    b = (await request(`/api/imports/${preview.json().id}/accept`, {})).json();
  assert.equal(a.id, b.id);
  assert.equal(app.store.listScores(user).length, 4);
  assert.equal(a.provenance.kind, "import");
});
