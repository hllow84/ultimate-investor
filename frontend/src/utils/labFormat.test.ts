import { describe, it, expect } from "vitest";
import {
  formatPercent, formatRatio, formatDate, formatDateTime,
  looksLikeMetrics, formatMetricField, pickCoreMetrics,
} from "./labFormat";

describe("formatPercent", () => {
  it("formats a fraction as a percentage", () => {
    expect(formatPercent(0.1523, 1)).toBe("15.2%");
  });
  it("returns an em-dash for non-numbers", () => {
    expect(formatPercent(null)).toBe("—");
    expect(formatPercent(undefined)).toBe("—");
    expect(formatPercent("0.1")).toBe("—");
  });
});

describe("formatRatio", () => {
  it("formats a ratio with fixed decimals", () => {
    expect(formatRatio(0.9231275909675863, 2)).toBe("0.92");
  });
  it("returns an em-dash for non-numbers", () => {
    expect(formatRatio(null)).toBe("—");
  });
});

describe("formatDate / formatDateTime", () => {
  it("returns an em-dash for missing values", () => {
    expect(formatDate(null)).toBe("—");
    expect(formatDateTime(undefined)).toBe("—");
  });
  it("falls back to the raw string for unparseable dates", () => {
    expect(formatDate("not-a-date")).toBe("not-a-date");
  });
});

describe("looksLikeMetrics", () => {
  it("recognizes an object with a known metric key", () => {
    expect(looksLikeMetrics({ CAGR: 0.1, Sharpe: 0.5 })).toBe(true);
  });
  it("rejects objects without any recognized metric key", () => {
    expect(looksLikeMetrics({ note: "first recording", period: ["a", "b"] })).toBe(false);
  });
  it("rejects arrays and primitives", () => {
    expect(looksLikeMetrics([1, 2, 3])).toBe(false);
    expect(looksLikeMetrics("CAGR")).toBe(false);
    expect(looksLikeMetrics(null)).toBe(false);
  });
});

describe("formatMetricField", () => {
  it("formats a percent field as a percentage", () => {
    expect(formatMetricField("CAGR", 0.1736258993419848)).toBe("17.4%");
  });
  it("formats a ratio field as a ratio", () => {
    expect(formatMetricField("Sharpe", 0.8469852067389039)).toBe("0.85");
  });
  it("formats a date field as a readable date", () => {
    expect(formatMetricField("StartDate", "2010-01-04")).toContain("2010");
  });
  it("never fabricates a value for null", () => {
    expect(formatMetricField("CAGR", null)).toBe("—");
  });
  it("falls back to the raw string for an unrecognized field", () => {
    expect(formatMetricField("label", "long-only top3")).toBe("long-only top3");
  });
});

describe("pickCoreMetrics", () => {
  it("only includes keys that are actually present", () => {
    const out = pickCoreMetrics({ CAGR: 0.1, Sharpe: 0.5, label: "x", regimes: {} });
    expect(out).toEqual({ CAGR: 0.1, Sharpe: 0.5 });
    expect(out).not.toHaveProperty("label");
    expect(out).not.toHaveProperty("regimes");
  });
  it("returns an empty object when no core fields are present", () => {
    expect(pickCoreMetrics({ foo: 1 })).toEqual({});
  });
});
