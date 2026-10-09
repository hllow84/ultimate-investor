import { NavLink } from "react-router-dom";

const TABS = [
  { to: "/research", label: "Overview", end: true },
  { to: "/research/strategies", label: "Strategies" },
  { to: "/research/portfolios", label: "Portfolio Diagnostics" },
  { to: "/research/paper-trading", label: "Paper Trading" },
];

export default function ResearchTabs() {
  return (
    <div className="flex gap-1 mb-6 border-b overflow-x-auto" style={{ borderColor: "var(--border)" }}>
      {TABS.map((t) => (
        <NavLink
          key={t.to}
          to={t.to}
          end={t.end}
          className="px-3 py-2 text-sm font-medium whitespace-nowrap border-b-2 transition-colors"
          style={({ isActive }) => ({
            borderColor: isActive ? "var(--accent)" : "transparent",
            color: isActive ? "var(--accent)" : "var(--muted)",
          })}
        >
          {t.label}
        </NavLink>
      ))}
    </div>
  );
}
