// Instant shell for admin navigation (dashboard ↔ articles ↔ categories ↔
// comments, opening the editor). The .adm-screen wrapper gives it the same
// quick fade as a loaded screen, so switching never shows a blank frame.
export default function AdminLoading() {
  return (
    <div className="adm-screen">
      <div className="adm-pagehead">
        <div className="adm-welcome">
          <div className="sk h-7 w-52 rounded-lg" />
          <div className="sk mt-3 h-4 w-72 max-w-full rounded" />
        </div>
      </div>

      {/* gauge row */}
      <div className="adm-stats">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="adm-stat">
            <div className="sk h-[60px] w-[108px] rounded-full" />
            <div className="adm-stat-meta" style={{ flex: 1 }}>
              <div className="sk h-4 w-24 rounded" />
              <div className="sk mt-2 h-3 w-16 rounded" />
            </div>
          </div>
        ))}
      </div>

      {/* content rows */}
      <div className="adm-grid-2">
        <div className="adm-card adm-card-pad">
          <div className="sk h-5 w-32 rounded" />
          <div className="sk mt-4 h-[180px] w-full rounded-lg" />
        </div>
        <div className="adm-card adm-card-pad">
          <div className="sk h-5 w-28 rounded" />
          <div className="mt-5 space-y-4">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i}>
                <div className="sk h-4 w-full rounded" />
                <div className="sk mt-2 h-2 w-full rounded-full" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
