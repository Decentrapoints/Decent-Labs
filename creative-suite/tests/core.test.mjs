import test from "node:test";
import assert from "node:assert/strict";
import {
  mkdtempSync,
  rmSync,
  writeFileSync,
  readFileSync,
  existsSync,
} from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { Store } from "../server/store.mjs";
import { createApp } from "../server/app.mjs";
import { analyzeWav } from "../server/audio.mjs";
import { Bridge } from "../server/bridge.mjs";
import {
  seedScores,
  importScore,
  encodeScore,
  decodeScore,
  editScore,
  exportScore,
  summary,
} from "../shared/score.mjs";
const directory = () => mkdtempSync(join(tmpdir(), "dls-test-"));
const demo = seedScores()[0];
test("score edits preserve effects and repeats through Guitar Pro export/import", () => {
  const s = decodeScore(demo.source);
  s.masterBars[0].isRepeatStart = true;
  s.masterBars[3].repeatCount = 2;
  const original = s.tracks[0].staves[0].bars[1].voices[0].beats[0].notes[0];
  original.isPalmMute = true;
  const edited = editScore(encodeScore(s), {
    type: "note",
    bar: 0,
    beat: 0,
    note: 0,
    fret: 7,
  });
  const exported = importScore(exportScore(edited, "gp"));
  assert.equal(
    exported.tracks[0].staves[0].bars[0].voices[0].beats[0].notes[0].fret,
    7,
  );
  assert.equal(
    exported.tracks[0].staves[0].bars[1].voices[0].beats[0].notes[0].isPalmMute,
    true,
  );
  assert.equal(exported.masterBars[0].isRepeatStart, true);
  assert.equal(exported.masterBars[3].repeatCount, 2);
  assert.equal(
    summary(editScore(edited, { type: "tempo", value: 76 })).tempo,
    76,
  );
});
test("AlphaTex, score model, and standard MIDI exports are usable artifacts", () => {
  assert.equal(
    importScore(exportScore(demo.source, "alphatex")).title,
    "Glass",
  );
  assert.equal(
    importScore(exportScore(demo.source, "json")).masterBars.length,
    16,
  );
  const midi = Buffer.from(exportScore(demo.source, "mid"));
  assert.equal(midi.toString("ascii", 0, 4), "MThd");
  assert.equal(midi.readUInt16BE(8), 1);
  assert.ok(midi.length > 100);
  assert.throws(() => editScore(demo.source, { type: "note", fret: -1 }));
  assert.throws(() =>
    editScore(demo.source, { type: "tempo", value: Infinity }),
  );
  assert.throws(() => importScore(Buffer.from("garbage")));
});
test("SQLite revisions, user preferences and accounts survive restart", () => {
  const d = directory();
  let store = new Store(d);
  try {
    const owner = store.addUser("owner", "test-password-123"),
      guest = store.addUser("guest", "test-password-456", "guest");
    const s = store.score("demo-1");
    store.updateScore(
      s.id,
      1,
      editScore(s.source, { type: "tempo", value: 82 }),
      owner,
      "Tempo edit",
    );
    assert.throws(
      () => store.updateScore(s.id, 1, s.source, owner, "stale"),
      (e) => e.statusCode === 409,
    );
    store.setPreference(owner, s.id, { note: "private owner note" });
    assert.deepEqual(store.preference(guest, s.id), {});
    store.close();
    store = new Store(d);
    assert.equal(store.score(s.id).revision, 2);
    assert.equal(store.history(s.id).length, 2);
    assert.equal(store.preference(owner, s.id).note, "private owner note");
    assert.equal(store.login("owner", "test-password-123").user.role, "owner");
  } finally {
    store.close();
    rmSync(d, { recursive: true, force: true });
  }
});
export function wavFixture() {
  const n = 8000,
    b = Buffer.alloc(44 + n * 2);
  b.write("RIFF");
  b.writeUInt32LE(b.length - 8, 4);
  b.write("WAVEfmt ", 8);
  b.writeUInt32LE(16, 16);
  b.writeUInt16LE(1, 20);
  b.writeUInt16LE(1, 22);
  b.writeUInt32LE(8000, 24);
  b.writeUInt32LE(16000, 28);
  b.writeUInt16LE(2, 32);
  b.writeUInt16LE(16, 34);
  b.write("data", 36);
  b.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++)
    b.writeInt16LE(
      Math.round(Math.sin((i * 2 * Math.PI * 440) / 8000) * 16384),
      44 + i * 2,
    );
  return b;
}
test("WAV analysis measures sample peak/RMS and rejects malformed chunk sizes", () => {
  const wav = wavFixture(),
    a = analyzeWav(wav);
  assert.equal(a.duration, 1);
  assert.equal(a.channels, 1);
  assert.ok(Math.abs(a.measurements[0].peakDb + 6.02) < 0.03);
  assert.ok(Math.abs(a.measurements[0].rmsDb + 9.03) < 0.03);
  assert.equal(a.measurements[0].clippedSamples, 0);
  const corrupt = Buffer.from(wav);
  corrupt.writeUInt32LE(0xffffffff, 40);
  assert.throws(() => analyzeWav(corrupt), /Truncated/);
  assert.throws(() => analyzeWav(Buffer.alloc(44)), /PCM WAV/);
});
test("bridge queues once, rejects stale context, blocks crash leftovers, and validates receipts", () => {
  const d = directory(),
    bridge = new Bridge(d);
  try {
    assert.equal(bridge.context().connected, false);
    const c = {
      project: "session-test",
      revision: "7",
      observedAt: Date.now() / 1000,
      tracks: [{ id: "track-1" }],
    };
    writeFileSync(join(d, "context.json"), JSON.stringify(c));
    assert.throws(
      () =>
        bridge.queue({
          id: "a",
          resource: c.project,
          revision: "6",
          operation: { type: "play" },
        }),
      (e) => e.statusCode === 409,
    );
    assert.throws(
      () =>
        bridge.queue({
          id: "a",
          resource: c.project,
          revision: "7",
          operation: { type: "shell" },
        }),
      /Unsupported/,
    );
    bridge.queue({
      id: "a",
      resource: c.project,
      revision: "7",
      operation: { type: "mute", track: "track-1", value: true },
    });
    assert.ok(existsSync(join(d, "command-a.json")));
    assert.throws(
      () =>
        bridge.queue({
          id: "b",
          resource: c.project,
          revision: "7",
          operation: { type: "play" },
        }),
      (e) => e.statusCode === 409,
    );
    rmSync(join(d, "command-a.json"));
    writeFileSync(join(d, "processing-a.json"), "{}");
    assert.throws(
      () =>
        bridge.queue({
          id: "b",
          resource: c.project,
          revision: "7",
          operation: { type: "play" },
        }),
      /pending/,
    );
    writeFileSync(
      join(d, "receipt-a.json"),
      JSON.stringify({ id: "a", status: "applied" }),
    );
    assert.equal(bridge.receipt("a").status, "applied");
    writeFileSync(
      join(d, "context.json"),
      JSON.stringify({ ...c, observedAt: Date.now() / 1000 - 10 }),
    );
    assert.equal(bridge.context().connected, false);
  } finally {
    rmSync(d, { recursive: true, force: true });
  }
});
async function fixture(t) {
  const d = directory(),
    app = await createApp({
      dataDir: d,
      bridgeDir: join(d, "bridge"),
      serveUi: false,
    });
  app.store.addUser("owner", "test-password-123");
  app.store.addUser("guest", "test-password-456", "guest");
  t.after(async () => {
    await app.close();
    rmSync(d, { recursive: true, force: true });
  });
  const login = async (name, password) =>
    (
      await app.inject({
        method: "POST",
        url: "/api/auth/login",
        payload: { name, password },
      })
    ).headers["set-cookie"].split(";")[0];
  const owner = await login("owner", "test-password-123"),
    guest = await login("guest", "test-password-456");
  const request = (url, method = "GET", payload, auth = owner) =>
    app.inject({ url, method, payload, headers: { cookie: auth } });
  return { app, d, request, owner, guest };
}
test("authentication, guest permissions, JSON-only requests and CSRF origin checks", async (t) => {
  const { app, request, guest } = await fixture(t);
  assert.equal((await app.inject("/api/scores")).statusCode, 401);
  assert.equal((await request("/api/scores")).json().length, 3);
  assert.equal(
    (
      await request(
        "/api/actions/prepare",
        "POST",
        {
          app: "tabs",
          resource: "demo-1",
          operation: { type: "tempo", value: 80 },
        },
        guest,
      )
    ).statusCode,
    403,
  );
  assert.equal(
    (
      await request(
        "/api/scores/demo-1",
        "PATCH",
        { revision: 1, operation: { type: "tempo", value: 80 } },
        guest,
      )
    ).statusCode,
    403,
  );
  const attack = await app.inject({
    url: "/api/auth/login",
    method: "POST",
    headers: { origin: "https://hostile.example" },
    payload: { name: "owner", password: "test-password-123" },
  });
  assert.equal(attack.statusCode, 403);
  assert.equal(
    (
      await app.inject({
        url: "/api/auth/login",
        method: "POST",
        headers: { "content-type": "text/plain" },
        payload: "{}",
      })
    ).statusCode,
    415,
  );
  await request("/api/scores/demo-1/preference", "PUT", { note: "mine" });
  assert.equal(
    (await request("/api/scores/demo-1", "GET", undefined, guest)).json()
      .preference.note,
    undefined,
  );
  await request("/api/auth/logout", "POST", {});
  assert.equal((await request("/api/scores")).statusCode, 401);
});
test("reviewed score actions are atomic, idempotent, stale-aware and restorable", async (t) => {
  const { request } = await fixture(t);
  const prepare = async (value) =>
    (
      await request("/api/actions/prepare", "POST", {
        app: "tabs",
        resource: "demo-1",
        operation: { type: "tempo", value },
      })
    ).json();
  const a = await prepare(86),
    stale = await prepare(88);
  assert.equal(
    (await request(`/api/actions/${a.id}/apply`, "POST", {})).json().status,
    "applied",
  );
  assert.equal(
    (await request(`/api/actions/${a.id}/apply`, "POST", {})).json().receipt
      .revision,
    2,
  );
  assert.equal((await request("/api/scores/demo-1")).json().revision, 2);
  assert.equal(
    (await request(`/api/actions/${stale.id}/apply`, "POST", {})).statusCode,
    409,
  );
  const restore = await request("/api/scores/demo-1/restore", "POST", {
    revision: 2,
    target: 1,
  });
  assert.equal(restore.json().revision, 3);
  assert.equal(restore.json().tempo, 92);
  const cancelled = await prepare(90);
  await request(`/api/actions/${cancelled.id}/cancel`, "POST", {});
  assert.equal(
    (await request(`/api/actions/${cancelled.id}/apply`, "POST", {})).json()
      .status,
    "cancelled",
  );
});
test("practice, score handoffs and local Satsu templates stay scoped to their user", async (t) => {
  const { request, guest } = await fixture(t);
  await request(
    "/api/practice",
    "POST",
    { scoreId: "demo-1", seconds: 90, speed: 0.7 },
    guest,
  );
  assert.equal((await request("/api/practice")).json().length, 0);
  assert.equal(
    (await request("/api/practice", "GET", undefined, guest)).json()[0].seconds,
    90,
  );
  const handoff = (
    await request("/api/scores/demo-1/handoff", "POST", {})
  ).json();
  assert.equal(handoff.payload.revision, 1);
  assert.equal(
    (await request(`/api/artifacts/${handoff.id}/midi`)).rawPayload.toString(
      "ascii",
      0,
      4,
    ),
    "MThd",
  );
  assert.equal(
    (
      await request(
        `/api/artifacts/${handoff.id}/midi`,
        "GET",
        undefined,
        guest,
      )
    ).statusCode,
    404,
  );
  const advice = await request("/api/satsu/ask", "POST", {
    app: "tabs",
    resource: "demo-1",
    prompt: "Plan my practice",
  });
  assert.equal(advice.json().payload.mode, "template");
  assert.equal(advice.json().payload.context.resource, "demo-1");
  assert.equal(advice.json().payload.context.revision, 1);
  assert.equal(
    (await request("/api/capabilities")).json().protocol,
    "dls-action/1",
  );
});
test("REAPER action receives host execution status and repeat apply does not requeue", async (t) => {
  const { app, d, request } = await fixture(t);
  const context = {
    project: "test",
    revision: "9",
    observedAt: Date.now() / 1000,
    tracks: [{ id: "guitar" }],
  };
  writeFileSync(join(d, "bridge/context.json"), JSON.stringify(context));
  const prepared = await request("/api/actions/prepare", "POST", {
      app: "studio",
      operation: { type: "mute", track: "guitar", value: true },
    }),
    a = prepared.json();
  assert.equal(prepared.statusCode, 200);
  app.store.db
    .prepare("UPDATE actions SET created=? WHERE id=?")
    .run(new Date(Date.now() - 120000).toISOString(), a.id);
  assert.equal(
    (await request(`/api/actions/${a.id}/apply`, "POST", {})).json().status,
    "queued",
  );
  assert.equal((await request(`/api/actions/${a.id}`)).json().status, "queued");
  app.store.finishAction(a.id, "queued", {
    queuedAt: new Date(Date.now() - 61000).toISOString(),
  });
  assert.equal(
    (await request(`/api/actions/${a.id}`)).json().status,
    "unknown",
  );
  assert.equal(
    (await request(`/api/actions/${a.id}/apply`, "POST", {})).json().status,
    "unknown",
  );
  writeFileSync(
    join(d, `bridge/receipt-${a.id}.json`),
    JSON.stringify({
      id: a.id,
      status: "applied",
      message: "Executed in REAPER",
    }),
  );
  assert.equal(
    (await request(`/api/actions/${a.id}`)).json().status,
    "applied",
  );
});
