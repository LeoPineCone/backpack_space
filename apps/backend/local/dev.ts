/** `npm run dev`: database, backend and client together. Ctrl+C stops backend and client; the database keeps running. */
import { spawn, type ChildProcess } from "node:child_process";
import { dbUp } from "./db.js";
import { loadLocalSettings } from "./settings.js";

await dbUp();
// the client learns the backend's address from this build setting (apps/client/src/connect.ts)
const backendUrl = `http://127.0.0.1:${loadLocalSettings().values.port}`;
const children: ChildProcess[] = [
  spawn("npm", ["run", "backend"], { stdio: "inherit" }),
  spawn("npm", ["run", "client"], { stdio: "inherit", env: { ...process.env, VITE_BACKEND_URL: backendUrl } }),
];
const stop = () => {
  for (const c of children) c.kill("SIGTERM");
};
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
for (const c of children) c.on("exit", (code) => code !== 0 && code !== null && stop());
