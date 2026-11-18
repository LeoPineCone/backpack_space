/**
 * Development helpers (UX-06): the `window.__game` handle for automated checks, the simulation version in the
 * console and the `?safe=` stand-in for a phone's safe area. They exist in the dev server (`npm run client`) and in
 * a build made on purpose for checks (`npm run client:build:dev`, Vite mode "devtools"), never in the production
 * build: Vite replaces the flag with `false` there and drops the code behind it.
 */
export const DEV_TOOLS: boolean = import.meta.env.DEV || import.meta.env.MODE === "devtools";
