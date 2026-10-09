import { AlertTriangle } from "lucide-react";

/** Makes same-period duplicate paper-trading records impossible to miss --
 * required so N log records are never mistaken for N independent
 * monthly observations. */
export default function DuplicatePeriodBanner({ warning }: { warning: string | null | undefined }) {
  if (!warning) return null;
  return (
    <div
      className="flex items-start gap-3 p-3 rounded-xl text-sm mb-4"
      style={{ backgroundColor: "var(--surface)", border: "1px solid var(--yellow)" }}
    >
      <AlertTriangle size={16} style={{ color: "var(--yellow)" }} className="flex-shrink-0 mt-0.5" />
      <p style={{ color: "var(--text)" }}>{warning}</p>
    </div>
  );
}
