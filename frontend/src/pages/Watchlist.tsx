import { useMutation, useQueryClient, useQueries } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { Trash2, Star } from "lucide-react";
import { useWatchlist } from "@/hooks/useStock";
import { api } from "@/api/client";

export default function Watchlist() {
  const { data: items = [], isLoading } = useWatchlist();
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const remove = useMutation({
    mutationFn: api.watchlist.remove,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["watchlist"] }),
  });

  const summaries = useQueries({
    queries: items.map(item => ({
      queryKey: ["stock", item.ticker],
      queryFn: () => api.stocks.summary(item.ticker),
      staleTime: 1000 * 60 * 5,
    })),
  });

  if (isLoading) return <p style={{ color: "var(--muted)" }}>Loading watchlist...</p>;

  return (
    <div>
      <div className="flex items-center gap-2 mb-6">
        <Star size={20} style={{ color: "var(--accent)" }} />
        <h1 className="text-2xl font-bold">Watchlist</h1>
        <span className="text-sm ml-1" style={{ color: "var(--muted)" }}>({items.length})</span>
      </div>

      {items.length === 0 ? (
        <p style={{ color: "var(--muted)" }}>No stocks in your watchlist yet. Search for a ticker to add one.</p>
      ) : (
        <div className="flex flex-col gap-3">
          {items.map((item, i) => {
            const summary = summaries[i]?.data;
            const isLoadingPrice = summaries[i]?.isLoading;
            const changeColor = summary
              ? summary.change_pct >= 0 ? "var(--green)" : "var(--red)"
              : "var(--muted)";

            return (
              <div
                key={item.ticker}
                className="flex items-center gap-4 p-4 rounded-xl cursor-pointer"
                style={{ backgroundColor: "var(--surface)", border: "1px solid var(--border)" }}
                onClick={() => navigate(`/stock/${item.ticker}`)}
              >
                <div className="flex flex-col min-w-0">
                  <span className="font-bold text-lg">{item.ticker}</span>
                  {summary
                    ? <span className="text-xs truncate" style={{ color: "var(--muted)" }}>{summary.name}</span>
                    : isLoadingPrice
                    ? <div className="h-3 w-28 rounded animate-pulse mt-1" style={{ backgroundColor: "var(--border)" }} />
                    : null}
                </div>

                {item.notes && (
                  <span className="text-sm hidden sm:block" style={{ color: "var(--muted)" }}>{item.notes}</span>
                )}

                <div className="ml-auto flex items-center gap-4">
                  {isLoadingPrice ? (
                    <div className="flex flex-col items-end gap-1">
                      <div className="h-4 w-20 rounded animate-pulse" style={{ backgroundColor: "var(--border)" }} />
                      <div className="h-3 w-12 rounded animate-pulse" style={{ backgroundColor: "var(--border)" }} />
                    </div>
                  ) : summary ? (
                    <div className="text-right">
                      <p className="font-semibold">${summary.price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                      <p className="text-xs font-medium" style={{ color: changeColor }}>
                        {summary.change_pct >= 0 ? "+" : ""}{summary.change_pct.toFixed(2)}%
                      </p>
                    </div>
                  ) : null}

                  <button
                    className="p-1.5 rounded-lg flex-shrink-0"
                    style={{ color: "var(--red)" }}
                    onClick={(e) => { e.stopPropagation(); remove.mutate(item.ticker); }}
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
