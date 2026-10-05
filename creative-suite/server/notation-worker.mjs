import { parentPort, workerData } from "node:worker_threads";
import { importScore, encodeScore } from "../shared/score.mjs";
try {
  parentPort.postMessage({
    source: encodeScore(importScore(new Uint8Array(workerData))),
  });
} catch (e) {
  parentPort.postMessage({ error: e.message });
}
