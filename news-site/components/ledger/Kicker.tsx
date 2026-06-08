import { deskClass } from "@/lib/ledger";

/** Category eyebrow ("WORLD · 17 hours ago") in the desk color. */
export function Kicker({ cat, time }: { cat: string; time?: string }) {
  return (
    <div className={`tl-kicker ${deskClass(cat)}`}>
      <span className="tl-kicker-cat">{cat}</span>
      {time ? <span className="tl-kicker-dot">·</span> : null}
      {time ? <span className="tl-kicker-time">{time}</span> : null}
    </div>
  );
}
