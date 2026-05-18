import { useQuery } from "@tanstack/react-query";
import { api } from "@/api/client";

export function useStockSummary(ticker: string) {
  return useQuery({
    queryKey: ["stock", ticker],
    queryFn: () => api.stocks.summary(ticker),
    enabled: !!ticker,
  });
}

export function useHealthScore(ticker: string) {
  return useQuery({
    queryKey: ["health", ticker],
    queryFn: () => api.analysis.health(ticker),
    enabled: !!ticker,
    staleTime: 1000 * 60 * 5,
  });
}

export function useValuation(ticker: string) {
  return useQuery({
    queryKey: ["valuation", ticker],
    queryFn: () => api.analysis.valuation(ticker),
    enabled: !!ticker,
    staleTime: 1000 * 60 * 5,
  });
}

export function useMoat(ticker: string) {
  return useQuery({
    queryKey: ["moat", ticker],
    queryFn: () => api.analysis.moat(ticker),
    enabled: !!ticker,
    staleTime: 1000 * 60 * 30,
  });
}

export function useSentiment(ticker: string) {
  return useQuery({
    queryKey: ["sentiment", ticker],
    queryFn: () => api.analysis.sentiment(ticker),
    enabled: !!ticker,
    staleTime: 1000 * 60 * 15,
  });
}

export function useValuationRange(ticker: string) {
  return useQuery({
    queryKey: ["valuation-range", ticker],
    queryFn: () => api.analysis.valuationRange(ticker),
    enabled: !!ticker,
    staleTime: 1000 * 60 * 10,
  });
}

export function useYoYFinancials(ticker: string) {
  return useQuery({
    queryKey: ["financials", ticker],
    queryFn: () => api.analysis.financials(ticker),
    enabled: !!ticker,
    staleTime: 1000 * 60 * 60,
  });
}

export function useMomentum(ticker: string) {
  return useQuery({
    queryKey: ["momentum", ticker],
    queryFn: () => api.analysis.momentum(ticker),
    enabled: !!ticker,
    staleTime: 1000 * 60 * 5,
  });
}

export function useWatchlist() {
  return useQuery({
    queryKey: ["watchlist"],
    queryFn: api.watchlist.list,
  });
}
