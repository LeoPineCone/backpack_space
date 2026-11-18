/** The real clock, random source and log sink. Used by the Lambdas and the local server; tests use src/fakes. */
import { randomBytes } from "node:crypto";
import type { Clock, LogSink, Random } from "../ports/index.js";

export const systemClock: Clock = { now: () => Date.now() };

export const cryptoRandom: Random = {
  id: () => randomBytes(16).toString("base64url"),
  uint32: () => randomBytes(4).readUInt32LE(0),
};

/** One JSON object per line on stdout: CloudWatch in the cloud, the terminal locally. */
export const stdoutLog: LogSink = {
  write: (line) => process.stdout.write(JSON.stringify(line) + "\n"),
};
