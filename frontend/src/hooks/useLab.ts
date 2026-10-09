import { useQuery } from "@tanstack/react-query";
import { api } from "@/api/client";

// Lab research artifacts are one-time/periodic backtest outputs, not a
// live feed -- a longer staleTime avoids refetch churn for data that
// realistically only changes when a new phase is run.
const RESEARCH_STALE_TIME = 1000 * 60 * 10;

export function useLabHealth() {
  return useQuery({
    queryKey: ["lab", "health"],
    queryFn: api.lab.health,
    staleTime: 1000 * 60 * 2,
  });
}

export function useLabStrategies() {
  return useQuery({
    queryKey: ["lab", "strategies"],
    queryFn: api.lab.strategies,
    staleTime: RESEARCH_STALE_TIME,
  });
}

export function useLabDiagnostics() {
  return useQuery({
    queryKey: ["lab", "diagnostics"],
    queryFn: api.lab.diagnostics,
    staleTime: RESEARCH_STALE_TIME,
  });
}

export function useLabPortfolios() {
  return useQuery({
    queryKey: ["lab", "portfolios"],
    queryFn: api.lab.portfolios,
    staleTime: RESEARCH_STALE_TIME,
  });
}

export function usePaperTradingLog() {
  return useQuery({
    queryKey: ["lab", "paper-trading", "log"],
    queryFn: api.lab.paperTradingLog,
    staleTime: 1000 * 60 * 5,
  });
}

export function usePaperTradingLatest() {
  return useQuery({
    queryKey: ["lab", "paper-trading", "latest"],
    queryFn: api.lab.paperTradingLatest,
    staleTime: 1000 * 60 * 5,
  });
}
