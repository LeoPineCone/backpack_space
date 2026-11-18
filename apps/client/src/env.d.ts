/** Build flags Vite replaces at build time (the client has no Vite types: "types" is empty in its tsconfig). */
interface ImportMetaEnv {
  /** true in the dev server, false in `npm run client:build` (production builds drop the code behind it) */
  readonly DEV: boolean;
  readonly PROD: boolean;
}
interface ImportMeta {
  readonly env: ImportMetaEnv;
}
