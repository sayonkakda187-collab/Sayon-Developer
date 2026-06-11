import { getMarkets } from "@/lib/markets";

// Slim markets strip (under the header): index, price, and daily % change with
// green-up / red-down. Server-rendered from the cached keyless feed; if nothing
// resolves it hides entirely. Horizontal-scroll on mobile, no animation library.
export async function MarketsTicker() {
  const quotes = await getMarkets();
  if (quotes.length === 0) return null; // graceful: never an error or empty bar

  return (
    <div className="tl-mkt" aria-label="Market data">
      <span className="tl-mkt-tag" aria-hidden>
        Markets
      </span>
      <div className="tl-mkt-vp">
        <div className="tl-mkt-track">
          {quotes.map((q) => {
            const up = q.changePct >= 0;
            return (
              <span key={q.label} className="tl-mkt-item">
                <span className="tl-mkt-name">{q.label}</span>
                <span className="tl-mkt-price">{q.price}</span>
                <span className={`tl-mkt-chg ${up ? "up" : "down"}`}>
                  <span aria-hidden>{up ? "▲" : "▼"}</span> {Math.abs(q.changePct).toFixed(2)}%
                </span>
              </span>
            );
          })}
        </div>
      </div>
    </div>
  );
}
