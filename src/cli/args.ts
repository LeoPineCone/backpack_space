/** Minimal --key value argument parsing for the CLI tools. */
export function parseArgs(argv = process.argv.slice(2)): { flags: Record<string, string>; rest: string[] } {
  const flags: Record<string, string> = {};
  const rest: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a.startsWith("--")) {
      const next = argv[i + 1];
      if (next !== undefined && !next.startsWith("--")) { flags[a.slice(2)] = next; i++; } else flags[a.slice(2)] = "true";
    } else rest.push(a);
  }
  return { flags, rest };
}
