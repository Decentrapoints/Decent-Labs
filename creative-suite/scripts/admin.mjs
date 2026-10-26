import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";
import { Store, passwordHash } from "../server/store.mjs";
if (existsSync(".env")) process.loadEnvFile(".env");
async function secret(label) {
  if (!stdin.isTTY)
    throw new Error("Account setup requires an interactive terminal.");
  stdout.write(label);
  stdin.setRawMode(true);
  stdin.resume();
  return new Promise((resolve, reject) => {
    let value = "";
    const done = () => {
      stdin.removeListener("data", handler);
      stdin.setRawMode(false);
      stdin.pause();
      stdout.write("\n");
    };
    const handler = (bytes) => {
      for (const ch of bytes.toString()) {
        if (ch === "\u0003") {
          done();
          reject(new Error("Setup cancelled."));
          return;
        }
        if (ch === "\r" || ch === "\n") {
          done();
          resolve(value);
          return;
        }
        if (ch === "\u007f" || ch === "\b") {
          if (value) {
            value = value.slice(0, -1);
            stdout.write("\b \b");
          }
        } else if (ch >= " " && value.length < 256) {
          value += ch;
          stdout.write("•");
        }
      }
    };
    stdin.on("data", handler);
  });
}
const store = new Store(resolve(process.env.DLS_DATA_DIR || "data"));
try {
  const rl = createInterface({ input: stdin, output: stdout });
  const name = (await rl.question("Account username: ")).trim();
  rl.close();
  const password = await secret("Password (12+ characters): "),
    confirm = await secret("Confirm password: ");
  if (password !== confirm) throw new Error("Passwords do not match.");
  if (process.argv.includes("--reset")) {
    const hash = passwordHash(password);
    store.transaction(() => {
      const user = store.db
        .prepare("SELECT id FROM users WHERE name=?")
        .get(name);
      if (!user) throw new Error("Account does not exist.");
      store.db
        .prepare("UPDATE users SET password=? WHERE id=?")
        .run(hash, user.id);
      store.db.prepare("DELETE FROM sessions WHERE user_id=?").run(user.id);
    });
    console.log("Password reset. Existing sessions were signed out.");
  } else {
    store.addUser(
      name,
      password,
      process.argv.includes("--guest") ? "guest" : "owner",
    );
    console.log("Account created. Start the app and sign in.");
  }
} catch (e) {
  console.error(e.message);
  process.exitCode = 1;
} finally {
  store.close();
}
