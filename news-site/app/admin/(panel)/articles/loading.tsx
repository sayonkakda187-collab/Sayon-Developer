// Instant skeleton for the Articles list (search + filters + rows).
export default function ArticlesLoading() {
  return (
    <div className="adm-screen">
      <div className="adm-page-h" style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
        <div>
          <div className="sk h-6 w-28 rounded-lg" />
          <div className="sk mt-2 h-3 w-40 rounded" />
        </div>
        <div className="sk h-10 w-20 rounded-lg" />
      </div>
      <div className="sk mb-3 h-11 w-full rounded-xl" />
      <div className="adm-filterbar">
        {Array.from({ length: 5 }).map((_, i) => <div key={i} className="sk h-9 w-24 rounded-full" />)}
      </div>
      <div className="adm-card adm-card-pad">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="adm-arow">
            <div className="sk h-9 w-9 rounded-lg" style={{ flex: "none" }} />
            <div style={{ flex: 1 }}>
              <div className="sk h-4 w-2/3 rounded" />
              <div className="sk mt-2 h-3 w-1/3 rounded" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
