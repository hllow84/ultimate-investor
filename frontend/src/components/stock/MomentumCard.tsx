import type { TechnicalMomentum } from "@/types";
import {
  LineChart, Line, XAxis, YAxis, Tooltip,
  ResponsiveContainer,
} from "recharts";

const SIGNAL_COLOR: Record<string, string> = {
  bullish: "var(--green)",
  neutral: "var(--accent)",
  bearish: "var(--red)",
};

export default function MomentumCard({ data }: { data: TechnicalMomentum }) {
  const signalColor = SIGNAL_COLOR[data.signal];
  const priceRange = data.w52_high - data.w52_low;
  const pricePos = priceRange > 0
    ? ((data.current_price - data.w52_low) / priceRange) * 100
    : 50;

  const rsiColor = data.rsi < 30 ? "var(--green)" : data.rsi > 70 ? "var(--red)" : "var(--accent)";
  const rsiLabel = data.rsi < 30 ? "Oversold" : data.rsi > 70 ? "Overbought" : "Neutral";

  // Only show dates every ~3 weeks on the chart axis
  const chartTicks = data.price_history
    .filter((_, i) => i % 15 === 0)
    .map((p) => p.date);

  const yValues = data.price_history.flatMap((p) =>
    [p.close, p.sma50, p.sma200].filter((v): v is number => v != null)
  );
  const yMin = Math.floor(Math.min(...yValues) * 0.98);
  const yMax = Math.ceil(Math.max(...yValues) * 1.02);

  return (
    <div
      className="p-5 rounded-xl col-span-1 md:col-span-2"
      style={{ backgroundColor: "var(--surface)", border: "1px solid var(--border)" }}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm font-medium" style={{ color: "var(--muted)" }}>Technical Momentum</p>
        <span
          className="text-xs font-semibold px-2 py-0.5 rounded-full capitalize"
          style={{ backgroundColor: signalColor + "22", color: signalColor }}
        >
          {data.signal}
        </span>
      </div>

      {/* Price chart with SMA overlays */}
      <ResponsiveContainer width="100%" height={180}>
        <LineChart data={data.price_history} margin={{ top: 4, right: 4, left: -10, bottom: 0 }}>
          <XAxis
            dataKey="date"
            ticks={chartTicks}
            tickFormatter={(d) => {
              const [, m, day] = d.split("-");
              return `${day}/${m}`;
            }}
            tick={{ fontSize: 10, fill: "var(--muted)" }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            domain={[yMin, yMax]}
            tick={{ fontSize: 10, fill: "var(--muted)" }}
            axisLine={false}
            tickLine={false}
            tickFormatter={(v) => `$${v}`}
          />
          <Tooltip
            contentStyle={{
              backgroundColor: "var(--surface)",
              border: "1px solid var(--border)",
              borderRadius: 8,
              fontSize: 12,
            }}
            labelStyle={{ color: "var(--muted)", marginBottom: 4 }}
            formatter={(value: number, name: string) => [
              `$${value.toFixed(2)}`,
              name === "close" ? "Price" : name === "sma50" ? "SMA 50" : "SMA 200",
            ]}
          />
          <Line
            dataKey="close"
            stroke="var(--accent)"
            dot={false}
            strokeWidth={1.5}
            connectNulls={false}
          />
          <Line
            dataKey="sma50"
            stroke="#f59e0b"
            dot={false}
            strokeWidth={1}
            strokeDasharray="4 2"
            connectNulls={false}
          />
          <Line
            dataKey="sma200"
            stroke="#ef4444"
            dot={false}
            strokeWidth={1}
            strokeDasharray="4 2"
            connectNulls={false}
          />
        </LineChart>
      </ResponsiveContainer>

      {/* Legend */}
      <div className="flex gap-4 mt-1 mb-5 justify-end">
        <Legend color="var(--accent)" label="Price" />
        <Legend color="#f59e0b" label="SMA 50" dashed />
        <Legend color="#ef4444" label="SMA 200" dashed />
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {/* RSI */}
        <div>
          <p className="text-xs mb-1" style={{ color: "var(--muted)" }}>RSI (14)</p>
          <div className="flex items-center justify-between mb-1">
            <span className="text-lg font-bold">{data.rsi.toFixed(1)}</span>
            <span className="text-xs font-medium" style={{ color: rsiColor }}>{rsiLabel}</span>
          </div>
          <div className="h-2 rounded-full overflow-hidden" style={{ backgroundColor: "var(--border)" }}>
            <div
              className="h-full rounded-full transition-all"
              style={{ width: `${data.rsi}%`, backgroundColor: rsiColor }}
            />
          </div>
          <div className="flex justify-between mt-0.5">
            <span className="text-xs" style={{ color: "var(--muted)" }}>0</span>
            <span className="text-xs" style={{ color: "var(--muted)" }}>30</span>
            <span className="text-xs" style={{ color: "var(--muted)" }}>70</span>
            <span className="text-xs" style={{ color: "var(--muted)" }}>100</span>
          </div>
        </div>

        {/* SMA 50 */}
        <div>
          <p className="text-xs mb-1" style={{ color: "var(--muted)" }}>vs SMA 50</p>
          {data.sma50 != null && data.pct_above_sma50 != null ? (
            <>
              <p className="text-lg font-bold">${data.sma50.toFixed(2)}</p>
              <p
                className="text-xs font-medium"
                style={{ color: data.pct_above_sma50 >= 0 ? "var(--green)" : "var(--red)" }}
              >
                {data.pct_above_sma50 >= 0 ? "+" : ""}{data.pct_above_sma50.toFixed(1)}% above
              </p>
            </>
          ) : (
            <p className="text-sm" style={{ color: "var(--muted)" }}>N/A</p>
          )}
        </div>

        {/* SMA 200 */}
        <div>
          <p className="text-xs mb-1" style={{ color: "var(--muted)" }}>vs SMA 200</p>
          {data.sma200 != null && data.pct_above_sma200 != null ? (
            <>
              <p className="text-lg font-bold">${data.sma200.toFixed(2)}</p>
              <p
                className="text-xs font-medium"
                style={{ color: data.pct_above_sma200 >= 0 ? "var(--green)" : "var(--red)" }}
              >
                {data.pct_above_sma200 >= 0 ? "+" : ""}{data.pct_above_sma200.toFixed(1)}% above
              </p>
            </>
          ) : (
            <p className="text-sm" style={{ color: "var(--muted)" }}>N/A</p>
          )}
        </div>

        {/* 52-week range */}
        <div>
          <p className="text-xs mb-1" style={{ color: "var(--muted)" }}>52-Week Range</p>
          <p className="text-xs mb-2" style={{ color: "var(--muted)" }}>
            ${data.w52_low.toFixed(2)} — ${data.w52_high.toFixed(2)}
          </p>
          <div className="relative h-2 rounded-full" style={{ background: "linear-gradient(to right, var(--red), #f59e0b, var(--green))" }}>
            <div
              className="absolute top-1/2 -translate-y-1/2 w-3 h-3 rounded-full border-2 border-white shadow"
              style={{ left: `calc(${Math.min(Math.max(pricePos, 4), 96)}% - 6px)`, backgroundColor: "white" }}
            />
          </div>
          <p
            className="text-xs mt-1 font-medium"
            style={{ color: data.pct_from_52w_high >= -5 ? "var(--green)" : data.pct_from_52w_high >= -20 ? "#f59e0b" : "var(--red)" }}
          >
            {data.pct_from_52w_high.toFixed(1)}% from 52w high
          </p>
        </div>
      </div>
    </div>
  );
}

function Legend({ color, label, dashed }: { color: string; label: string; dashed?: boolean }) {
  return (
    <div className="flex items-center gap-1.5">
      <svg width="20" height="10">
        <line
          x1="0" y1="5" x2="20" y2="5"
          stroke={color}
          strokeWidth="2"
          strokeDasharray={dashed ? "4 2" : undefined}
        />
      </svg>
      <span className="text-xs" style={{ color: "var(--muted)" }}>{label}</span>
    </div>
  );
}
