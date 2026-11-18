/** A request and an answer as the router sees them, independent of Lambda or the local server. */
export interface HttpRequest {
  method: string;
  path: string;
  /** header names in lower case */
  headers: Record<string, string | undefined>;
  body: string | null;
  /** the id the platform gave the request (API Gateway, local server); written into the log line and sent back */
  requestId?: string;
}
export interface HttpResponse {
  status: number;
  headers: Record<string, string>;
  body: string;
}
