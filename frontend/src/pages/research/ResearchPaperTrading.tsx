import { useState } from "react";
import { ClipboardList, ChevronDown, ChevronUp, CheckCircle2, XCircle } from "lucide-react";
import { usePaperTradingLatest, usePaperTradingLog } from "@/hooks/useLab";
import ResearchTabs from "@/components/lab/ResearchTabs";
import ArtifactStatusBadge from "@/components/lab/ArtifactStatusBadge";
import DuplicatePeriodBanner from "@/components/lab/DuplicatePeriodBanner";
import WeightsBar from "@/components/lab/WeightsBar";
import { LoadingNotice, QueryErrorNotice } from "@/components/lab/QueryStateNotice";
import { formatDateTime, formatPercent } from "@/utils/labFormat";
import type { PaperTradingRecord } from "@/types/lab";

function RecordRow({ record }: { record: PaperTradingRecord }) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ borderTop: "1px solid var(--border)" }}>
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between gap-3 py-2 text-left text-sm"
      >
        <div className="flex items-center gap-3 flex-wrap">
          <span className="font-mono">{formatDateTime(record.recorded_at)}</span>
          <span style={{ color: "var(--muted)" }}>data_as_of {record.data_as_of}</span>
          <span
            className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium"
            style={{
              color: record.status === "OK" ? "var(--green)" : "var(--red)",
              border: `1px solid ${record.status === "OK" ? "var(--green)" : "var(--red)"}`,
            }}
          >
            {record.status === "OK" ? <CheckCircle2 size={12} /> : <XCircle size={12} />}
            {record.status}
          </span>
          {record.is_duplicate_period && (
            <span className="text-xs px-2 py-0.5 rounded-full" style={{ border: "1px solid var(--yellow)", color: "var(--yellow)" }}>
              duplicate period
            </span>
          )}
        </div>
        {open ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
      </button>
      {open && (
        <div className="pb-3 pl-1 text-sm flex flex-col gap-3">
          {record.realized_since_last_recording?.note && (
            <p style={{ color: "var(--muted)" }}>Note: {record.realized_since_last_recording.note}</p>
          )}
          {record.turnover_and_cost && (
            <div className="grid grid-cols-2 gap-2 text-xs">
              {Object.entries(record.turnover_and_cost).map(([k, v]) => (
                <div key={k} className="flex justify-between">
                  <span style={{ color: "var(--muted)" }}>{k}</span>
                  <span className="font-mono">{formatPercent(v, 3)}</span>
                </div>
              ))}
            </div>
          )}
          {record.construction_A_weights && (
            <div>
              <p className="text-xs font-medium mb-1" style={{ color: "var(--muted)" }}>Construction A weights</p>
              <WeightsBar weights={record.construction_A_weights} />
            </div>
          )}
          {record.construction_B_weights && (
            <div>
              <p className="text-xs font-medium mb-1" style={{ color: "var(--muted)" }}>Construction B weights</p>
              <WeightsBar weights={record.construction_B_weights} />
            </div>
          )}
          {(!record.construction_A_weights && !record.construction_B_weights) && (
            <p className="text-xs" style={{ color: "var(--muted)" }}>No weights present on this record.</p>
          )}
        </div>
      )}
    </div>
  );
}

export default function ResearchPaperTrading() {
  const latestQuery = usePaperTradingLatest();
  const logQuery = usePaperTradingLog();
  const latest = latestQuery.data;
  const log = logQuery.data;

  return (
    <div>
      <div className="flex items-center gap-2 mb-4">
        <ClipboardList size={20} style={{ color: "var(--accent)" }} />
        <h1 className="text-2xl font-bold">Research</h1>
      </div>
      <ResearchTabs />

      <p className="text-xs mb-4" style={{ color: "var(--muted)" }}>
        These are simulated paper-trading records only. No broker connection or executed order
        exists anywhere in this system, and a short history of records does not demonstrate a
        meaningful live track record.
      </p>

      {(latestQuery.isPending || logQuery.isPending) && <LoadingNotice label="Loading paper-trading records…" />}
      {(latestQuery.isError || logQuery.isError) && (
        <QueryErrorNotice error={latestQuery.error ?? logQuery.error} />
      )}

      {latest && (
        <div className="rounded-xl p-4 mb-4" style={{ backgroundColor: "var(--surface)", border: "1px solid var(--border)" }}>
          <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
            <h2 className="font-semibold text-sm">Latest canonical observation</h2>
            <ArtifactStatusBadge status={latest.status} />
          </div>

          {latest.status !== "ok" ? (
            <p className="text-sm" style={{ color: "var(--muted)" }}>
              {latest.error ?? "No paper-trading record is available."}
            </p>
          ) : !latest.latest ? (
            <p className="text-sm" style={{ color: "var(--muted)" }}>
              The log exists but contains no valid OK record yet.
            </p>
          ) : (
            <div className="flex flex-col gap-3">
              <div className="flex flex-wrap gap-4 text-sm">
                <Stat label="data_as_of" value={latest.latest.data_as_of} />
                <Stat label="recorded_at" value={formatDateTime(latest.latest.recorded_at)} />
                <Stat label="status" value={latest.latest.status} />
                {latest.distinct_period_count !== undefined && (
                  <Stat label="distinct periods observed" value={String(latest.distinct_period_count)} />
                )}
              </div>

              {latest.freshness && latest.freshness.status === "ok" && (
                <p className="text-xs" style={{ color: latest.freshness.is_stale ? "var(--red)" : "var(--muted)" }}>
                  {latest.freshness.days_since_last_success?.toFixed(1)} day(s) since last successful
                  recording {latest.freshness.is_stale ? `— exceeds the ${latest.freshness.stale_threshold_days}-day threshold` : ""}.
                </p>
              )}

              <DuplicatePeriodBanner warning={latest.duplicate_period_warning} />

              {latest.track_record_note && (
                <p className="text-xs" style={{ color: "var(--yellow)" }}>{latest.track_record_note}</p>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {latest.latest.construction_A_weights && (
                  <div>
                    <p className="text-xs font-medium mb-1" style={{ color: "var(--muted)" }}>Construction A weights</p>
                    <WeightsBar weights={latest.latest.construction_A_weights} />
                  </div>
                )}
                {latest.latest.construction_B_weights && (
                  <div>
                    <p className="text-xs font-medium mb-1" style={{ color: "var(--muted)" }}>Construction B weights</p>
                    <WeightsBar weights={latest.latest.construction_B_weights} />
                  </div>
                )}
              </div>

              {latest.latest.turnover_and_cost && (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                  {Object.entries(latest.latest.turnover_and_cost).map(([k, v]) => (
                    <div key={k}>
                      <p style={{ color: "var(--muted)" }}>{k}</p>
                      <p className="font-mono">{formatPercent(v, 3)}</p>
                    </div>
                  ))}
                </div>
              )}

              {latest.selection_rule && (
                <details>
                  <summary className="text-xs cursor-pointer" style={{ color: "var(--accent)" }}>
                    How is "latest" selected?
                  </summary>
                  <p className="text-xs mt-1" style={{ color: "var(--muted)" }}>{latest.selection_rule}</p>
                </details>
              )}
            </div>
          )}
        </div>
      )}

      {log && (
        <div className="rounded-xl p-4" style={{ backgroundColor: "var(--surface)", border: "1px solid var(--border)" }}>
          <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
            <h2 className="font-semibold text-sm">Full append-only log</h2>
            <ArtifactStatusBadge status={log.status} />
          </div>

          {log.status !== "ok" ? (
            <p className="text-sm" style={{ color: "var(--muted)" }}>{log.error ?? "Log is not available."}</p>
          ) : (
            <>
              <div className="flex flex-wrap gap-6 text-sm mb-2">
                <Stat label="Raw record count" value={String(log.total_records)} />
                <Stat label="Distinct data_as_of periods" value={String(log.distinct_data_as_of_periods.length)} />
                <Stat label="Malformed lines" value={String(log.malformed_line_count)} />
              </div>
              <p className="text-xs mb-3" style={{ color: "var(--muted)" }}>
                Raw record count and distinct-period count are shown separately on purpose: a high
                record count with a low distinct-period count means most records are repeats of the
                same observation, not additional independent data points.
              </p>
              <DuplicatePeriodBanner warning={log.duplicate_period_warning} />
              <div>
                {log.records.map((r, i) => <RecordRow key={`${r.recorded_at}-${i}`} record={r} />)}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs" style={{ color: "var(--muted)" }}>{label}</p>
      <p className="font-mono text-sm">{value}</p>
    </div>
  );
}
