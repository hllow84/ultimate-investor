import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import ResearchStrategies from "./ResearchStrategies";
import { useLabStrategies } from "@/hooks/useLab";

vi.mock("@/hooks/useLab", () => ({
  useLabStrategies: vi.fn(),
}));

const mockedStrategies = useLabStrategies as unknown as ReturnType<typeof vi.fn>;

function renderPage() {
  return render(
    <MemoryRouter>
      <ResearchStrategies />
    </MemoryRouter>
  );
}

function envelope<T>(data: T) {
  return { key: "k", relative_path: "p", status: "ok" as const, source_last_modified: null, data, error: null };
}

describe("ResearchStrategies Deflated Sharpe label & formatting", () => {
  beforeEach(() => {
    mockedStrategies.mockReset();
  });

  it("shows the precise P(true Sharpe > N-trial benchmark) label, formats the probability as a percentage, and shows the non-forecast caption", () => {
    mockedStrategies.mockReturnValue({
      data: {
        results: envelope({
          strategy_1_momentum: {
            long_only: { CAGR: 0.1, Sharpe: 0.9 },
          },
        }),
        scorecard: envelope(null),
        deflated_sharpe: envelope({
          strategy_1_momentum: {
            RawSharpe_ann: 0.9231275909675863,
            N_trials: 2,
            T_months: 201,
            skew_monthly: 0.0034,
            kurtosis_monthly: 2.98,
            DeflatedSharpeProb: 0.9473107117415471,
            note: "PSR/DSR per Bailey & Lopez de Prado (2014)",
          },
        }),
      },
      isPending: false,
      isError: false,
      error: null,
      fetchStatus: "idle",
      refetch: vi.fn(),
    });

    renderPage();

    expect(screen.getByText("P(true Sharpe > N-trial benchmark)")).toBeInTheDocument();
    // 0.9473107117415471 as a probability on [0,1] -- correctly shown as a
    // percentage, not the bare decimal "0.95".
    expect(screen.getByText("94.7%")).toBeInTheDocument();
    expect(screen.queryByText("0.95")).not.toBeInTheDocument();
    expect(screen.getByText(/not a forecast of future performance/)).toBeInTheDocument();
  });
});
