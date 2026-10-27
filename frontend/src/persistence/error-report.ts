/**
 * Errors of the editor in the user's browser, sent to the server log (POST /api/client-errors/) so that a bug
 * a user meets can be found and fixed. The same error is sent once, and at most a few per page, so a loop of
 * errors cannot flood the server. Reporting never throws: a failed report is simply dropped.
 */
const URL = "/api/client-errors/";
const MAX_REPORTS = 10;

export interface ErrorReport {
  message: string;
  source?: string;
  stack?: string;
  url?: string;
}

/** What is sent for an error event or a rejected promise. */
export function describeError(error: unknown, source = ""): ErrorReport {
  if (error instanceof Error) return { message: `${error.name}: ${error.message}`, source, stack: error.stack ?? "" };
  return { message: typeof error === "string" ? error : JSON.stringify(error) ?? String(error), source };
}

/** Keeps the reports to send: each distinct message once, and no more than `max` in all. */
export class ReportFilter {
  private readonly seen = new Set<string>();

  constructor(private readonly max = MAX_REPORTS) {}

  accept(report: ErrorReport): boolean {
    if (!report.message || this.seen.size >= this.max || this.seen.has(report.message)) return false;
    this.seen.add(report.message);
    return true;
  }
}

function csrfToken(): string {
  const match = document.cookie.match(/(?:^|;\s*)csrftoken=([^;]+)/);
  return match ? decodeURIComponent(match[1] as string) : "";
}

export function sendReport(report: ErrorReport): void {
  try {
    void fetch(URL, {
      method: "POST",
      credentials: "same-origin",
      keepalive: true,
      headers: { "Content-Type": "application/json", "X-CSRFToken": csrfToken() },
      body: JSON.stringify({ ...report, url: location.pathname }),
    }).catch(() => undefined);
  } catch {
    // Reporting must never break the editor.
  }
}

/** Sends the uncaught errors and rejected promises of the page. */
export function installErrorReporting(): void {
  const filter = new ReportFilter();
  const report = (r: ErrorReport) => {
    if (filter.accept(r)) sendReport(r);
  };
  window.addEventListener("error", (event) => {
    report(event.error ? describeError(event.error, `${event.filename}:${event.lineno}`) : { message: event.message, source: `${event.filename}:${event.lineno}` });
  });
  window.addEventListener("unhandledrejection", (event) => report(describeError(event.reason, "promesse")));
}
