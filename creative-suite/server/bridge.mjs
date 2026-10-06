import {
  mkdirSync,
  readFileSync,
  writeFileSync,
  renameSync,
  existsSync,
  readdirSync,
} from "node:fs";
import { join, resolve } from "node:path";
import { fail } from "../shared/score.mjs";

export const studioCommands = [
  "play",
  "pause",
  "stop",
  "mute",
  "solo",
  "volume",
  "loop",
  "marker",
];
export function validateCommand(op, context) {
  if (!op || typeof op !== "object") fail("REAPER operation required");
  if (!studioCommands.includes(op.type)) fail("Unsupported REAPER command");
  if (
    ["mute", "solo", "volume"].includes(op.type) &&
    !context.tracks.some((t) => t.id === op.track)
  )
    fail("Track no longer exists", 409);
  if (["mute", "solo"].includes(op.type) && typeof op.value !== "boolean")
    fail("Expected on/off value");
  if (
    op.type === "volume" &&
    (!Number.isFinite(op.value) || op.value < 0 || op.value > 2)
  )
    fail("Track volume must be 0–2.");
  if (
    op.type === "loop" &&
    (!Number.isFinite(op.start) ||
      !Number.isFinite(op.end) ||
      op.start < 0 ||
      op.end <= op.start ||
      op.end > 86400)
  )
    fail("Invalid loop in seconds");
  if (
    op.type === "marker" &&
    (!Number.isFinite(op.position) ||
      op.position < 0 ||
      op.position > 86400 ||
      typeof op.name !== "string" ||
      op.name.length > 80)
  )
    fail("Invalid marker");
  return op;
}
export class Bridge {
  constructor(directory) {
    this.directory = resolve(directory);
    mkdirSync(this.directory, { recursive: true });
  }
  context() {
    try {
      const path = join(this.directory, "context.json");
      if (!existsSync(path) || readFileSync(path).length > 2 * 1024 * 1024)
        throw new Error();
      const c = JSON.parse(readFileSync(path, "utf8"));
      if (
        !Number.isFinite(c.observedAt) ||
        Date.now() / 1000 - c.observedAt > 5 ||
        Math.abs(Date.now() / 1000 - c.observedAt) > 30 ||
        typeof c.project !== "string" ||
        typeof c.revision !== "string" ||
        !Array.isArray(c.tracks)
      )
        throw new Error();
      return { ...c, connected: true, directory: this.directory };
    } catch {
      return {
        connected: false,
        directory: this.directory,
        reason: "Start the DLS bridge in REAPER on this host.",
      };
    }
  }
  queue(action) {
    const context = this.context();
    if (!context.connected) fail("REAPER bridge is offline.", 503);
    if (
      context.project !== action.resource ||
      context.revision !== action.revision
    )
      fail("REAPER session changed. Prepare this action again.", 409);
    validateCommand(action.operation, context);
    if (
      readdirSync(this.directory).some((n) =>
        /^(command|processing)-.*\.json$/.test(n),
      )
    )
      fail(
        "REAPER has a pending command. Inspect its receipt or processing file before sending another.",
        409,
      );
    const target = join(this.directory, `command-${action.id}.json`);
    const temp = target + ".tmp";
    writeFileSync(
      temp,
      JSON.stringify({
        id: action.id,
        project: action.resource,
        revision: action.revision,
        operation: action.operation,
        expiresAt: Date.now() / 1000 + 15,
      }),
    );
    renameSync(temp, target);
  }
  receipt(id) {
    try {
      const path = join(this.directory, `receipt-${id}.json`);
      if (readFileSync(path).length > 16000) return null;
      const receipt = JSON.parse(readFileSync(path, "utf8"));
      return receipt.id === id &&
        ["applied", "rejected"].includes(receipt.status)
        ? receipt
        : null;
    } catch {
      return null;
    }
  }
}
