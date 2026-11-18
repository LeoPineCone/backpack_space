/** Build flags Vite replaces at build time (the client has no Vite types: "types" is empty in its tsconfig). */
interface ImportMetaEnv {
  /** true in the dev server, false in `npm run client:build` (production builds drop the code behind it) */
  readonly DEV: boolean;
  readonly PROD: boolean;
  /** "development", "production", or "devtools" for a build with the development helpers (devtools.ts) */
  readonly MODE: string;
  /** address of the backend (`npm run dev` sets it); without it the app plays offline with its local profile */
  readonly VITE_BACKEND_URL?: string;
}
/** the app version from apps/client/package.json (vite.config.ts) */
declare const __APP_VERSION__: string;
interface ImportMeta {
  readonly env: ImportMetaEnv;
}
