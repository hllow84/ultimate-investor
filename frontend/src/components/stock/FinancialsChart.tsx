import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, Tooltip,
  ResponsiveContainer, Cell, ReferenceLine,
} from "recharts";
import type { YoYFinancials } from "@/types";

function fmt(v: number | null): string {
  if (v === null || v === undefined) return "—";
  const abs = Math.abs(v);
  if (abs >= 1e9) return `$${(v / 1e9).toFixed(1)}B`;
  if (abs >= 1e6) return `$${(v / 1e6).toFixed(0)}M`;
  return `$${v.toFixed(2)}`;
}

// Color by YoY direction: green = up vs prior year, red = down, muted = first year / no data
function trendColor(current: number | null, prior: number | null, isFirst: boolean): string {
  if (isFirst || current == null || prior == null) return "var(--muted)";
  return current >= prior ? "var(--green)" : "var(--red)";
}

function trendLabel(current: number | null, prior: number | null, isFirst: boolean): string {
  if (isFirst || current == null || prior == null) return "—";
  const pct = ((current - prior) / Math.abs(prior)) * 100;
  return `${pct >= 0 ? "+" : ""}${pct.toFixed(1)}%`;
}

const POS = "var(--green)";
const NEG = "var(--red)";
const MUTED = "var(--muted)";

const tooltip = {
  backgroundColor: "var(--surface)",
  border: "1px solid var(--border)",
  borderRadius: 8,
  color: "var(--text)",
  fontSize: 11,
};

const axis = { fontSize: 10, fill: "var(--muted)" };

function MiniChart({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="p-4 rounded-xl" style={{ backgroundColor: "var(--surface)", border: "1px solid var(--border)" }}>
      <p className="text-xs font-semibold mb-3" style={{ color: MUTED }}>{title}</p>
      {children}
    </div>
  );
}

// Custom dot for line chart — colored by margin expansion/contraction vs prior year
function TrendDot(props: {
  cx?: number; cy?: number; index?: number;
  payload?: Record<string, number | null>; dataKey: string;
}) {
  const { cx, cy, index = 0, payload, dataKey } = props;
  if (cx == null || cy == null || !payload) return null;
  const cur = payload[dataKey] as number | null;
  const color =
    index === 0 || cur == null ? MUTED :
    cur > 0 ? POS : NEG; // margin itself positive = good
  return <circle cx={cx} cy={cy} r={3} fill={color} stroke="none" />;
}

export default function FinancialsChart({ data }: { data: YoYFinancials }) {
  const years = data.years;

  const revenueData = years.map((y, i) => ({
    y,
    v: data.revenue[i] != null ? data.revenue[i]! / 1e9 : null,
    g: data.revenue_growth[i],
  }));

  const incomeData = years.map((y, i) => ({
    y,
    ni: data.net_income[i] != null ? data.net_income[i]! / 1e9 : null,
    eps: data.eps[i],
    niRaw: data.net_income[i],
  }));

  const marginData = years.map((y, i) => ({
    y,
    gross: data.gross_margin[i],
    op: data.operating_margin[i],
    net: data.net_margin[i],
  }));

  const fcfData = years.map((y, i) => ({
    y,
    v: data.free_cash_flow[i] != null ? data.free_cash_flow[i]! / 1e9 : null,
    raw: data.free_cash_flow[i],
  }));

  return (
    <div className="col-span-1 md:col-span-2">
      <p className="text-sm font-medium mb-3" style={{ color: MUTED }}>Financial Performance (5-Year)</p>
      <div className="grid grid-cols-2 gap-4">

        {/* Revenue — bars colored by YoY growth direction */}
        <MiniChart title="Revenue">
          <ResponsiveContainer width="100%" height={130}>
            <BarChart data={revenueData} barSize={18} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
              <XAxis dataKey="y" tick={axis} axisLine={false} tickLine={false} />
              <YAxis tick={axis} axisLine={false} tickLine={false} tickFormatter={v => `$${v.toFixed(0)}B`} />
              <Tooltip contentStyle={tooltip} formatter={(v: number) => [`$${v.toFixed(1)}B`, "Revenue"]} />
              <Bar dataKey="v" radius={[3, 3, 0, 0]}>
                {revenueData.map((d, i) => (
                  <Cell
                    key={i}
                    fill={
                      i === 0 || d.g == null ? MUTED :
                      d.g >= 0 ? POS : NEG
                    }
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
          <div className="flex justify-between mt-1">
            {revenueData.map(({ y, g }, i) => (
              <div key={y} className="text-center" style={{ flex: 1 }}>
                <p className="text-xs font-medium" style={{ color: i === 0 || g == null ? MUTED : g >= 0 ? POS : NEG }}>
                  {i === 0 || g == null ? "—" : `${g >= 0 ? "+" : ""}${g.toFixed(1)}%`}
                </p>
              </div>
            ))}
          </div>
        </MiniChart>

        {/* Net Income — bars colored by YoY trend vs prior year */}
        <MiniChart title="Net Income & EPS">
          <ResponsiveContainer width="100%" height={130}>
            <BarChart data={incomeData} barSize={18} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
              <XAxis dataKey="y" tick={axis} axisLine={false} tickLine={false} />
              <YAxis tick={axis} axisLine={false} tickLine={false} tickFormatter={v => `$${v.toFixed(0)}B`} />
              <Tooltip contentStyle={tooltip} formatter={(v: number) => [`$${v.toFixed(1)}B`, "Net Income"]} />
              <ReferenceLine y={0} stroke="var(--border)" />
              <Bar dataKey="ni" radius={[3, 3, 0, 0]}>
                {incomeData.map((d, i) => (
                  <Cell
                    key={i}
                    fill={trendColor(d.niRaw, i > 0 ? incomeData[i - 1].niRaw : null, i === 0)}
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
          <div className="flex justify-between mt-1">
            {incomeData.map(({ y, niRaw, eps }, i) => (
              <div key={y} className="text-center" style={{ flex: 1 }}>
                <p className="text-xs font-medium" style={{
                  color: trendColor(niRaw, i > 0 ? incomeData[i - 1].niRaw : null, i === 0)
                }}>
                  {trendLabel(niRaw, i > 0 ? incomeData[i - 1].niRaw : null, i === 0)}
                </p>
                <p className="text-xs" style={{ color: MUTED }}>
                  {eps != null ? `$${eps.toFixed(1)}` : ""}
                </p>
              </div>
            ))}
          </div>
        </MiniChart>

        {/* Margins — lines with trend-colored dots */}
        <MiniChart title="Margins %">
          <ResponsiveContainer width="100%" height={130}>
            <LineChart data={marginData} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
              <XAxis dataKey="y" tick={axis} axisLine={false} tickLine={false} />
              <YAxis tick={axis} axisLine={false} tickLine={false} tickFormatter={v => `${v}%`} />
              <Tooltip contentStyle={tooltip} formatter={(v: number) => [`${v.toFixed(1)}%`]} />
              <Line
                type="monotone" dataKey="gross" stroke="#6366f1" strokeWidth={2} name="Gross"
                dot={(p) => <TrendDot {...p} dataKey="gross" />}
              />
              <Line
                type="monotone" dataKey="op" stroke={POS} strokeWidth={2} name="Operating"
                dot={(p) => <TrendDot {...p} dataKey="op" />}
              />
              <Line
                type="monotone" dataKey="net" stroke="#eab308" strokeWidth={2} name="Net"
                dot={(p) => <TrendDot {...p} dataKey="net" />}
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

        {/* FCF — bars colored by YoY trend */}
        <MiniChart title="Free Cash Flow">
          <ResponsiveContainer width="100%" height={130}>
            <BarChart data={fcfData} barSize={18} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
              <XAxis dataKey="y" tick={axis} axisLine={false} tickLine={false} />
              <YAxis tick={axis} axisLine={false} tickLine={false} tickFormatter={v => `$${v.toFixed(0)}B`} />
              <Tooltip contentStyle={tooltip} formatter={(v: number) => [`$${v.toFixed(1)}B`, "FCF"]} />
              <ReferenceLine y={0} stroke="var(--border)" />
              <Bar dataKey="v" radius={[3, 3, 0, 0]}>
                {fcfData.map((d, i) => (
                  <Cell
                    key={i}
                    fill={trendColor(d.raw, i > 0 ? fcfData[i - 1].raw : null, i === 0)}
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
          <div className="flex justify-between mt-1">
            {fcfData.map(({ y, raw }, i) => (
              <div key={y} className="text-center" style={{ flex: 1 }}>
                <p className="text-xs font-medium" style={{
                  color: trendColor(raw, i > 0 ? fcfData[i - 1].raw : null, i === 0)
                }}>
                  {trendLabel(raw, i > 0 ? fcfData[i - 1].raw : null, i === 0)}
                </p>
                <p className="text-xs" style={{ color: MUTED }}>{fmt(raw)}</p>
              </div>
            ))}
          </div>
        </MiniChart>

      </div>
    </div>
  );
}
