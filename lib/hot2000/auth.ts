import { NextRequest } from "next/server";

export function getWorkerToken(): string {
  return process.env.HOT2000_WORKER_TOKEN?.trim() || "";
}

export function assertWorkerAuthorized(request: NextRequest): void {
  const expected = getWorkerToken();
  if (!expected) {
    throw new WorkerAuthError("Worker token is not configured on the server.");
  }
  const header = request.headers.get("authorization") ?? "";
  const match = /^Bearer\s+(.+)$/i.exec(header);
  if (!match || match[1].trim() !== expected) {
    throw new WorkerAuthError("Invalid worker credentials.");
  }
}

export class WorkerAuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WorkerAuthError";
  }
}

export function sanitizePublicError(message: string): string {
  return message
    .replace(/[A-Za-z]:\\[^\s]+/g, "[path]")
    .replace(/\/(?:tmp|var|home|workspace)[^\s]*/g, "[path]")
    .replace(/Bearer\s+\S+/gi, "[token]")
    .slice(0, 500);
}
