import { afterEach, describe, expect, it, vi } from "vitest";
import { changeSince, getBenchmarkConfig, portfolioChange } from "@/lib/benchmark";

describe("changeSince", () => {
  const history = [
    { date: "2026-09-17", close: 100 },
    { date: "2026-09-19", close: 102 },
    { date: "2026-09-26", close: 110 },
  ];

  it("compares the latest close to the last close on or before the cutoff", () => {
    expect(changeSince(history, "2026-09-20")).toBeCloseTo(7.843, 2); // 102 → 110
  });

  it("returns null without history before the cutoff", () => {
    expect(changeSince(history, "2026-09-01")).toBeNull();
  });

  it("returns null when the only point before the cutoff is the latest one", () => {
    expect(changeSince([{ date: "2026-09-10", close: 100 }], "2026-09-20")).toBeNull();
  });
});

describe("portfolioChange", () => {
  it("weights by value when share counts are known", () => {
    // 10×100 → 10×110 and 1×1000 → 1×900: 2000 → 2000 = 0%
    expect(
      portfolioChange([
        { shares: 10, latest: 110, weekAgo: 100 },
        { shares: 1, latest: 900, weekAgo: 1000 },
      ]),
    ).toBeCloseTo(0);
  });

  it("ignores watch-only positions when some are held", () => {
    expect(
      portfolioChange([
        { shares: 10, latest: 110, weekAgo: 100 },
        { shares: null, latest: 50, weekAgo: 100 },
      ]),
    ).toBeCloseTo(10);
  });

  it("averages plain % changes when nothing is held", () => {
    expect(
      portfolioChange([
        { shares: null, latest: 110, weekAgo: 100 },
        { shares: null, latest: 95, weekAgo: 100 },
      ]),
    ).toBeCloseTo(2.5);
  });

  it("returns null for no usable positions", () => {
    expect(portfolioChange([])).toBeNull();
  });
});

describe("getBenchmarkConfig", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("defaults to MSCI World", () => {
    vi.stubEnv("BENCHMARK_TICKER", undefined);
    expect(getBenchmarkConfig()?.ticker).toBe("CW8.PA");
  });

  it("can be disabled with an empty value", () => {
    vi.stubEnv("BENCHMARK_TICKER", "");
    expect(getBenchmarkConfig()).toBeNull();
  });

  it("uses the configured ticker and label", () => {
    vi.stubEnv("BENCHMARK_TICKER", "CAC.PA");
    vi.stubEnv("BENCHMARK_LABEL", "CAC 40");
    expect(getBenchmarkConfig()).toEqual({ ticker: "CAC.PA", label: "CAC 40" });
  });
});
