// Instant skeleton for Trending News (note + chips + card grid).
export default function TrendingLoading() {
  return (
    <div className="adm-screen">
      <div className="adm-pagehead">
        <div className="adm-page-h" style={{ marginBottom: 0 }}>
          <div className="sk h-6 w-40 rounded-lg" />
          <div className="sk mt-2 h-3 w-64 rounded" />
        </div>
      </div>
      <div className="sk mb-4 h-14 w-full rounded-xl" />
      <div className="adm-filterbar">
        {Array.from({ length: 6 }).map((_, i) => <div key={i} className="sk h-9 w-20 rounded-full" />)}
      </div>
      <div className="adm-trend-grid">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="adm-card adm-trend-card">
            <div className="sk adm-trend-thumb" style={{ borderRadius: 0 }} />
            <div className="adm-trend-body">
              <div className="sk h-3 w-24 rounded" />
              <div className="sk mt-3 h-4 w-full rounded" />
              <div className="sk mt-2 h-4 w-3/4 rounded" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
