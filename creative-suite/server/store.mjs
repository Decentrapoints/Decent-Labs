import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import {
  randomUUID,
  randomBytes,
  scryptSync,
  timingSafeEqual,
  createHash,
} from "node:crypto";
import { seedScores, summary, fail } from "../shared/score.mjs";

export const hashToken = (token) =>
  createHash("sha256").update(token).digest("hex");
export function passwordHash(password) {
  if (
    typeof password !== "string" ||
    password.length < 12 ||
    password.length > 256
  )
    fail("Use a password with 12–256 characters.");
  const salt = randomBytes(16).toString("hex");
  return `${salt}:${scryptSync(password, salt, 64).toString("hex")}`;
}
export function passwordMatches(password, stored) {
  if (typeof password !== "string" || password.length > 256) return false;
  const [salt, digest] = stored.split(":");
  return timingSafeEqual(
    scryptSync(password, salt, 64),
    Buffer.from(digest, "hex"),
  );
}
export class Store {
  constructor(directory) {
    this.directory = directory;
    mkdirSync(directory, { recursive: true });
    this.db = new DatabaseSync(join(directory, "dls.sqlite"));
    this.db
      .exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;
      CREATE TABLE IF NOT EXISTS users(id TEXT PRIMARY KEY, name TEXT UNIQUE NOT NULL, password TEXT NOT NULL, role TEXT CHECK(role IN ('owner','guest')) NOT NULL);
      CREATE TABLE IF NOT EXISTS sessions(token TEXT PRIMARY KEY, user_id TEXT REFERENCES users(id) ON DELETE CASCADE, expires INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS scores(id TEXT PRIMARY KEY, source TEXT NOT NULL, revision INTEGER NOT NULL, created TEXT NOT NULL, updated TEXT NOT NULL, provenance TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS revisions(score_id TEXT REFERENCES scores(id), revision INTEGER, source TEXT NOT NULL, label TEXT NOT NULL, user_id TEXT, created TEXT NOT NULL, PRIMARY KEY(score_id, revision));
      CREATE TABLE IF NOT EXISTS preferences(user_id TEXT REFERENCES users(id), score_id TEXT REFERENCES scores(id), data TEXT NOT NULL, PRIMARY KEY(user_id,score_id));
      CREATE TABLE IF NOT EXISTS actions(id TEXT PRIMARY KEY, user_id TEXT REFERENCES users(id), app TEXT NOT NULL, resource TEXT NOT NULL, revision TEXT NOT NULL, operation TEXT NOT NULL, description TEXT NOT NULL, status TEXT NOT NULL, receipt TEXT, created TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS artifacts(id TEXT PRIMARY KEY, user_id TEXT REFERENCES users(id), kind TEXT NOT NULL, name TEXT NOT NULL, payload TEXT NOT NULL, created TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS practice(id TEXT PRIMARY KEY, user_id TEXT REFERENCES users(id), score_id TEXT REFERENCES scores(id), seconds INTEGER NOT NULL, speed REAL NOT NULL, created TEXT NOT NULL);
    `);
    if (!this.db.prepare("SELECT id FROM scores LIMIT 1").get())
      for (const s of seedScores())
        this.createScore(s.source, null, { kind: "original-demo" }, s.id);
    this.db.prepare("DELETE FROM sessions WHERE expires < ?").run(Date.now());
  }
  close() {
    this.db.close();
  }
  transaction(fn) {
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const result = fn();
      this.db.exec("COMMIT");
      return result;
    } catch (e) {
      this.db.exec("ROLLBACK");
      throw e;
    }
  }
  addUser(name, password, role = "owner") {
    if (!/^[a-zA-Z0-9_.-]{3,40}$/.test(name))
      fail(
        "Usernames need 3–40 letters, numbers, dots, dashes or underscores.",
      );
    if (!["owner", "guest"].includes(role)) fail("Invalid role");
    const id = randomUUID();
    this.db
      .prepare("INSERT INTO users VALUES(?,?,?,?)")
      .run(id, name, passwordHash(password), role);
    return { id, name, role };
  }
  login(name, password) {
    const user = this.db
      .prepare("SELECT * FROM users WHERE name = ?")
      .get(name);
    // Perform the same KDF when a name does not exist.
    const valid = passwordMatches(
      password,
      user?.password ?? `00000000000000000000000000000000:${"00".repeat(64)}`,
    );
    if (!user || !valid) fail("Incorrect username or password.", 401);
    const token = randomBytes(32).toString("hex");
    this.db
      .prepare("INSERT INTO sessions VALUES(?,?,?)")
      .run(hashToken(token), user.id, Date.now() + 7 * 86400000);
    return { token, user: { id: user.id, name: user.name, role: user.role } };
  }
  session(token) {
    if (!token) return null;
    return (
      this.db
        .prepare(
          "SELECT u.id,u.name,u.role FROM users u JOIN sessions s ON u.id=s.user_id WHERE s.token=? AND s.expires>?",
        )
        .get(hashToken(token), Date.now()) ?? null
    );
  }
  listScores(user) {
    return this.db
      .prepare("SELECT * FROM scores ORDER BY updated DESC")
      .all()
      .map((s) => {
        const pref = this.preference(user, s.id);
        return {
          id: s.id,
          revision: s.revision,
          updated: s.updated,
          ...summary(s.source),
          ...pref,
        };
      });
  }
  score(id) {
    const s = this.db.prepare("SELECT * FROM scores WHERE id=?").get(id);
    if (!s) fail("Score not found", 404);
    return { ...s, provenance: JSON.parse(s.provenance), ...summary(s.source) };
  }
  createScore(source, user, provenance, id = randomUUID()) {
    return this.transaction(() =>
      this.createScoreWithinTransaction(source, user, provenance, id),
    );
  }
  createScoreWithinTransaction(source, user, provenance, id = randomUUID()) {
    const now = new Date().toISOString();
    this.db
      .prepare("INSERT INTO scores VALUES(?,?,?,?,?,?)")
      .run(id, source, 1, now, now, JSON.stringify(provenance));
    this.db
      .prepare("INSERT INTO revisions VALUES(?,?,?,?,?,?)")
      .run(id, 1, source, "Created score", user?.id ?? null, now);
    return this.score(id);
  }
  updateScore(id, expected, source, user, label) {
    return this.transaction(() =>
      this.updateScoreWithinTransaction(id, expected, source, user, label),
    );
  }
  updateScoreWithinTransaction(id, expected, source, user, label) {
    const now = new Date().toISOString();
    const changed = this.db
      .prepare(
        "UPDATE scores SET source=?,revision=revision+1,updated=? WHERE id=? AND revision=?",
      )
      .run(source, now, id, expected);
    if (!changed.changes)
      fail("This score changed. Reload it before applying your edit.", 409);
    const score = this.score(id);
    this.db
      .prepare("INSERT INTO revisions VALUES(?,?,?,?,?,?)")
      .run(id, score.revision, source, label, user.id, now);
    return score;
  }
  history(id) {
    this.score(id);
    return this.db
      .prepare(
        "SELECT revision,label,created FROM revisions WHERE score_id=? ORDER BY revision DESC",
      )
      .all(id);
  }
  preference(user, id) {
    return JSON.parse(
      this.db
        .prepare("SELECT data FROM preferences WHERE user_id=? AND score_id=?")
        .get(user.id, id)?.data ?? "{}",
    );
  }
  setPreference(user, id, values) {
    this.score(id);
    const data = { ...this.preference(user, id), ...values };
    this.db
      .prepare(
        "INSERT INTO preferences VALUES(?,?,?) ON CONFLICT(user_id,score_id) DO UPDATE SET data=excluded.data",
      )
      .run(user.id, id, JSON.stringify(data));
    return data;
  }
  artifact(user, kind, name, payload) {
    const id = randomUUID(),
      created = new Date().toISOString();
    this.db
      .prepare("INSERT INTO artifacts VALUES(?,?,?,?,?,?)")
      .run(id, user.id, kind, name, JSON.stringify(payload), created);
    return { id, kind, name, payload, created };
  }
  getArtifact(id, user) {
    const a = this.db
      .prepare("SELECT * FROM artifacts WHERE id=? AND user_id=?")
      .get(id, user.id);
    if (!a) fail("Artifact not found", 404);
    return { ...a, payload: JSON.parse(a.payload) };
  }
  prepare(user, app, resource, revision, operation, description) {
    const id = randomUUID(),
      created = new Date().toISOString();
    this.db
      .prepare("INSERT INTO actions VALUES(?,?,?,?,?,?,?,?,?,?)")
      .run(
        id,
        user.id,
        app,
        resource,
        String(revision),
        JSON.stringify(operation),
        description,
        "prepared",
        null,
        created,
      );
    return this.action(id, user);
  }
  action(id, user) {
    const a = this.db
      .prepare("SELECT * FROM actions WHERE id=? AND user_id=?")
      .get(id, user.id);
    if (!a) fail("Action not found", 404);
    return {
      ...a,
      operation: JSON.parse(a.operation),
      receipt: a.receipt ? JSON.parse(a.receipt) : null,
    };
  }
  finishAction(id, status, receipt) {
    this.db
      .prepare("UPDATE actions SET status=?,receipt=? WHERE id=?")
      .run(status, JSON.stringify(receipt), id);
  }
}
