// Runs a command (e.g. `cap run android`) with JAVA_HOME pointing to a JDK 21 or newer.
// Capacitor 8 compiles Android code for Java 21; an older active JDK fails with
// "invalid source release: 21". This picks a suitable installed JDK by itself,
// or stops with a clear message.
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";

const MIN = 21;

function majorVersion(javaHome) {
  const bin = join(javaHome, "bin", process.platform === "win32" ? "java.exe" : "java");
  return existsSync(bin) ? versionOf(bin) : 0;
}

function versionOf(bin) {
  const r = spawnSync(bin, ["-version"], { encoding: "utf8", shell: process.platform === "win32" });
  const m = /version "(\d+)(?:\.(\d+))?/.exec(`${r.stderr}${r.stdout}`);
  if (!m) return 0;
  const major = Number(m[1]);
  return major === 1 ? Number(m[2]) : major; // "1.8" means Java 8
}

function candidates() {
  const list = [];
  if (process.env.JAVA_HOME) list.push(process.env.JAVA_HOME);
  if (process.platform === "darwin") {
    try {
      list.push(execFileSync("/usr/libexec/java_home", ["-v", `${MIN}+`], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim());
    } catch {
      // no matching JDK registered with macOS
    }
    list.push(
      "/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home",
      "/opt/homebrew/opt/openjdk/libexec/openjdk.jdk/Contents/Home",
      "/usr/local/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home",
      "/Applications/Android Studio.app/Contents/jbr/Contents/Home",
    );
  }
  return list.filter(Boolean);
}

let found = candidates().map((home) => ({ home, major: majorVersion(home) })).find((c) => c.major >= MIN);
// no JAVA_HOME at all: Gradle uses the `java` on PATH, which may be fine
if (!found && !process.env.JAVA_HOME) {
  const major = versionOf("java");
  if (major >= MIN) found = { home: "", major };
}

if (!found) {
  const current = process.env.JAVA_HOME ? `JAVA_HOME is ${process.env.JAVA_HOME} (Java ${majorVersion(process.env.JAVA_HOME) || "?"}).` : "JAVA_HOME is not set.";
  console.error(
    [
      "",
      `The Android build needs Java ${MIN} or newer, none was found. ${current}`,
      "Install it once (macOS, Homebrew):",
      "  brew install --cask zulu@21",
      "Then run the command again; it picks the new JDK by itself.",
      "",
    ].join("\n"),
  );
  process.exit(1);
}

if (found.home && found.home !== process.env.JAVA_HOME) console.log(`Using Java ${found.major} from ${found.home}`);

const [cmd, ...args] = process.argv.slice(2);
if (!cmd) {
  console.error("usage: node scripts/with-java21.mjs <command> [args...]");
  process.exit(1);
}
const env = !found.home ? process.env : { ...process.env, JAVA_HOME: found.home, PATH: `${join(found.home, "bin")}${process.platform === "win32" ? ";" : ":"}${process.env.PATH ?? ""}` };
const r = spawnSync(cmd, args, { stdio: "inherit", env, shell: process.platform === "win32" });
process.exit(r.status ?? 1);
