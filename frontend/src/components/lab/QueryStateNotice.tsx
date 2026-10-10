import { Loader2, WifiOff } from "lucide-react";

/**
 * `fetchStatus` distinguishes an actively in-flight request ("fetching")
 * from a query that React Query has paused rather than firing -- e.g. the
 * browser is offline, or `networkMode: 'online'` (the default) is holding
 * the request back. `isPending` alone stays true in both cases, so without
 * this a paused query would render an indefinite "Loading…" spinner with no
 * indication of why it never resolves.
 */
export function LoadingNotice({
  label = "Loading Lab data…", fetchStatus,
}: { label?: string; fetchStatus?: "fetching" | "paused" | "idle" }) {
  if (fetchStatus === "paused") {
    return (
      <div className="flex items-center gap-2 py-8 justify-center text-sm" style={{ color: "var(--muted)" }}>
        <WifiOff size={16} />
        Waiting for a network connection -- the request has been paused, not lost.
      </div>
    );
  }
  return (
    <div className="flex items-center gap-2 py-8 justify-center text-sm" style={{ color: "var(--muted)" }}>
      <Loader2 size={16} className="animate-spin" />
      {label}
    </div>
  );
}

/** For transport-level failures (network error, 503 Lab-unavailable) as
 * opposed to a 200 response that reports a per-artifact status. */
export function QueryErrorNotice({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const message = error instanceof Error ? error.message : "Unknown error";
  const isUnavailable = message.includes("503");
  return (
    <div
      className="flex items-start gap-3 p-4 rounded-xl text-sm"
      style={{ backgroundColor: "var(--surface)", border: "1px solid var(--red)", color: "var(--text)" }}
    >
      <WifiOff size={18} style={{ color: "var(--red)" }} className="flex-shrink-0 mt-0.5" />
      <div>
        <p className="font-medium" style={{ color: "var(--red)" }}>
          {isUnavailable ? "Institutional Long-Horizon Lab is unavailable" : "Request failed"}
        </p>
        <p className="text-xs mt-1" style={{ color: "var(--muted)" }}>
          {isUnavailable
            ? "The website backend could not reach the Lab's project root. Research data cannot be displayed until this is resolved."
            : message}
        </p>
        {onRetry && (
          <button
            onClick={onRetry}
            className="text-xs mt-2 px-3 py-1 rounded-lg"
            style={{ border: "1px solid var(--border)", color: "var(--text)" }}
          >
            Retry
          </button>
        )}
      </div>
    </div>
  );
}
