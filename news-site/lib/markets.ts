import "server-only";

import { unstable_cache } from "next/cache";

// Markets ticker data. Fetched SERVER-SIDE from Yahoo Finance's free, KEYLESS
// public chart endpoint (v8/finance/chart) — no API key, no paid dependency. The
// whole set is cached ~15 minutes (unstable_cache) so we hit Yahoo at most a few
// times an hour regardless of traffic. Anything that fails is simply omitted; if
// nothing resolves, the ticker hides entirely (the component renders null).

export type Quote = {
  label: string;
  /** Pre-formatted price string (with any prefix like "$"). */
  price: string;
  /** Daily change vs previous close, in percent (can be negative). */
  changePct: number;
};

type SymbolSpec = {
  label: string;
  symbol: string;
  decimals: number;
  prefix?: string;
};

// S&P 500, Dow, Nasdaq, Gold (front-month future), Bitcoin, EUR/USD.
const SYMBOLS: SymbolSpec[] = [
  { label: "S&P 500", symbol: "^GSPC", decimals: 2 },
  { label: "Dow", symbol: "^DJI", decimals: 2 },
  { label: "Nasdaq", symbol: "^IXIC", decimals: 2 },
  { label: "Gold", symbol: "GC=F", decimals: 2, prefix: "$" },
  { label: "Bitcoin", symbol: "BTC-USD", decimals: 0, prefix: "$" },
  { label: "EUR/USD", symbol: "EURUSD=X", decimals: 4 },
];

async function fetchQuote(spec: SymbolSpec): Promise<Quote | null> {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(
    spec.symbol,
  )}?range=1d&interval=1d`;

  // Manual timeout so a slow/hung source never delays the page render.
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5000);
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; DailyLedger/1.0; +https://dailyledger.today)",
        Accept: "application/json",
      },
      signal: controller.signal,
      cache: "no-store",
    });
    if (!res.ok) return null;
    const json = (await res.json()) as {
      chart?: { result?: { meta?: { regularMarketPrice?: number; chartPreviousClose?: number; previousClose?: number } }[] };
    };
    const meta = json.chart?.result?.[0]?.meta;
    const price = Number(meta?.regularMarketPrice);
    const prev = Number(meta?.chartPreviousClose ?? meta?.previousClose);
    if (!Number.isFinite(price) || !Number.isFinite(prev) || prev === 0) return null;

    const changePct = ((price - prev) / prev) * 100;
    const formatted = price.toLocaleString("en-US", {
      minimumFractionDigits: spec.decimals,
      maximumFractionDigits: spec.decimals,
    });
    return { label: spec.label, price: `${spec.prefix ?? ""}${formatted}`, changePct };
  } catch {
    return null; // network/abort/parse → omit this one
  } finally {
    clearTimeout(timer);
  }
}

async function fetchMarkets(): Promise<Quote[]> {
  const results = await Promise.all(SYMBOLS.map(fetchQuote));
  return results.filter((q): q is Quote => q !== null);
}

/** Cached (~15 min) markets snapshot. Returns [] on total failure so callers can
 *  hide the ticker gracefully. */
export const getMarkets = unstable_cache(fetchMarkets, ["markets-ticker-v1"], {
  revalidate: 900,
});
