import { useMutation, useQueryClient } from "@tanstack/react-query";
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
          {items.map((item) => (
            <div
              key={item.ticker}
              className="flex items-center gap-4 p-4 rounded-xl cursor-pointer"
              style={{ backgroundColor: "var(--surface)", border: "1px solid var(--border)" }}
              onClick={() => navigate(`/stock/${item.ticker}`)}
            >
              <span className="font-bold text-lg">{item.ticker}</span>
              {item.notes && <span className="text-sm" style={{ color: "var(--muted)" }}>{item.notes}</span>}
              <button
                className="ml-auto p-1.5 rounded-lg"
                style={{ color: "var(--red)" }}
                onClick={(e) => { e.stopPropagation(); remove.mutate(item.ticker); }}
              >
                <Trash2 size={16} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
