import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bell, Trash2, Plus } from "lucide-react";
import { api } from "@/api/client";
import type { Alert } from "@/types";

export default function Alerts() {
  const queryClient = useQueryClient();
  const { data: alerts = [], isLoading } = useQuery({ queryKey: ["alerts"], queryFn: api.alerts.list });
  const [form, setForm] = useState({ ticker: "", alert_type: "price_above" as Alert["alert_type"], threshold: "" });

  const create = useMutation({
    mutationFn: api.alerts.create,
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["alerts"] }); setForm({ ticker: "", alert_type: "price_above", threshold: "" }); },
  });

  const remove = useMutation({
    mutationFn: api.alerts.delete,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["alerts"] }),
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.ticker || !form.threshold) return;
    create.mutate({ ticker: form.ticker.toUpperCase(), alert_type: form.alert_type, threshold: parseFloat(form.threshold), active: true });
  }

  return (
    <div>
      <div className="flex items-center gap-2 mb-6">
        <Bell size={20} style={{ color: "var(--accent)" }} />
        <h1 className="text-2xl font-bold">Price Alerts</h1>
      </div>

      <form onSubmit={handleSubmit} className="p-5 rounded-xl mb-6 flex gap-3 flex-wrap" style={{ backgroundColor: "var(--surface)", border: "1px solid var(--border)" }}>
        <input value={form.ticker} onChange={(e) => setForm({ ...form, ticker: e.target.value })} placeholder="Ticker" className="px-3 py-2 rounded-lg text-sm" style={{ backgroundColor: "var(--bg)", border: "1px solid var(--border)", color: "var(--text)", width: 100 }} />
        <select value={form.alert_type} onChange={(e) => setForm({ ...form, alert_type: e.target.value as Alert["alert_type"] })} className="px-3 py-2 rounded-lg text-sm" style={{ backgroundColor: "var(--bg)", border: "1px solid var(--border)", color: "var(--text)" }}>
          <option value="price_above">Price above</option>
          <option value="price_below">Price below</option>
        </select>
        <input value={form.threshold} onChange={(e) => setForm({ ...form, threshold: e.target.value })} placeholder="$ threshold" type="number" className="px-3 py-2 rounded-lg text-sm" style={{ backgroundColor: "var(--bg)", border: "1px solid var(--border)", color: "var(--text)", width: 120 }} />
        <button type="submit" className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium" style={{ backgroundColor: "var(--accent)", color: "white" }}>
          <Plus size={14} /> Add Alert
        </button>
      </form>

      {isLoading ? <p style={{ color: "var(--muted)" }}>Loading...</p> : alerts.length === 0 ? (
        <p style={{ color: "var(--muted)" }}>No alerts set. Create one above.</p>
      ) : (
        <div className="flex flex-col gap-3">
          {alerts.map((alert) => (
            <div key={alert.id} className="flex items-center gap-4 p-4 rounded-xl" style={{ backgroundColor: "var(--surface)", border: "1px solid var(--border)" }}>
              <span className="font-bold">{alert.ticker}</span>
              <span className="text-sm" style={{ color: "var(--muted)" }}>{alert.alert_type.replace("_", " ")} ${alert.threshold}</span>
              <button className="ml-auto" style={{ color: "var(--red)" }} onClick={() => remove.mutate(alert.id!)}>
                <Trash2 size={16} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
