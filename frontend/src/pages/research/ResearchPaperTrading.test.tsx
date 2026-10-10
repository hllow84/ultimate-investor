import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import ResearchPaperTrading from "./ResearchPaperTrading";
import { usePaperTradingLatest, usePaperTradingLog } from "@/hooks/useLab";
import type { PaperTradingLatestResponse, PaperTradingLogResponse } from "@/types/lab";

function renderPage() {
  return render(
    <MemoryRouter>
      <ResearchPaperTrading />
    </MemoryRouter>
  );
}

vi.mock("@/hooks/useLab", () => ({
  usePaperTradingLatest: vi.fn(),
  usePaperTradingLog: vi.fn(),
}));

const mockedLatest = usePaperTradingLatest as unknown as ReturnType<typeof vi.fn>;
const mockedLog = usePaperTradingLog as unknown as ReturnType<typeof vi.fn>;

function baseQueryResult(overrides: Record<string, unknown> = {}) {
  return {
    data: undefined,
    error: null,
    isPending: false,
    isError: false,
    fetchStatus: "idle",
    refetch: vi.fn(),
    ...overrides,
  };
}

const okLatest: PaperTradingLatestResponse = {
  status: "ok",
  latest: {
    recorded_at: "2026-10-09T09:00:00Z",
    status: "OK",
    data_as_of: "2026-09-30",
    is_duplicate_period: false,
    has_no_new_month_note: true,
    construction_A_weights: { sleeve_a: 0.5, sleeve_b: 0.5 },
  },
  selection_rule: "latest OK record by recorded_at",
  distinct_period_count: 9,
};

const okLog: PaperTradingLogResponse = {
  status: "ok",
  relative_path: "data/paper_trading/log.jsonl",
  source_last_modified: "2026-10-09T09:00:00Z",
  total_records: 9,
  malformed_line_count: 0,
  distinct_data_as_of_periods: ["2026-09-30"],
  records: [],
  canonical_latest: null,
  canonical_latest_selection_rule: null,
  duplicate_period_warning: null,
  error: null,
};

describe("ResearchPaperTrading", () => {
  beforeEach(() => {
    mockedLatest.mockReset();
    mockedLog.mockReset();
  });

  it("renders the canonical latest record and log on a successful response", () => {
    mockedLatest.mockReturnValue(baseQueryResult({ data: okLatest }));
    mockedLog.mockReturnValue(baseQueryResult({ data: okLog }));
    renderPage();
    expect(screen.getByText("Latest canonical observation")).toBeInTheDocument();
    expect(screen.getByText("2026-09-30")).toBeInTheDocument();
    expect(screen.getByText("Full append-only log")).toBeInTheDocument();
  });

  it("shows the Lab-unavailable notice on a 503 and offers a retry", () => {
    const latestRefetch = vi.fn();
    mockedLatest.mockReturnValue(
      baseQueryResult({ isError: true, error: new Error("API error 503: lab root missing"), refetch: latestRefetch })
    );
    mockedLog.mockReturnValue(baseQueryResult({ data: okLog }));
    renderPage();
    expect(screen.getByText("Institutional Long-Horizon Lab is unavailable")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /retry/i }));
    expect(latestRefetch).toHaveBeenCalledTimes(1);
  });

  it("shows a request-failed notice on a network rejection", () => {
    mockedLatest.mockReturnValue(baseQueryResult({ isError: true, error: new TypeError("Failed to fetch") }));
    mockedLog.mockReturnValue(baseQueryResult({ data: okLog }));
    renderPage();
    expect(screen.getByText("Request failed")).toBeInTheDocument();
    expect(screen.getByText("Failed to fetch")).toBeInTheDocument();
  });

  it("shows a distinct message for a missing/malformed artifact envelope (not a blank page)", () => {
    mockedLatest.mockReturnValue(
      baseQueryResult({ data: { status: "missing", error: "log.jsonl not found", latest: null } })
    );
    mockedLog.mockReturnValue(baseQueryResult({ data: okLog }));
    renderPage();
    expect(screen.getByText("log.jsonl not found")).toBeInTheDocument();
  });

  it("shows a paused notice (not an indefinite generic spinner) when the query is paused offline", () => {
    mockedLatest.mockReturnValue(baseQueryResult({ isPending: true, fetchStatus: "paused" }));
    mockedLog.mockReturnValue(baseQueryResult({ isPending: true, fetchStatus: "paused" }));
    renderPage();
    expect(screen.getByText(/waiting for a network connection/i)).toBeInTheDocument();
  });

  it("recovers and shows data after a failed request is retried", () => {
    mockedLatest.mockReturnValue(baseQueryResult({ isError: true, error: new Error("API error 500: boom") }));
    mockedLog.mockReturnValue(baseQueryResult({ data: okLog }));
    const { rerender } = render(<MemoryRouter><ResearchPaperTrading /></MemoryRouter>);
    expect(screen.getByText("Request failed")).toBeInTheDocument();

    mockedLatest.mockReturnValue(baseQueryResult({ data: okLatest }));
    rerender(<MemoryRouter><ResearchPaperTrading /></MemoryRouter>);
    expect(screen.queryByText("Request failed")).not.toBeInTheDocument();
    expect(screen.getByText("Latest canonical observation")).toBeInTheDocument();
  });
});
