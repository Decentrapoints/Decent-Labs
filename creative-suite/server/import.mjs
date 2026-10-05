import { Worker } from "node:worker_threads";
import { fail } from "../shared/score.mjs";
let active = 0;
export async function parseImport(bytes) {
  if (bytes.length > 8 * 1024 * 1024) fail("Score files must be under 8 MB.");
  if (active >= 2)
    fail("Two imports are already being read. Try again shortly.", 429);
  active++;
  try {
    return await new Promise((resolve, reject) => {
      const worker = new Worker(
        new URL("./notation-worker.mjs", import.meta.url),
        {
          workerData: bytes,
          resourceLimits: { maxOldGenerationSizeMb: 128, stackSizeMb: 4 },
        },
      );
      const timeout = setTimeout(() => {
        worker.terminate();
        reject(
          Object.assign(
            new Error("Import exceeded the ten-second processing limit."),
            { statusCode: 400 },
          ),
        );
      }, 10000);
      const done = () => {
        clearTimeout(timeout);
        worker.terminate();
      };
      worker.once("message", (result) => {
        done();
        result.error
          ? reject(Object.assign(new Error(result.error), { statusCode: 400 }))
          : resolve(result.source);
      });
      worker.once("error", () => {
        done();
        reject(
          Object.assign(
            new Error(
              "Import exceeded the processing limit or could not be read.",
            ),
            { statusCode: 400 },
          ),
        );
      });
      worker.once("exit", (code) => {
        if (code !== 0) {
          clearTimeout(timeout);
          reject(
            Object.assign(
              new Error("Score import stopped before completion."),
              { statusCode: 400 },
            ),
          );
        }
      });
    });
  } finally {
    active--;
  }
}
