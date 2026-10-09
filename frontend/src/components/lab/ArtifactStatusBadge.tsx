import { CheckCircle2, AlertTriangle, XCircle, HelpCircle } from "lucide-react";
import type { ArtifactStatus } from "@/types/lab";

const CONFIG: Record<ArtifactStatus, { label: string; color: string; Icon: typeof CheckCircle2 }> = {
  ok: { label: "Available", color: "var(--green)", Icon: CheckCircle2 },
  missing: { label: "Missing", color: "var(--yellow)", Icon: AlertTriangle },
  malformed: { label: "Malformed", color: "var(--red)", Icon: XCircle },
  unavailable: { label: "Unavailable", color: "var(--red)", Icon: XCircle },
};

export default function ArtifactStatusBadge({ status }: { status: ArtifactStatus | string }) {
  const cfg = CONFIG[status as ArtifactStatus] ?? { label: status, color: "var(--muted)", Icon: HelpCircle };
  const { label, color, Icon } = cfg;
  return (
    <span
      className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium"
      style={{ color, backgroundColor: "var(--surface)", border: `1px solid ${color}` }}
    >
      <Icon size={12} />
      {label}
    </span>
  );
}
