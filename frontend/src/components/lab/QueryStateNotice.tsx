import { Loader2, WifiOff } from "lucide-react";

export function LoadingNotice({ label = "Loading Lab data…" }: { label?: string }) {
  return (
    <div className="flex items-center gap-2 py-8 justify-center text-sm" style={{ color: "var(--muted)" }}>
      <Loader2 size={16} className="animate-spin" />
      {label}
    </div>
  );
}

/** For transport-level failures (network error, 503 Lab-unavailable) as
 * opposed to a 200 response that reports a per-artifact status. */
export function QueryErrorNotice({ error }: { error: unknown }) {
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
      </div>
    </div>
  );
}
