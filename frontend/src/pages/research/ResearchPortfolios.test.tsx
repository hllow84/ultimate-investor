import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import ResearchPortfolios from "./ResearchPortfolios";
import { useLabDiagnostics, useLabPortfolios } from "@/hooks/useLab";

function renderPage() {
  return render(
    <MemoryRouter>
      <ResearchPortfolios />
    </MemoryRouter>
  );
}

vi.mock("@/hooks/useLab", () => ({
  useLabDiagnostics: vi.fn(),
  useLabPortfolios: vi.fn(),
}));

const mockedDiag = useLabDiagnostics as unknown as ReturnType<typeof vi.fn>;
const mockedPort = useLabPortfolios as unknown as ReturnType<typeof vi.fn>;

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

function envelope<T>(data: T) {
  return { key: "k", relative_path: "p", status: "ok" as const, source_last_modified: null, data, error: null };
}

describe("ResearchPortfolios significance & regime overlap rendering", () => {
  beforeEach(() => {
    mockedDiag.mockReset();
    mockedPort.mockReset();
  });

  it("renders the Sharpe-diff block-bootstrap estimate in Sharpe units, not as a percentage", () => {
    mockedDiag.mockReturnValue(baseQueryResult({ data: undefined }));
    mockedPort.mockReturnValue(
      baseQueryResult({
        data: {
          portfolios: envelope({}),
          ablation: envelope({}),
          significance: envelope({
            A_vs_6040: {
              block_bootstrap_6mo: {
                point_estimate_annualized: -0.0303915759290877,
                "ci_2.5": -0.3996722489444153,
                "ci_97.5": 0.2897044023747496,
                excludes_zero: false,
              },
              verdict: "not statistically distinguishable from no difference",
              jk_and_bootstrap_agree_at_5pct: true,
            },
          }),
        },
      })
    );
    renderPage();
    // -0.0303915759290877 in Sharpe units rounds to "-0.03", not "-3.0%".
    expect(screen.getByText("-0.03")).toBeInTheDocument();
    expect(screen.queryByText("-3.0%")).not.toBeInTheDocument();
    expect(screen.getByText(/Verdict: not statistically distinguishable/)).toBeInTheDocument();
  });

  it("surfaces an INCONCLUSIVE verdict distinctly when JK-Memmel and bootstrap disagree", () => {
    mockedDiag.mockReturnValue(baseQueryResult({ data: undefined }));
    mockedPort.mockReturnValue(
      baseQueryResult({
        data: {
          portfolios: envelope({}),
          ablation: envelope({}),
          significance: envelope({
            B_vs_A: {
              jk_and_bootstrap_agree_at_5pct: false,
              verdict: "INCONCLUSIVE -- sensitive to test choice (JK-Memmel and bootstrap disagree)",
            },
          }),
        },
      })
    );
    renderPage();
    expect(screen.getByText(/INCONCLUSIVE/)).toBeInTheDocument();
  });

  it("highlights an INCONCLUSIVE verdict from the block-length-sensitivity branch even when jk_and_bootstrap_agree_at_5pct is true", () => {
    // Per phase7_significance.py's run_pair() decision ladder, the
    // "sensitive to block-length choice" branch can fire independently of
    // jk_and_bootstrap_agree_at_5pct -- the highlight must key off the
    // verdict string itself, not off that one flag.
    mockedDiag.mockReturnValue(baseQueryResult({ data: undefined }));
    mockedPort.mockReturnValue(
      baseQueryResult({
        data: {
          portfolios: envelope({}),
          ablation: envelope({}),
          significance: envelope({
            A_vs_6040: {
              jk_and_bootstrap_agree_at_5pct: true,
              verdict: "INCONCLUSIVE -- sensitive to block-length choice",
            },
          }),
        },
      })
    );
    renderPage();
    const verdictEl = screen.getByText(/sensitive to block-length choice/);
    expect(verdictEl).toBeInTheDocument();
    expect(verdictEl).toHaveStyle({ color: "var(--yellow)" });
  });

  describe("regime-overlap classification (phase6_combination.json)", () => {
    function renderRegime(regimeFields: Record<string, unknown>) {
      mockedDiag.mockReturnValue(
        baseQueryResult({
          data: {
            combination: envelope({
              partA_vs_6040: {
                strategy_x: {
                  correlation_to_6040: 0.2,
                  regime_overlap: { the_regime: { testable: true, strat_total_return: 0.1, "6040_total_return": -0.2, ...regimeFields } },
                },
              },
            }),
          },
        })
      );
      mockedPort.mockReturnValue(baseQueryResult({ data: undefined }));
      renderPage();
    }

    it("reads offsetting=True/coincident=False as Offsetting (not via truthiness)", () => {
      // Both flags are the JS string "False"/"True", confirmed from the
      // producer's jsafe()+json.dump(default=str) serialization path. A naive
      // `Boolean(x)` truthiness check would mark both as true.
      renderRegime({ coincident_drawdown: "False", offsetting: "True" });
      expect(screen.getByText("Offsetting")).toBeInTheDocument();
    });

    it("reads offsetting=False/coincident=True as Coincident drawdown", () => {
      renderRegime({ coincident_drawdown: "True", offsetting: "False" });
      expect(screen.getByText("Coincident drawdown")).toBeInTheDocument();
    });

    it("reads offsetting=False/coincident=False as Neither, not Unknown", () => {
      renderRegime({ coincident_drawdown: "False", offsetting: "False" });
      expect(screen.getByText(/Neither/)).toBeInTheDocument();
    });

    it("reports Unknown, not Neither, when both flags are missing", () => {
      renderRegime({});
      expect(screen.getByText(/Unknown/)).toBeInTheDocument();
      expect(screen.queryByText(/^Neither/)).not.toBeInTheDocument();
    });

    it("reports Unknown, not Neither, when a flag is null", () => {
      renderRegime({ coincident_drawdown: null, offsetting: "False" });
      expect(screen.getByText(/Unknown/)).toBeInTheDocument();
    });

    it("reports Unknown for an unexpected value, not silently coerced to false", () => {
      renderRegime({ coincident_drawdown: "maybe", offsetting: "False" });
      expect(screen.getByText(/Unknown/)).toBeInTheDocument();
    });

    it("reports Unknown for the producer-impossible contradictory case (both True)", () => {
      renderRegime({ coincident_drawdown: "True", offsetting: "True" });
      expect(screen.getByText(/Unknown/)).toBeInTheDocument();
    });

    it("shows 'Not testable' for a regime whose window has insufficient data", () => {
      mockedDiag.mockReturnValue(
        baseQueryResult({
          data: {
            combination: envelope({
              partA_vs_6040: {
                strategy_x: {
                  correlation_to_6040: 0.2,
                  regime_overlap: { gfc: { testable: false } },
                },
              },
            }),
          },
        })
      );
      mockedPort.mockReturnValue(baseQueryResult({ data: undefined }));
      renderPage();
      expect(screen.getByText("Not testable (insufficient data in this window)")).toBeInTheDocument();
    });
  });
});
