/** `npm run dev`: database, backend and client together. Ctrl+C stops backend and client; the database keeps running. */
import { spawn, type ChildProcess } from "node:child_process";
import { dbUp } from "./db.js";

await dbUp();
const children: ChildProcess[] = [spawn("npm", ["run", "backend"], { stdio: "inherit" }), spawn("npm", ["run", "client"], { stdio: "inherit" })];
const stop = () => {
  for (const c of children) c.kill("SIGTERM");
};
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
for (const c of children) c.on("exit", (code) => code !== 0 && code !== null && stop());
