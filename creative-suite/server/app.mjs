import Fastify from "fastify";
import multipart from "@fastify/multipart";
import staticFiles from "@fastify/static";
import { resolve, join } from "node:path";
import { existsSync, createReadStream } from "node:fs";
import { createHash } from "node:crypto";
import { Store, hashToken } from "./store.mjs";
import { Bridge, validateCommand } from "./bridge.mjs";
import { analyzeWav } from "./audio.mjs";
import { askSatsu, satsuStatus } from "./satsu.mjs";
import { parseImport } from "./import.mjs";
import {
  editScore,
  importScore,
  encodeScore,
  exportScore,
  summary,
  fail,
  integer,
} from "../shared/score.mjs";

const tokenOf = (req) =>
  req.headers.cookie
    ?.split(";")
    .map((x) => x.trim())
    .find((x) => x.startsWith("dls_session="))
    ?.slice(12);
const owner = (req) => {
  if (req.user?.role !== "owner")
    fail("An owner account is required for this action.", 403);
};
const body = (req) =>
  req.body && typeof req.body === "object"
    ? req.body
    : fail("JSON body required");
const text = (v, max = 160) => {
  if (typeof v !== "string" || v.length > max) fail("Invalid text");
  return v;
};
export async function createApp({
  dataDir = resolve(process.env.DLS_DATA_DIR || "data"),
  bridgeDir = resolve(process.env.DLS_BRIDGE_DIR || "bridge-runtime"),
  serveUi = true,
} = {}) {
  const app = Fastify({
    logger: false,
    bodyLimit: 9 * 1024 * 1024,
    requestTimeout: 60000,
  });
  const store = new Store(dataDir),
    bridge = new Bridge(bridgeDir);
  app.decorate("store", store);
  app.decorate("bridge", bridge);
  app.addHook("onClose", () => store.close());
  const failures = new Map();
  app.addHook("onRequest", async (req, reply) => {
    reply
      .header("X-Content-Type-Options", "nosniff")
      .header("Referrer-Policy", "same-origin")
      .header("X-Frame-Options", "DENY");
    reply.header(
      "Content-Security-Policy",
      "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self'; connect-src 'self'; worker-src 'self' blob:; media-src 'self' blob:; object-src 'none'; base-uri 'self'; frame-ancestors 'none'",
    );
    if (!req.url.startsWith("/api/")) return;
    reply.header("Cache-Control", "no-store");
    if (!["GET", "HEAD", "OPTIONS"].includes(req.method)) {
      const expectedOrigin =
        process.env.DLS_PUBLIC_ORIGIN ||
        `${req.protocol}://${req.headers.host}`;
      if (req.headers.origin && req.headers.origin !== expectedOrigin)
        fail("Cross-origin requests are not allowed.", 403);
      if (
        !String(req.headers["content-type"]).startsWith("application/json") &&
        !String(req.headers["content-type"]).startsWith("multipart/form-data")
      )
        fail("Use JSON or multipart requests.", 415);
    }
    req.user = store.session(tokenOf(req));
    if (
      !["/api/auth/status", "/api/auth/login"].includes(
        req.url.split("?")[0],
      ) &&
      !req.user
    )
      fail("Sign in to your DLS workspace.", 401);
  });
  app.setErrorHandler((error, req, reply) => {
    const status = error.statusCode || 500;
    reply.code(status).send({
      error:
        status >= 500 && !error.statusCode
          ? "The request could not be completed."
          : error.message,
    });
  });
  const cookie = (token) =>
    `dls_session=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${token ? 604800 : 0}${process.env.DLS_COOKIE_SECURE === "true" ? "; Secure" : ""}`;
  app.get("/api/auth/status", async (req) => ({
    user: req.user,
    setupRequired: !store.db.prepare("SELECT id FROM users LIMIT 1").get(),
  }));
  app.post("/api/auth/login", async (req, reply) => {
    const { name, password } = body(req);
    text(name, 40);
    text(password, 256);
    const key = req.ip,
      now = Date.now();
    if (failures.size > 1000)
      for (const [k, v] of failures)
        if (now - v.start > 600000) failures.delete(k);
    const entry = failures.get(key) || { count: 0, start: now };
    if (now - entry.start > 600000) {
      entry.count = 0;
      entry.start = now;
    }
    if (entry.count >= 10)
      fail("Too many sign-in attempts. Try again in ten minutes.", 429);
    try {
      const session = store.login(name, password);
      failures.delete(key);
      reply.header("Set-Cookie", cookie(session.token));
      return session.user;
    } catch (e) {
      entry.count++;
      failures.set(key, entry);
      throw e;
    }
  });
  app.post("/api/auth/logout", async (req, reply) => {
    store.db
      .prepare("DELETE FROM sessions WHERE token=?")
      .run(hashToken(tokenOf(req)));
    reply.header("Set-Cookie", cookie(""));
    return { ok: true };
  });
  app.get("/api/connections", async () => ({
    satsu: satsuStatus(),
    reaper: bridge.context(),
    storage: { engine: "SQLite", persistent: true },
    version: "0.1.0",
  }));
  app.post("/api/users", async (req) => {
    owner(req);
    const b = body(req);
    return store.addUser(text(b.name, 40), text(b.password, 256), "guest");
  });
  app.get("/api/scores", async (req) => store.listScores(req.user));
  app.get("/api/scores/:id", async (req) => ({
    ...store.score(req.params.id),
    preference: store.preference(req.user, req.params.id),
  }));
  app.post("/api/scores", async (req) => {
    owner(req);
    const b = body(req);
    text(b.alphatex, 200000);
    return store.createScore(
      await parseImport(new TextEncoder().encode(b.alphatex)),
      req.user,
      { kind: "authored" },
    );
  });
  app.patch("/api/scores/:id", async (req) => {
    owner(req);
    const b = body(req),
      s = store.score(req.params.id);
    integer(b.revision, 1, 1e9, "Revision");
    return store.updateScore(
      s.id,
      b.revision,
      editScore(s.source, b.operation),
      req.user,
      `Edited ${b.operation.type}`,
    );
  });
  app.get("/api/scores/:id/history", async (req) =>
    store.history(req.params.id),
  );
  app.post("/api/scores/:id/restore", async (req) => {
    owner(req);
    const b = body(req);
    integer(b.target, 1, 1e9, "Target revision");
    integer(b.revision, 1, 1e9, "Current revision");
    const old = store.db
      .prepare("SELECT source FROM revisions WHERE score_id=? AND revision=?")
      .get(req.params.id, b.target);
    if (!old) fail("Revision not found", 404);
    return store.updateScore(
      req.params.id,
      b.revision,
      old.source,
      req.user,
      `Restored revision ${b.target}`,
    );
  });
  app.put("/api/scores/:id/preference", async (req) => {
    const b = body(req),
      p = {};
    if (b.favorite !== undefined) {
      if (typeof b.favorite !== "boolean") fail("Invalid favorite");
      p.favorite = b.favorite;
    }
    if (b.note !== undefined) p.note = text(b.note, 4000);
    if (b.speed !== undefined) {
      if (!Number.isFinite(b.speed) || b.speed < 0.25 || b.speed > 1.5)
        fail("Speed must be 25–150%");
      p.speed = b.speed;
    }
    return store.setPreference(req.user, req.params.id, p);
  });
  app.get("/api/scores/:id/export/:format", async (req, reply) => {
    const s = store.score(req.params.id),
      f = req.params.format;
    reply.header(
      "Content-Disposition",
      `attachment; filename="score-${s.id}.${f === "alphatex" ? "tex" : f}"`,
    );
    reply.type("application/octet-stream");
    return Buffer.from(exportScore(s.source, f));
  });
  await app.register(multipart, {
    limits: { fileSize: 32 * 1024 * 1024, files: 1, fields: 0 },
  });
  app.post("/api/imports", async (req) => {
    owner(req);
    const file = await req.file();
    if (!file) fail("Select a score file");
    const bytes = await file.toBuffer();
    const source = await parseImport(bytes);
    return store.artifact(req.user, "score-import", text(file.filename, 250), {
      source,
      summary: summary(source),
      checksum: createHash("sha256").update(bytes).digest("hex"),
    });
  });
  app.post("/api/imports/:id/accept", async (req) => {
    owner(req);
    const a = store.getArtifact(req.params.id, req.user);
    if (a.kind !== "score-import") fail("Not a score import");
    if (a.payload.acceptedScore) return store.score(a.payload.acceptedScore);
    return store.transaction(() => {
      const s = store.createScoreWithinTransaction(a.payload.source, req.user, {
        kind: "import",
        filename: a.name,
        checksum: a.payload.checksum,
      });
      store.db
        .prepare("UPDATE artifacts SET payload=? WHERE id=?")
        .run(JSON.stringify({ ...a.payload, acceptedScore: s.id }), a.id);
      return s;
    });
  });
  app.get("/api/artifacts", async (req) =>
    store.db
      .prepare(
        "SELECT id,kind,name,payload,created FROM artifacts WHERE user_id=? ORDER BY created DESC LIMIT 100",
      )
      .all(req.user.id)
      .map((a) => {
        const p = JSON.parse(a.payload);
        return {
          ...a,
          payload:
            a.kind === "score-import"
              ? { summary: p.summary, acceptedScore: p.acceptedScore }
              : a.kind === "score-handoff"
                ? { ...p, midi: undefined }
                : p,
        };
      }),
  );
  app.post("/api/scores/:id/handoff", async (req) => {
    owner(req);
    const s = store.score(req.params.id),
      midi = exportScore(s.source, "mid");
    return store.artifact(req.user, "score-handoff", s.title, {
      sourceApp: "tabs",
      targetApp: "studio",
      resource: s.id,
      revision: s.revision,
      summary: summary(s.source),
      midi: Buffer.from(midi).toString("base64"),
    });
  });
  app.get("/api/artifacts/:id/midi", async (req, reply) => {
    const a = store.getArtifact(req.params.id, req.user);
    if (a.kind !== "score-handoff") fail("Not a MIDI handoff");
    reply
      .header("Content-Disposition", `attachment; filename="dls-${a.id}.mid"`)
      .type("audio/midi");
    return Buffer.from(a.payload.midi, "base64");
  });
  app.get("/api/capabilities", async () => ({
    protocol: "dls-action/1",
    apps: [
      {
        id: "tabs",
        context: "/api/scores/:id",
        operations: ["note", "tempo", "metadata"],
        exports: ["gp", "mid", "alphatex", "json"],
      },
      {
        id: "studio",
        context: "/api/connections",
        operations: [
          "play",
          "pause",
          "stop",
          "mute",
          "solo",
          "volume",
          "loop",
          "marker",
        ],
      },
    ],
    actions: {
      prepare: "/api/actions/prepare",
      apply: "/api/actions/:id/apply",
      receipts: "/api/actions",
    },
    artifacts: "/api/artifacts",
    advice: "/api/satsu/ask",
    auth: "HttpOnly session; owner or guest",
  }));
  app.post("/api/audio/analyze", async (req) => {
    owner(req);
    const file = await req.file();
    if (!file) fail("Select a WAV");
    const bytes = await file.toBuffer();
    return store.artifact(
      req.user,
      "audio-analysis",
      text(file.filename, 250),
      {
        ...analyzeWav(bytes),
        checksum: createHash("sha256").update(bytes).digest("hex"),
      },
    );
  });
  app.post("/api/practice", async (req) => {
    const b = body(req);
    store.score(b.scoreId);
    integer(b.seconds, 1, 86400, "Practice duration");
    if (!Number.isFinite(b.speed) || b.speed < 0.25 || b.speed > 1.5)
      fail("Invalid speed");
    store.db
      .prepare("INSERT INTO practice VALUES(?,?,?,?,?,?)")
      .run(
        crypto.randomUUID(),
        req.user.id,
        b.scoreId,
        b.seconds,
        b.speed,
        new Date().toISOString(),
      );
    return { ok: true };
  });
  app.get("/api/practice", async (req) =>
    store.db
      .prepare(
        "SELECT p.*,s.source FROM practice p JOIN scores s ON p.score_id=s.id WHERE user_id=? ORDER BY created DESC LIMIT 100",
      )
      .all(req.user.id)
      .map(({ source, ...p }) => ({ ...p, title: summary(source).title })),
  );
  app.post("/api/satsu/ask", async (req) => {
    const b = body(req);
    let context;
    if (b.app === "tabs") {
      const s = store.score(b.resource);
      context = {
        app: "tabs",
        resource: s.id,
        revision: s.revision,
        ...summary(s.source),
        selection: b.selection ?? null,
      };
    } else if (b.app === "studio") {
      const c = bridge.context();
      context = {
        app: "studio",
        connected: c.connected,
        project: c.project,
        revision: c.revision,
        tracks: c.tracks?.slice(0, 64).map((t) => ({
          id: t.id,
          name: t.name,
          mute: t.mute,
          solo: t.solo,
        })),
        tempo: c.tempo,
      };
      if (b.resource) {
        const score = store.score(b.resource);
        context.relatedScore = {
          resource: score.id,
          revision: score.revision,
          ...summary(score.source),
          relationship:
            "Related songbook context; import into REAPER is not confirmed.",
        };
      }
    } else fail("Select an app");
    const result = await askSatsu(b.prompt, context);
    return store.artifact(req.user, "satsu-advice", b.app, {
      ...result,
      context,
    });
  });
  app.post("/api/actions/prepare", async (req) => {
    owner(req);
    const b = body(req);
    let resource, revision, description;
    if (b.app === "tabs") {
      const s = store.score(b.resource);
      editScore(s.source, b.operation);
      resource = s.id;
      revision = s.revision;
      description =
        b.operation.type === "tempo"
          ? `Set ${s.title} to ${b.operation.value} BPM`
          : `Edit ${b.operation.type} in ${s.title}`;
    } else if (b.app === "studio") {
      const c = bridge.context();
      if (!c.connected) fail("REAPER bridge is offline.", 503);
      validateCommand(b.operation, c);
      resource = c.project;
      revision = c.revision;
      description = `REAPER: ${b.operation.type}${b.operation.track ? " on selected track" : ""}`;
    } else fail("Unknown app");
    return store.prepare(
      req.user,
      b.app,
      resource,
      revision,
      b.operation,
      description,
    );
  });
  function refreshAction(a) {
    if (a.app === "studio" && ["queued", "unknown"].includes(a.status)) {
      const receipt = bridge.receipt(a.id);
      if (receipt) store.finishAction(a.id, receipt.status, receipt);
      else if (
        a.status === "queued" &&
        Date.now() - Date.parse(a.receipt?.queuedAt || a.created) > 60000
      )
        store.finishAction(a.id, "unknown", {
          message:
            "No receipt received. Check REAPER before preparing another command; this action will not be retried.",
        });
    }
  }
  app.get("/api/actions", async (req) =>
    store.db
      .prepare(
        "SELECT id FROM actions WHERE user_id=? ORDER BY created DESC LIMIT 100",
      )
      .all(req.user.id)
      .map((row) => {
        const a = store.action(row.id, req.user);
        refreshAction(a);
        return store.action(row.id, req.user);
      }),
  );
  app.get("/api/actions/:id", async (req) => {
    const a = store.action(req.params.id, req.user);
    refreshAction(a);
    return store.action(a.id, req.user);
  });
  app.post("/api/actions/:id/cancel", async (req) => {
    const a = store.action(req.params.id, req.user);
    if (a.status !== "prepared")
      fail("Only prepared actions can be cancelled", 409);
    store.finishAction(a.id, "cancelled", { message: "Cancelled by user" });
    return store.action(a.id, req.user);
  });
  app.post("/api/actions/:id/apply", async (req) => {
    owner(req);
    const a = store.action(req.params.id, req.user);
    if (a.status !== "prepared") return a;
    if (a.app === "tabs")
      store.transaction(() => {
        const s = store.score(a.resource);
        if (String(s.revision) !== a.revision)
          fail("Score changed since this review was prepared.", 409);
        const updated = store.updateScoreWithinTransaction(
          s.id,
          s.revision,
          editScore(s.source, a.operation),
          req.user,
          a.description,
        );
        store.finishAction(a.id, "applied", {
          scoreId: s.id,
          previousRevision: s.revision,
          revision: updated.revision,
          message: "Applied with revision history",
        });
      });
    else {
      bridge.queue(a);
      store.finishAction(a.id, "queued", {
        queuedAt: new Date().toISOString(),
        message: "Sent to REAPER; awaiting its execution receipt.",
      });
    }
    return store.action(a.id, req.user);
  });
  const alphaRoot = resolve("node_modules/@coderline/alphatab/dist");
  app.get("/api/reaper/theme", async (_req, reply) => {
    const file = new URL(
      "../reaper/theme/dist/DLS Satsu.ReaperThemeZip",
      import.meta.url,
    );
    if (!existsSync(file))
      fail("The REAPER theme package is missing from this installation.", 503);
    return reply
      .type("application/zip")
      .header(
        "Content-Disposition",
        'attachment; filename="DLS Satsu.ReaperThemeZip"',
      )
      .send(createReadStream(file));
  });
  await app.register(staticFiles, {
    root: alphaRoot,
    prefix: "/assets/alphatab/",
    decorateReply: false,
  });
  if (serveUi && existsSync(resolve("dist"))) {
    await app.register(staticFiles, { root: resolve("dist"), prefix: "/" });
    app.setNotFoundHandler((req, reply) =>
      req.url.startsWith("/api/")
        ? reply.code(404).send({ error: "Endpoint not found" })
        : reply.sendFile("index.html"),
    );
  }
  return app;
}
