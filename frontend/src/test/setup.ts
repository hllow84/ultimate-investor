import "@testing-library/jest-dom/vitest";

// jsdom doesn't implement ResizeObserver, which recharts' ResponsiveContainer
// requires on mount -- without this stub, any test that renders a chart
// (WeightsBar, the ablation bar chart) throws "ResizeObserver is not defined".
if (typeof globalThis.ResizeObserver === "undefined") {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}
