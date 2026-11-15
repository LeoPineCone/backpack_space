import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  // placeholder id – must be final before the first store upload (cannot change afterwards)
  appId: "com.backpackspace.app",
  appName: "Backpack Space",
  // `npm run client:build` (repo root) writes the web build here
  webDir: "../../out/client",
  backgroundColor: "#070b18",
  ios: { contentInset: "never" },
  android: { backgroundColor: "#070b18" },
};

export default config;
