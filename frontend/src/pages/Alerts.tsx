import { useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bell, Trash2, Plus, CheckCircle, Clock } from "lucide-react";
import { api } from "@/api/client";
import type { Alert } from "@/types";

export default function Alerts() {
  const queryClient = useQueryClient();
  const { data: alerts = [], isLoading } = useQuery({
    queryKey: ["alerts"],
    queryFn: api.alerts.list,
    refetchInterval: 30_000, // poll every 30s so triggered status updates
  });
  const [form, setForm] = useState({
    ticker: "",
    alert_type: "price_above" as Alert["alert_type"],
    threshold: "",
  });

  const create = useMutation({
    mutationFn: api.alerts.create,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["alerts"] });
      setForm({ ticker: "", alert_type: "price_above", threshold: "" });
    },
  });

  const remove = useMutation({
    mutationFn: api.alerts.delete,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["alerts"] }),
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.ticker || !form.threshold) return;
    create.mutate({
      ticker: form.ticker.toUpperCase(),
      alert_type: form.alert_type,
      threshold: parseFloat(form.threshold),
      active: true,
    });
  }

  const active = alerts.filter(a => !a.triggered_at);
  const triggered = alerts.filter(a => !!a.triggered_at);

  return (
    <div className="flex flex-col gap-6 max-w-2xl">
      <div className="flex items-center gap-2">
        <Bell size={20} style={{ color: "var(--accent)" }} />
        <h1 className="text-2xl font-bold">Price Alerts</h1>
      </div>

      {/* Create form */}
      <form
        onSubmit={handleSubmit}
        className="p-5 rounded-xl flex gap-3 flex-wrap items-end"
        style={{ backgroundColor: "var(--surface)", border: "1px solid var(--border)" }}
      >
        <div className="flex flex-col gap-1">
          <label className="text-xs" style={{ color: "var(--muted)" }}>Ticker</label>
          <input
            value={form.ticker}
            onChange={e => setForm({ ...form, ticker: e.target.value.toUpperCase() })}
            placeholder="AAPL"
            maxLength={10}
            className="px-3 py-2 rounded-lg text-sm outline-none"
            style={{ backgroundColor: "var(--bg)", border: "1px solid var(--border)", color: "var(--text)", width: 90 }}
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs" style={{ color: "var(--muted)" }}>Condition</label>
          <select
            value={form.alert_type}
            onChange={e => setForm({ ...form, alert_type: e.target.value as Alert["alert_type"] })}
            className="px-3 py-2 rounded-lg text-sm outline-none"
            style={{ backgroundColor: "var(--bg)", border: "1px solid var(--border)", color: "var(--text)" }}
          >
            <option value="price_above">Price above</option>
            <option value="price_below">Price below</option>
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs" style={{ color: "var(--muted)" }}>Threshold ($)</label>
          <input
            value={form.threshold}
            onChange={e => setForm({ ...form, threshold: e.target.value })}
            placeholder="200.00"
            type="number"
            step="0.01"
            min="0"
            className="px-3 py-2 rounded-lg text-sm outline-none"
            style={{ backgroundColor: "var(--bg)", border: "1px solid var(--border)", color: "var(--text)", width: 120 }}
          />
        </div>
        <button
          type="submit"
          disabled={!form.ticker || !form.threshold || create.isPending}
          className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-opacity"
          style={{
            backgroundColor: "var(--accent)",
            color: "white",
            opacity: !form.ticker || !form.threshold ? 0.45 : 1,
          }}
        >
          <Plus size={14} /> Add Alert
        </button>
      </form>

      {isLoading && <p style={{ color: "var(--muted)" }}>Loading...</p>}

      {/* Active alerts */}
      {active.length > 0 && (
        <section>
          <p className="text-xs font-semibold uppercase tracking-widest mb-2" style={{ color: "var(--muted)" }}>
            Active — checked every 5 min
          </p>
          <div className="flex flex-col gap-2">
            {active.map(alert => (
              <AlertRow key={alert.id} alert={alert} onDelete={() => remove.mutate(alert.id!)} />
            ))}
          </div>
        </section>
      )}

      {/* Triggered alerts */}
      {triggered.length > 0 && (
        <section>
          <p className="text-xs font-semibold uppercase tracking-widest mb-2" style={{ color: "var(--green)" }}>
            Triggered
          </p>
          <div className="flex flex-col gap-2">
            {triggered.map(alert => (
              <AlertRow key={alert.id} alert={alert} onDelete={() => remove.mutate(alert.id!)} />
            ))}
          </div>
        </section>
      )}

      {!isLoading && alerts.length === 0 && (
        <div className="text-center py-16" style={{ color: "var(--muted)" }}>
          <Bell size={36} className="mx-auto mb-3 opacity-30" />
          <p className="font-medium">No alerts yet</p>
          <p className="text-sm mt-1">Create one above to get notified when a stock hits your target</p>
        </div>
      )}

      {/* Email setup hint */}
      <div className="p-4 rounded-xl text-sm" style={{ backgroundColor: "var(--surface)", border: "1px solid var(--border)", color: "var(--muted)" }}>
        <p className="font-medium mb-1" style={{ color: "var(--text)" }}>Email notifications</p>
        <p>Add these to <code className="text-xs px-1 py-0.5 rounded" style={{ backgroundColor: "var(--bg)" }}>backend/.env</code> to receive email alerts:</p>
        <pre className="mt-2 text-xs p-2 rounded overflow-x-auto" style={{ backgroundColor: "var(--bg)" }}>
{`SMTP_FROM=you@gmail.com
SMTP_PASSWORD=xxxx xxxx xxxx xxxx
ALERT_EMAIL_TO=you@gmail.com`}
        </pre>
        <p className="mt-2 text-xs">
          <code>SMTP_PASSWORD</code> is a{" "}
          <a href="https://myaccount.google.com/apppasswords" target="_blank" rel="noreferrer" className="underline">
            Gmail App Password
          </a>
          {" "}(16 chars). Without it, triggered alerts print to the server console.
        </p>
      </div>
    </div>
  );
}

function AlertRow({ alert, onDelete }: { alert: Alert; onDelete: () => void }) {
  const triggered = !!alert.triggered_at;
  const direction = alert.alert_type === "price_above" ? "above" : "below";

  const triggeredDate = alert.triggered_at
    ? new Date(alert.triggered_at).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })
    : null;

  return (
    <div
      className="flex items-center gap-3 px-4 py-3 rounded-xl"
      style={{
        backgroundColor: "var(--surface)",
        border: `1px solid ${triggered ? "var(--green)" : "var(--border)"}`,
        opacity: triggered ? 0.8 : 1,
      }}
    >
      {triggered
        ? <CheckCircle size={16} style={{ color: "var(--green)", flexShrink: 0 }} />
        : <Clock size={16} style={{ color: "var(--muted)", flexShrink: 0 }} />
      }

      <Link
        to={`/stock/${alert.ticker}`}
        className="font-bold hover:underline"
        style={{ color: "var(--accent)" }}
      >
        {alert.ticker}
      </Link>

      <span className="text-sm" style={{ color: "var(--muted)" }}>
        {direction} <span className="font-medium" style={{ color: "var(--text)" }}>${alert.threshold.toFixed(2)}</span>
      </span>

      {triggered && triggeredDate && (
        <span className="text-xs ml-auto mr-2" style={{ color: "var(--green)" }}>
          Fired {triggeredDate}
        </span>
      )}

      <button
        onClick={onDelete}
        className="ml-auto hover:opacity-70 transition-opacity"
        style={{ color: "var(--muted)", flexShrink: 0 }}
        title="Delete alert"
      >
        <Trash2 size={15} />
      </button>
    </div>
  );
}
