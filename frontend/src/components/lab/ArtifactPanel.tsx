import type { ReactNode } from "react";
import { AlertTriangle, XCircle, FileQuestion } from "lucide-react";
import type { ArtifactEnvelope } from "@/types/lab";
import ArtifactStatusBadge from "./ArtifactStatusBadge";
import { formatDateTime } from "@/utils/labFormat";

/**
 * Renders `children(data)` only when the artifact's status is "ok".
 * Every other status (missing / malformed / unavailable) gets an explicit,
 * distinct message instead of empty or fabricated content.
 */
export default function ArtifactPanel<T>({
  title,
  envelope,
  children,
}: {
  title: string;
  envelope: ArtifactEnvelope<T> | undefined;
  children: (data: T) => ReactNode;
}) {
  if (!envelope) {
    return (
      <Panel title={title}>
        <EmptyState icon={FileQuestion} text="No response received for this artifact." />
      </Panel>
    );
  }

  if (envelope.status === "ok" && envelope.data !== null) {
    return (
      <Panel title={title} status={envelope.status} sourceDate={envelope.source_last_modified}>
        {children(envelope.data)}
      </Panel>
    );
  }

  const messages: Record<string, string> = {
    missing: "This artifact has not been generated yet, or its file is not present on the Lab.",
    malformed: "This artifact's file exists but could not be parsed as valid JSON.",
    unavailable: "The Lab's project root could not be reached.",
  };

  return (
    <Panel title={title} status={envelope.status}>
      <EmptyState
        icon={envelope.status === "malformed" ? XCircle : AlertTriangle}
        text={envelope.error || messages[envelope.status] || "Unknown artifact status."}
      />
    </Panel>
  );
}

function Panel({
  title, status, sourceDate, children,
}: { title: string; status?: string; sourceDate?: string | null; children: ReactNode }) {
  return (
    <div className="rounded-xl p-4" style={{ backgroundColor: "var(--surface)", border: "1px solid var(--border)" }}>
      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
        <h3 className="font-semibold text-sm">{title}</h3>
        <div className="flex items-center gap-2">
          {sourceDate && (
            <span className="text-xs" style={{ color: "var(--muted)" }}>
              as of {formatDateTime(sourceDate)}
            </span>
          )}
          {status && <ArtifactStatusBadge status={status} />}
        </div>
      </div>
      {children}
    </div>
  );
}

function EmptyState({ icon: Icon, text }: { icon: typeof AlertTriangle; text: string }) {
  return (
    <div className="flex items-start gap-2 py-4 text-sm" style={{ color: "var(--muted)" }}>
      <Icon size={16} className="flex-shrink-0 mt-0.5" />
      <span>{text}</span>
    </div>
  );
}
