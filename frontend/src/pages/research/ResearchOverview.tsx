import { Link } from "react-router-dom";
import { Microscope, ArrowRight } from "lucide-react";
import { useLabHealth } from "@/hooks/useLab";
import ResearchTabs from "@/components/lab/ResearchTabs";
import ArtifactStatusBadge from "@/components/lab/ArtifactStatusBadge";
import { LoadingNotice, QueryErrorNotice } from "@/components/lab/QueryStateNotice";
import { formatDateTime } from "@/utils/labFormat";

const ARTIFACT_LABELS: Record<string, string> = {
  phase4_results: "Strategy backtest results",
  phase5_scores: "Strategy scorecard",
  deflated_sharpe: "Deflated Sharpe ratios",
  phase6_combination: "Cross-strategy correlation & regime diagnostics",
  phase7_portfolios: "Portfolio constructions",
  phase7_ablation: "Ablation analysis",
  phase7_significance: "Significance testing",
};

const LINKS = [
  { to: "/research/strategies", label: "Strategy results & scorecard" },
  { to: "/research/portfolios", label: "Portfolio diagnostics & significance" },
  { to: "/research/paper-trading", label: "Paper-trading log" },
];

export default function ResearchOverview() {
  const { data, isPending, isError, error, fetchStatus, refetch } = useLabHealth();

  return (
    <div>
      <Header />
      <ResearchTabs />

      {isPending && <LoadingNotice label="Checking Lab connectivity…" fetchStatus={fetchStatus} />}
      {isError && <QueryErrorNotice error={error} onRetry={() => refetch()} />}

      {data && (
        <div className="flex flex-col gap-6">
          <div className="rounded-xl p-4" style={{ backgroundColor: "var(--surface)", border: "1px solid var(--border)" }}>
            <div className="flex items-center justify-between mb-1">
              <h2 className="font-semibold text-sm">Lab connectivity</h2>
              <ArtifactStatusBadge status={data.exists ? "ok" : "unavailable"} />
            </div>
            <p className="text-xs" style={{ color: "var(--muted)" }}>{data.lab_root}</p>
            {!data.exists && data.error && (
              <p className="text-sm mt-2" style={{ color: "var(--red)" }}>{data.error}</p>
            )}
          </div>

          {data.exists && (
            <div className="rounded-xl p-4" style={{ backgroundColor: "var(--surface)", border: "1px solid var(--border)" }}>
              <h2 className="font-semibold text-sm mb-3">Research artifact availability</h2>
              <div className="flex flex-col gap-2">
                {Object.entries(data.artifacts).map(([key, art]) => (
                  <div key={key} className="flex items-center justify-between gap-3 py-1.5" style={{ borderTop: "1px solid var(--border)" }}>
                    <span className="text-sm">{ARTIFACT_LABELS[key] ?? key}</span>
                    <div className="flex items-center gap-3">
                      {art.source_last_modified && (
                        <span className="text-xs hidden sm:inline" style={{ color: "var(--muted)" }}>
                          {formatDateTime(art.source_last_modified)}
                        </span>
                      )}
                      <ArtifactStatusBadge status={art.status} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="rounded-xl p-4" style={{ backgroundColor: "var(--surface)", border: "1px solid var(--border)" }}>
            <div className="flex items-center justify-between mb-1">
              <h2 className="font-semibold text-sm">Paper-trading freshness</h2>
              <ArtifactStatusBadge status={data.paper_trading_freshness.status} />
            </div>
            {data.paper_trading_freshness.status === "ok" ? (
              <div className="text-sm mt-2 flex flex-col gap-1">
                <p>
                  Last successful recording:{" "}
                  <span className="font-mono">{formatDateTime(data.paper_trading_freshness.last_success_at)}</span>
                </p>
                <p style={{ color: data.paper_trading_freshness.is_stale ? "var(--red)" : "var(--muted)" }}>
                  {data.paper_trading_freshness.days_since_last_success?.toFixed(1)} day(s) ago
                  {data.paper_trading_freshness.is_stale
                    ? ` — exceeds the ${data.paper_trading_freshness.stale_threshold_days}-day threshold. The scheduled recorder may have stopped running.`
                    : ` (within the ${data.paper_trading_freshness.stale_threshold_days}-day threshold).`}
                </p>
              </div>
            ) : (
              <p className="text-sm mt-2" style={{ color: "var(--muted)" }}>
                {data.paper_trading_freshness.error ?? data.paper_trading_freshness.note ?? "No freshness information available."}
              </p>
            )}
          </div>

          <div className="rounded-xl p-4" style={{ backgroundColor: "var(--surface)", border: "1px solid var(--border)" }}>
            <h2 className="font-semibold text-sm mb-3">Explore</h2>
            <div className="flex flex-col gap-2">
              {LINKS.map((l) => (
                <Link key={l.to} to={l.to} className="flex items-center justify-between py-1.5 text-sm" style={{ color: "var(--accent)" }}>
                  {l.label}
                  <ArrowRight size={14} />
                </Link>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Header() {
  return (
    <div className="flex items-center gap-2 mb-4">
      <Microscope size={20} style={{ color: "var(--accent)" }} />
      <h1 className="text-2xl font-bold">Research</h1>
    </div>
  );
}
