import type { SentimentResult } from "@/types";
import { Newspaper } from "lucide-react";

function sentimentLabel(score: number) {
  if (score > 0.3) return { label: "Positive", color: "var(--green)" };
  if (score < -0.3) return { label: "Negative", color: "var(--red)" };
  return { label: "Neutral", color: "var(--yellow)" };
}

export default function SentimentCard({ data }: { data: SentimentResult }) {
  const { label, color } = sentimentLabel(data.news_sentiment);
  const barWidth = ((data.news_sentiment + 1) / 2) * 100;

  return (
    <div className="p-5 rounded-xl" style={{ backgroundColor: "var(--surface)", border: "1px solid var(--border)" }}>
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm font-medium" style={{ color: "var(--muted)" }}>News Sentiment</p>
        <div className="flex items-center gap-1.5">
          <Newspaper size={14} style={{ color: "var(--muted)" }} />
          <span className="text-xs" style={{ color: "var(--muted)" }}>{data.headline_count} headlines</span>
        </div>
      </div>

      <div className="flex items-center gap-3 mb-4">
        <span className="text-xl font-bold" style={{ color }}>{label}</span>
        <span className="text-sm" style={{ color: "var(--muted)" }}>({data.news_sentiment.toFixed(2)})</span>
      </div>

      <div className="h-2 rounded-full mb-4" style={{ backgroundColor: "var(--border)" }}>
        <div
          className="h-2 rounded-full transition-all"
          style={{ width: `${barWidth}%`, backgroundColor: color }}
        />
      </div>

      <p className="text-sm" style={{ color: "var(--muted)" }}>{data.summary}</p>
    </div>
  );
}
