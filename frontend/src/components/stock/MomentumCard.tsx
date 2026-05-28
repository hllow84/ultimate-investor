import type { TechnicalMomentum } from "@/types";
import {
  LineChart, Line, XAxis, YAxis, Tooltip,
  ResponsiveContainer,
} from "recharts";

function buildWriteup(d: TechnicalMomentum): string[] {
  const lines: string[] = [];
  const name = d.ticker;

  // Trend / MA sentence
  const above50 = d.pct_above_sma50 != null && d.pct_above_sma50 > 0;
  const above200 = d.pct_above_sma200 != null && d.pct_above_sma200 > 0;
  const goldenCross = above50 && above200 && d.sma50 != null && d.sma200 != null && d.sma50 > d.sma200;
  const deathCross  = !above50 && !above200 && d.sma50 != null && d.sma200 != null && d.sma50 < d.sma200;

  if (d.pct_above_sma50 != null && d.pct_above_sma200 != null) {
    if (goldenCross) {
      lines.push(`${name} is in a golden-cross setup — the 50-day MA (${d.sma50!.toFixed(2)}) is above the 200-day MA (${d.sma200!.toFixed(2)}), a classically bullish structural signal. Price sits ${Math.abs(d.pct_above_sma50).toFixed(1)}% above the 50-day and ${Math.abs(d.pct_above_sma200).toFixed(1)}% above the 200-day, confirming broad trend strength.`);
    } else if (deathCross) {
      lines.push(`${name} is in a death-cross setup — the 50-day MA (${d.sma50!.toFixed(2)}) has crossed below the 200-day MA (${d.sma200!.toFixed(2)}), a bearish structural signal. Price is ${Math.abs(d.pct_above_sma50).toFixed(1)}% below the 50-day and ${Math.abs(d.pct_above_sma200).toFixed(1)}% below the 200-day, indicating sustained downward pressure.`);
    } else if (above50 && above200) {
      lines.push(`${name} trades ${d.pct_above_sma50.toFixed(1)}% above its 50-day MA and ${d.pct_above_sma200.toFixed(1)}% above its 200-day MA — both moving averages are acting as support and the medium-term uptrend is intact.`);
    } else if (!above50 && !above200) {
      lines.push(`${name} trades ${Math.abs(d.pct_above_sma50).toFixed(1)}% below its 50-day MA and ${Math.abs(d.pct_above_sma200).toFixed(1)}% below its 200-day MA — both are acting as overhead resistance, keeping the medium-term trend bearish.`);
    } else if (above50 && !above200) {
      lines.push(`${name} has reclaimed its 50-day MA (+${d.pct_above_sma50.toFixed(1)}%) but remains ${Math.abs(d.pct_above_sma200).toFixed(1)}% below the 200-day MA — a tentative recovery that still needs to clear the longer-term resistance to confirm a trend reversal.`);
    } else {
      lines.push(`${name} has slipped below its 50-day MA (${Math.abs(d.pct_above_sma50).toFixed(1)}% below) but remains ${d.pct_above_sma200.toFixed(1)}% above the 200-day MA — short-term weakness within an intact long-term uptrend.`);
    }
  }

  // RSI sentence
  if (d.rsi > 75) {
    lines.push(`RSI at ${d.rsi.toFixed(1)} is deeply overbought — momentum is stretched and a near-term pullback or consolidation is likely before the next leg higher.`);
  } else if (d.rsi > 65) {
    lines.push(`RSI at ${d.rsi.toFixed(1)} is approaching overbought territory, suggesting strong near-term momentum that should be monitored for exhaustion.`);
  } else if (d.rsi < 25) {
    lines.push(`RSI at ${d.rsi.toFixed(1)} is deeply oversold — selling pressure is extreme and a mean-reversion bounce is possible, though fundamentals should confirm before buying.`);
  } else if (d.rsi < 35) {
    lines.push(`RSI at ${d.rsi.toFixed(1)} is in oversold territory, indicating that recent selling may be exhausted and a short-term recovery could be near.`);
  } else {
    lines.push(`RSI at ${d.rsi.toFixed(1)} is in neutral territory, giving the stock room to move in either direction without an immediate momentum extreme.`);
  }

  // 52-week range sentence
  const pct = d.pct_from_52w_high;
  if (pct >= -3) {
    lines.push(`At $${d.current_price.toFixed(2)}, the stock is within ${Math.abs(pct).toFixed(1)}% of its 52-week high — near all-time-range strength with potential resistance just overhead.`);
  } else if (pct >= -15) {
    lines.push(`Trading ${Math.abs(pct).toFixed(1)}% off its 52-week high of $${d.w52_high.toFixed(2)}, the stock is in the upper half of its annual range with room to recover to prior highs.`);
  } else if (pct >= -35) {
    lines.push(`The stock is ${Math.abs(pct).toFixed(1)}% below its 52-week high of $${d.w52_high.toFixed(2)}, sitting in the lower half of its annual range — a meaningful recovery would be needed to reclaim prior highs.`);
  } else {
    lines.push(`At ${Math.abs(pct).toFixed(1)}% below its 52-week high of $${d.w52_high.toFixed(2)}, the stock has experienced significant drawdown — watch for stabilisation near the 52-week low of $${d.w52_low.toFixed(2)} before considering a long position.`);
  }

  return lines;
}

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
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-5">
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
      {/* Technical write-up */}
      <div className="mt-1 pt-4" style={{ borderTop: "1px solid var(--border)" }}>
        <p className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: "var(--muted)" }}>Technical Summary</p>
        <div className="flex flex-col gap-2">
          {buildWriteup(data).map((line, i) => (
            <p key={i} className="text-sm leading-relaxed" style={{ color: "var(--text)" }}>{line}</p>
          ))}
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
