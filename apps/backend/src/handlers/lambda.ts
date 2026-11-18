/**
 * Turns an API Gateway HTTP API (payload 2.0) event into the router's request and back. Plain shapes, no AWS library.
 * Each Lambda (config, session, game, ...) exports `handler = lambdaHandler(router)` with its own routes.
 */
import type { HttpRequest, HttpResponse } from "../http/types.js";

export interface HttpApiEvent {
  rawPath: string;
  requestContext: { http: { method: string } };
  headers?: Record<string, string | undefined>;
  body?: string;
  isBase64Encoded?: boolean;
}
export interface HttpApiResult {
  statusCode: number;
  headers: Record<string, string>;
  body: string;
}

export function toRequest(e: HttpApiEvent): HttpRequest {
  const headers: Record<string, string | undefined> = {};
  for (const [k, v] of Object.entries(e.headers ?? {})) headers[k.toLowerCase()] = v;
  const body = e.body === undefined ? null : e.isBase64Encoded ? Buffer.from(e.body, "base64").toString("utf8") : e.body;
  return { method: e.requestContext.http.method, path: e.rawPath, headers, body };
}

export function lambdaHandler(router: (req: HttpRequest) => Promise<HttpResponse>): (e: HttpApiEvent) => Promise<HttpApiResult> {
  return async (e) => {
    const res = await router(toRequest(e));
    return { statusCode: res.status, headers: res.headers, body: res.body };
  };
}
