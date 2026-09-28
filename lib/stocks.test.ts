import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getStockQuotesWithHistory, StockApiLimitError } from "@/lib/stocks";

const series = {
  "Time Series (Daily)": {
    "2026-09-25": { "4. close": "110" },
    "2026-09-24": { "4. close": "100" },
  },
};
const quotaNotice = { Information: "Thank you for using Alpha Vantage! Our standard API rate limit is 25 requests per day." };

function mockResponses(...bodies: unknown[]) {
  const fetchMock = vi.fn();
  for (const body of bodies) fetchMock.mockResolvedValueOnce(new Response(JSON.stringify(body)));
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

const positions = (n: number) =>
  Array.from({ length: n }, (_, i) => ({ ticker: `T${i}`, label: `Titre ${i}` }));

describe("getStockQuotesWithHistory", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubEnv("ALPHA_VANTAGE_API_KEY", "test");
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  async function run(n: number) {
    const promise = getStockQuotesWithHistory(positions(n));
    await vi.runAllTimersAsync(); // skip the 1.2s spacing between calls
    return promise;
  }

  it("computes the quote from the daily series", async () => {
    mockResponses(series);
    const [result] = await run(1);
    expect(result.quote).toMatchObject({ price: 110, change: 10, latestTradingDay: "2026-09-25" });
  });

  it("throws a quota error when the very first call is rate-limited", async () => {
    mockResponses(quotaNotice);
    const promise = getStockQuotesWithHistory(positions(3));
    const assertion = expect(promise).rejects.toBeInstanceOf(StockApiLimitError);
    await vi.runAllTimersAsync();
    await assertion;
  });

  it("keeps partial results and stops calling once the quota is hit", async () => {
    const fetchMock = mockResponses(series, quotaNotice, series);
    const results = await run(3);
    expect(results).toHaveLength(1);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("still treats an unknown ticker as simply missing", async () => {
    mockResponses({ "Error Message": "Invalid API call" }, series);
    const results = await run(2);
    expect(results.map((r) => r.quote.ticker)).toEqual(["T1"]);
  });
});
