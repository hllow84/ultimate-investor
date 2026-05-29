import { useState } from "react";
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, Tooltip,
  ResponsiveContainer, Cell, ReferenceLine,
} from "recharts";
import type { YoYFinancials, FinancialPeriod } from "@/types";

function fmt(v: number | null): string {
  if (v === null || v === undefined) return "—";
  const abs = Math.abs(v);
  if (abs >= 1e9) return `$${(v / 1e9).toFixed(1)}B`;
  if (abs >= 1e6) return `$${(v / 1e6).toFixed(0)}M`;
  return `$${v.toFixed(2)}`;
}

function trendColor(current: number | null, prior: number | null | undefined): string {
  if (current == null || prior == null) return "var(--muted)";
  return current >= prior ? "var(--green)" : "var(--red)";
}

const POS = "var(--green)";
const NEG = "var(--red)";
const MUTED = "var(--muted)";

const tooltipStyle = {
  backgroundColor: "var(--surface)",
  border: "1px solid var(--border)",
  borderRadius: 8,
  color: "var(--text)",
  fontSize: 11,
};

const axisStyle = { fontSize: 10, fill: "var(--muted)" };

function fmtBillions(v: number): string {
  if (Math.abs(v) >= 1) return `$${v.toFixed(0)}B`;
  if (Math.abs(v) >= 0.1) return `$${(v * 1000).toFixed(0)}M`;
  return `$${(v * 1000).toFixed(1)}M`;
}

function MiniChart({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="p-4 rounded-xl" style={{ backgroundColor: "var(--surface)", border: "1px solid var(--border)" }}>
      <p className="text-xs font-semibold mb-3" style={{ color: MUTED }}>{title}</p>
      {children}
    </div>
  );
}

function TrendDot(props: {
  cx?: number; cy?: number; index?: number;
  payload?: Record<string, number | null>; dataKey: string;
  allData: FinancialPeriod; margKey: "gross_margin" | "operating_margin" | "net_margin";
}) {
  const { cx, cy, index = 0, allData, margKey } = props;
  if (cx == null || cy == null) return null;
  const cur = allData[margKey][index];
  const prior = index > 0 ? allData[margKey][index - 1] : null;
  const fill = trendColor(cur, prior === undefined ? null : prior);
  return <circle cx={cx} cy={cy} r={3} fill={fill} stroke="none" />;
}

function GrowthLabel({
  growth, isFirst,
}: { growth: number | null; isFirst: boolean }) {
  if (isFirst || growth == null) return <span style={{ color: MUTED }}>—</span>;
  return (
    <span style={{ color: growth >= 0 ? POS : NEG }}>
      {growth >= 0 ? "+" : ""}{growth.toFixed(1)}%
    </span>
  );
}

function Charts({ p, isQuarterly }: { p: FinancialPeriod; isQuarterly: boolean }) {
  const barSize = isQuarterly ? 5 : 18;
  const leftMargin = isQuarterly ? -24 : -20;
  const xInterval = isQuarterly ? 3 : 0; // show every 4th label for quarterly

  const revenueData = p.labels.map((l, i) => ({
    l, v: p.revenue[i] != null ? p.revenue[i]! / 1e9 : null,
    g: p.revenue_growth[i], prev: i > 0 ? p.revenue[i - 1] : null,
  }));

  const incomeData = p.labels.map((l, i) => ({
    l, ni: p.net_income[i] != null ? p.net_income[i]! / 1e9 : null,
    eps: p.eps[i],
    niRaw: p.net_income[i],
    prevNi: i > 0 ? p.net_income[i - 1] : null,
    niGrowth: p.net_income_growth[i],
  }));

  const marginData = p.labels.map((l, i) => ({
    l,
    gross: p.gross_margin[i],
    op: p.operating_margin[i],
    net: p.net_margin[i],
  }));

  const allMarginVals = marginData
    .flatMap(d => [d.gross, d.op, d.net])
    .filter((v): v is number => v != null);
  const marginMin = allMarginVals.length ? Math.floor(Math.min(...allMarginVals) - 3) : 0;
  const marginMax = allMarginVals.length ? Math.ceil(Math.max(...allMarginVals) + 3) : 100;

  const fcfData = p.labels.map((l, i) => ({
    l, v: p.free_cash_flow[i] != null ? p.free_cash_flow[i]! / 1e9 : null,
    raw: p.free_cash_flow[i],
    prevRaw: i > 0 ? p.free_cash_flow[i - 1] : null,
    fcfGrowth: p.fcf_growth[i],
  }));

  return (
    <div className="grid grid-cols-2 gap-4">

      {/* Revenue */}
      <MiniChart title="Revenue">
        <ResponsiveContainer width="100%" height={130}>
          <BarChart data={revenueData} barSize={barSize} margin={{ top: 4, right: 4, left: leftMargin, bottom: 0 }}>
            <XAxis dataKey="l" tick={axisStyle} axisLine={false} tickLine={false} interval={xInterval} />
            <YAxis tick={axisStyle} axisLine={false} tickLine={false} tickFormatter={fmtBillions} />
            <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => [fmtBillions(v), "Revenue"]} />
            <Bar dataKey="v" radius={[2, 2, 0, 0]}>
              {revenueData.map((d, i) => (
                <Cell key={i} fill={
                  d.g == null ? MUTED : d.g >= 0 ? POS : NEG
                } />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
        <div className="flex justify-between mt-1 overflow-hidden">
          {revenueData.filter((_, i) => !isQuarterly || i % 4 === 3 || i === revenueData.length - 1).map(({ l, g }, i) => (
            <div key={l} className="text-center" style={{ flex: 1 }}>
              <p className="text-xs"><GrowthLabel growth={g} isFirst={i === 0 && g == null} /></p>
            </div>
          ))}
        </div>
      </MiniChart>

      {/* Net Income & EPS */}
      <MiniChart title="Net Income & EPS">
        <ResponsiveContainer width="100%" height={130}>
          <BarChart data={incomeData} barSize={barSize} margin={{ top: 4, right: 4, left: leftMargin, bottom: 0 }}>
            <XAxis dataKey="l" tick={axisStyle} axisLine={false} tickLine={false} interval={xInterval} />
            <YAxis tick={axisStyle} axisLine={false} tickLine={false} tickFormatter={fmtBillions} />
            <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => [fmtBillions(v), "Net Income"]} />
            <ReferenceLine y={0} stroke="var(--border)" />
            <Bar dataKey="ni" radius={[2, 2, 0, 0]}>
              {incomeData.map((d, i) => (
                <Cell key={i} fill={trendColor(d.niRaw, d.prevNi)} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
        <div className="flex justify-between mt-1 overflow-hidden">
          {incomeData.filter((_, i) => !isQuarterly || i % 4 === 3 || i === incomeData.length - 1).map(({ l, niGrowth, eps }, i) => (
            <div key={l} className="text-center" style={{ flex: 1 }}>
              <p className="text-xs"><GrowthLabel growth={niGrowth} isFirst={niGrowth == null && i === 0} /></p>
              <p className="text-xs" style={{ color: MUTED }}>{eps != null ? `$${eps.toFixed(1)}` : ""}</p>
            </div>
          ))}
        </div>
      </MiniChart>

      {/* Margins */}
      <MiniChart title="Margins %">
        <ResponsiveContainer width="100%" height={130}>
          <LineChart data={marginData} margin={{ top: 4, right: 4, left: leftMargin, bottom: 0 }}>
            <XAxis dataKey="l" tick={axisStyle} axisLine={false} tickLine={false} interval={xInterval} />
            <YAxis tick={axisStyle} axisLine={false} tickLine={false} tickFormatter={v => `${v}%`} domain={[marginMin, marginMax]} />
            <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => [`${v.toFixed(1)}%`]} />
            <Line type="monotone" dataKey="gross" stroke="#6366f1" strokeWidth={2} name="Gross"
              dot={(props) => <TrendDot {...props} allData={p} margKey="gross_margin" dataKey="gross" />}
            />
            <Line type="monotone" dataKey="op" stroke={POS} strokeWidth={2} name="Operating"
              dot={(props) => <TrendDot {...props} allData={p} margKey="operating_margin" dataKey="op" />}
            />
            <Line type="monotone" dataKey="net" stroke="#eab308" strokeWidth={2} name="Net"
              dot={(props) => <TrendDot {...props} allData={p} margKey="net_margin" dataKey="net" />}
            />
          </LineChart>
        </ResponsiveContainer>
        <div className="flex gap-3 justify-center mt-1">
          {[["#6366f1", "Gross"], [POS, "Oper."], ["#eab308", "Net"]].map(([c, l]) => (
            <div key={l} className="flex items-center gap-1">
              <div className="w-2 h-2 rounded-full" style={{ backgroundColor: c }} />
              <span className="text-xs" style={{ color: MUTED }}>{l}</span>
            </div>
          ))}
        </div>
      </MiniChart>

      {/* Free Cash Flow */}
      <MiniChart title="Free Cash Flow">
        <ResponsiveContainer width="100%" height={130}>
          <BarChart data={fcfData} barSize={barSize} margin={{ top: 4, right: 4, left: leftMargin, bottom: 0 }}>
            <XAxis dataKey="l" tick={axisStyle} axisLine={false} tickLine={false} interval={xInterval} />
            <YAxis tick={axisStyle} axisLine={false} tickLine={false} tickFormatter={fmtBillions} />
            <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => [fmtBillions(v), "FCF"]} />
            <ReferenceLine y={0} stroke="var(--border)" />
            <Bar dataKey="v" radius={[2, 2, 0, 0]}>
              {fcfData.map((d, i) => (
                <Cell key={i} fill={trendColor(d.raw, d.prevRaw)} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
        <div className="flex justify-between mt-1 overflow-hidden">
          {fcfData.filter((_, i) => !isQuarterly || i % 4 === 3 || i === fcfData.length - 1).map(({ l, fcfGrowth, raw }, i) => (
            <div key={l} className="text-center" style={{ flex: 1 }}>
              <p className="text-xs"><GrowthLabel growth={fcfGrowth} isFirst={fcfGrowth == null && i === 0} /></p>
              <p className="text-xs" style={{ color: MUTED }}>{fmt(raw)}</p>
            </div>
          ))}
        </div>
      </MiniChart>

    </div>
  );
}

export default function FinancialsChart({ data }: { data: YoYFinancials }) {
  const [isQuarterly, setIsQuarterly] = useState(false);
  const period = isQuarterly ? data.quarterly : data.annual;

  return (
    <div className="col-span-1 md:col-span-2">
      <div className="flex items-center justify-between mb-3">
        <p className="text-sm font-medium" style={{ color: MUTED }}>Financial Performance</p>
        <div className="flex rounded-lg overflow-hidden" style={{ border: "1px solid var(--border)" }}>
          {[{ label: "Annual", val: false }, { label: "Quarterly", val: true }].map(({ label, val }) => (
            <button
              key={label}
              onClick={() => setIsQuarterly(val)}
              className="px-3 py-1 text-xs font-medium transition-colors"
              style={{
                backgroundColor: isQuarterly === val ? "var(--accent)" : "var(--surface)",
                color: isQuarterly === val ? "white" : "var(--muted)",
              }}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
      <Charts p={period} isQuarterly={isQuarterly} />
    </div>
  );
}
