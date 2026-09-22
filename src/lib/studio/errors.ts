/**
 * Friendly, typed failures for studio services and API handlers. The message
 * is safe to show to educators; `detail` is only ever logged server-side.
 * Pure module so the worker and CLI scripts can import it.
 */
export class StudioError extends Error {
  status: number;
  detail?: string;
  constructor(message: string, status = 400, detail?: string) {
    super(message);
    this.status = status;
    this.detail = detail;
  }
}
