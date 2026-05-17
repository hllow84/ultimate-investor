import { useState } from "react";
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, Tooltip,
  ResponsiveContainer, Cell, ReferenceLine,
} from "recharts";
import type { YoYFinancials } from "@/types";

type Tab = "revenue" | "income" | "margins" | "fcf";

const TABS: { key: Tab; label: string }[] = [
  { key: "revenue", label: "Revenue" },
  { key: "income", label: "Net Income & EPS" },
  { key: "margins", label: "Margins" },
  { key: "fcf", label: "Free Cash Flow" },
];

function fmt(v: number | null, billions = true): string {
  if (v === null || v === undefined) return "—";
  const abs = Math.abs(v);
  if (billions && abs >= 1e9) return `$${(v / 1e9).toFixed(1)}B`;
  if (billions && abs >= 1e6) return `$${(v / 1e6).toFixed(0)}M`;
  return `$${v.toFixed(2)}`;
}

function pct(v: number | null): string {
  if (v === null || v === undefined) return "—";
  return `${v >= 0 ? "+" : ""}${v.toFixed(1)}%`;
}

const BAR_COLOR = "var(--accent)";
const POS_COLOR = "var(--green)";
const NEG_COLOR = "var(--red)";

export default function FinancialsChart({ data }: { data: YoYFinancials }) {
  const [tab, setTab] = useState<Tab>("revenue");

  const years = data.years;

  const revenueData = years.map((y, i) => ({
    year: y,
    revenue: data.revenue[i] !== null ? (data.revenue[i]! / 1e9) : null,
    growth: data.revenue_growth[i],
  }));

  const incomeData = years.map((y, i) => ({
    year: y,
    net_income: data.net_income[i] !== null ? (data.net_income[i]! / 1e9) : null,
    eps: data.eps[i],
  }));

  const marginData = years.map((y, i) => ({
    year: y,
    gross: data.gross_margin[i],
    operating: data.operating_margin[i],
    net: data.net_margin[i],
  }));

  const fcfData = years.map((y, i) => ({
    year: y,
    fcf: data.free_cash_flow[i] !== null ? (data.free_cash_flow[i]! / 1e9) : null,
  }));

  const tooltipStyle = {
    backgroundColor: "var(--surface)",
    border: "1px solid var(--border)",
    borderRadius: 8,
    color: "var(--text)",
    fontSize: 12,
  };

  return (
    <div className="p-5 rounded-xl col-span-1 md:col-span-2" style={{ backgroundColor: "var(--surface)", border: "1px solid var(--border)" }}>
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <p className="text-sm font-medium" style={{ color: "var(--muted)" }}>Financial Performance (5-Year)</p>
        <div className="flex gap-1">
          {TABS.map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className="px-3 py-1 rounded-lg text-xs font-medium transition-colors"
              style={{
                backgroundColor: tab === key ? "var(--accent)" : "var(--bg)",
                color: tab === key ? "white" : "var(--muted)",
                border: "1px solid var(--border)",
              }}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {tab === "revenue" && (
        <div className="flex flex-col gap-4">
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={revenueData} barSize={28}>
              <XAxis dataKey="year" tick={{ fontSize: 11, fill: "var(--muted)" }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 11, fill: "var(--muted)" }} axisLine={false} tickLine={false} tickFormatter={v => `$${v.toFixed(0)}B`} />
              <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => [`$${v.toFixed(1)}B`, "Revenue"]} />
              <Bar dataKey="revenue" radius={[4, 4, 0, 0]} fill={BAR_COLOR} />
            </BarChart>
          </ResponsiveContainer>
          <div className="grid grid-cols-5 gap-2 text-center">
            {revenueData.map(({ year, revenue, growth }) => (
              <div key={year}>
                <p className="text-xs font-medium">{revenue !== null ? fmt(revenue! * 1e9) : "—"}</p>
                <p className="text-xs" style={{ color: growth !== null && growth >= 0 ? POS_COLOR : NEG_COLOR }}>
                  {growth !== null ? pct(growth) : "—"}
                </p>
                <p className="text-xs" style={{ color: "var(--muted)" }}>{year}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {tab === "income" && (
        <div className="flex flex-col gap-4">
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={incomeData} barSize={28}>
              <XAxis dataKey="year" tick={{ fontSize: 11, fill: "var(--muted)" }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 11, fill: "var(--muted)" }} axisLine={false} tickLine={false} tickFormatter={v => `$${v.toFixed(0)}B`} />
              <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => [`$${v.toFixed(1)}B`, "Net Income"]} />
              <ReferenceLine y={0} stroke="var(--border)" />
              <Bar dataKey="net_income" radius={[4, 4, 0, 0]}>
                {incomeData.map((d, i) => (
                  <Cell key={i} fill={d.net_income !== null && d.net_income >= 0 ? POS_COLOR : NEG_COLOR} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
          <div className="grid grid-cols-5 gap-2 text-center">
            {incomeData.map(({ year, net_income, eps }) => (
              <div key={year}>
                <p className="text-xs font-medium">{net_income !== null ? fmt(net_income! * 1e9) : "—"}</p>
                <p className="text-xs" style={{ color: "var(--muted)" }}>EPS {eps !== null ? `$${eps.toFixed(2)}` : "—"}</p>
                <p className="text-xs" style={{ color: "var(--muted)" }}>{year}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {tab === "margins" && (
        <div className="flex flex-col gap-4">
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={marginData}>
              <XAxis dataKey="year" tick={{ fontSize: 11, fill: "var(--muted)" }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 11, fill: "var(--muted)" }} axisLine={false} tickLine={false} tickFormatter={v => `${v}%`} />
              <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => [`${v.toFixed(1)}%`]} />
              <Line type="monotone" dataKey="gross" stroke="#6366f1" dot={false} strokeWidth={2} name="Gross" />
              <Line type="monotone" dataKey="operating" stroke="#22c55e" dot={false} strokeWidth={2} name="Operating" />
              <Line type="monotone" dataKey="net" stroke="#eab308" dot={false} strokeWidth={2} name="Net" />
            </LineChart>
          </ResponsiveContainer>
          <div className="flex gap-4 justify-center text-xs">
            {[["#6366f1", "Gross"], ["#22c55e", "Operating"], ["#eab308", "Net"]].map(([color, label]) => (
              <div key={label} className="flex items-center gap-1.5">
                <div className="w-3 h-3 rounded-full" style={{ backgroundColor: color }} />
                <span style={{ color: "var(--muted)" }}>{label} Margin</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {tab === "fcf" && (
        <div className="flex flex-col gap-4">
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={fcfData} barSize={28}>
              <XAxis dataKey="year" tick={{ fontSize: 11, fill: "var(--muted)" }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 11, fill: "var(--muted)" }} axisLine={false} tickLine={false} tickFormatter={v => `$${v.toFixed(0)}B`} />
              <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => [`$${v.toFixed(1)}B`, "FCF"]} />
              <ReferenceLine y={0} stroke="var(--border)" />
              <Bar dataKey="fcf" radius={[4, 4, 0, 0]}>
                {fcfData.map((d, i) => (
                  <Cell key={i} fill={d.fcf !== null && d.fcf >= 0 ? POS_COLOR : NEG_COLOR} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
          <div className="grid grid-cols-5 gap-2 text-center">
            {fcfData.map(({ year, fcf }) => (
              <div key={year}>
                <p className="text-xs font-medium" style={{ color: fcf !== null && fcf >= 0 ? POS_COLOR : NEG_COLOR }}>
                  {fcf !== null ? fmt(fcf! * 1e9) : "—"}
                </p>
                <p className="text-xs" style={{ color: "var(--muted)" }}>{year}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
