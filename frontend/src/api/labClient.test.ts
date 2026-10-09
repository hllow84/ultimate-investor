import { describe, it, expect, vi, beforeEach } from "vitest";
import { api } from "./client";

// Locks in the hard constraint that the frontend only ever talks to the Lab
// through the website backend's /api/lab/* surface -- never a direct file
// path, never a different host.
describe("api.lab", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn(async () => ({
      ok: true,
      json: async () => ({}),
      text: async () => "",
    })));
  });

  it.each([
    ["health", "/api/lab/health"],
    ["strategies", "/api/lab/strategies"],
    ["diagnostics", "/api/lab/diagnostics"],
    ["portfolios", "/api/lab/portfolios"],
    ["paperTradingLog", "/api/lab/paper-trading/log"],
    ["paperTradingLatest", "/api/lab/paper-trading/latest"],
  ])("%s calls exactly %s", async (method, expectedPath) => {
    await (api.lab as Record<string, () => Promise<unknown>>)[method]();
    expect(fetch).toHaveBeenCalledTimes(1);
    const calledUrl = (fetch as unknown as { mock: { calls: unknown[][] } }).mock.calls[0][0];
    expect(calledUrl).toBe(expectedPath);
  });
});
