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

export function useWatchlist() {
  return useQuery({
    queryKey: ["watchlist"],
    queryFn: api.watchlist.list,
  });
}
