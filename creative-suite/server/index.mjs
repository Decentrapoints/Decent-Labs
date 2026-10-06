import { existsSync } from "node:fs";
if (existsSync(".env")) process.loadEnvFile(".env");
const { createApp } = await import("./app.mjs");
const app = await createApp();
const host = process.env.DLS_HOST || "127.0.0.1",
  port = Number(process.env.DLS_PORT || 4310);
await app.listen({ host, port });
console.log(`DLS Creative Suite is ready at http://${host}:${port}`);
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, async () => {
    await app.close();
    process.exit(0);
  });
