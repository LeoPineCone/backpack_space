/**
 * The client's way to the backend (docs/backend.md "What this means for the app"): every request and answer comes
 * from the contract in packages/api, every answer is checked against its schema. Errors come back as the fixed codes
 * of the contract, plus "network" (no answer) and "bad_answer" (an answer that breaks the contract).
 */
import { APP_VERSION_HEADER, AUTH_HEADER, ErrorBody, ROUTES, type ErrorCode, type RequestOf, type ResponseOf, type RouteName } from "@backpack-space/api";

export type ApiFailure = ErrorCode | "network" | "bad_answer";
export type ApiResult<T> = { ok: true; value: T } | { ok: false; error: ApiFailure; textKey?: string };

export type FetchFn = (
  url: string,
  init: { method: string; headers: Record<string, string>; body?: string },
) => Promise<{ status: number; json(): Promise<unknown> }>;

export interface ApiOptions {
  /** the backend address, from the build setting VITE_BACKEND_URL */
  base: string;
  appVersion: string;
  fetch: FetchFn;
}

export interface Api {
  call<N extends RouteName>(name: N, body: RequestOf<N>, token?: string): Promise<ApiResult<ResponseOf<N>>>;
}

export function createApi(o: ApiOptions): Api {
  const base = o.base.replace(/\/$/, "");
  return {
    async call(name, body, token) {
      const route = ROUTES[name];
      const headers: Record<string, string> = { [APP_VERSION_HEADER]: o.appVersion };
      if (token) headers[AUTH_HEADER] = `Bearer ${token}`;
      if (route.method !== "GET") headers["content-type"] = "application/json";
      let status: number;
      let json: unknown;
      try {
        const res = await o.fetch(`${base}${route.path}`, { method: route.method, headers, ...(route.method !== "GET" ? { body: JSON.stringify(body) } : {}) });
        status = res.status;
        json = await res.json().catch(() => undefined);
      } catch {
        return { ok: false, error: "network" };
      }
      if (status === 200) {
        const parsed = route.response.safeParse(json);
        return parsed.success ? { ok: true, value: parsed.data as ResponseOf<typeof name> } : { ok: false, error: "bad_answer" };
      }
      const err = ErrorBody.safeParse(json);
      if (!err.success) return { ok: false, error: "bad_answer" };
      return { ok: false, error: err.data.error as ErrorCode, ...(err.data.textKey ? { textKey: err.data.textKey } : {}) };
    },
  };
}
