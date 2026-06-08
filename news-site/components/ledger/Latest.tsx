"use client";

import { useState } from "react";
import Image from "next/image";
import { Link } from "next-view-transitions";
import type { CSSProperties } from "react";
import { deskClass, type LedgerStory } from "@/lib/ledger";
import { Kicker } from "./Kicker";
import { ArrowRight } from "./icons";

/** "Latest Stories": a desk filter pill group over a responsive card grid. The
 *  grid re-keys on filter change so the staggered card entrance re-triggers. */
export function Latest({ stories, filters }: { stories: LedgerStory[]; filters: string[] }) {
  const [cat, setCat] = useState("Top");
  const [pass, setPass] = useState(0);
  const shown = cat === "Top" ? stories : stories.filter((s) => s.cat === cat);

  function pick(c: string) {
    if (c === cat) return;
    setCat(c);
    setPass((p) => p + 1);
  }

  return (
    <section className="tl-latest">
      <div className="tl-latest-head">
        <div>
          <h2 className="tl-section-title">Latest Stories</h2>
          <p className="tl-section-sub">Fresh reporting across every desk — filter by topic.</p>
        </div>
        <div className="tl-filters" role="tablist" aria-label="Filter by topic">
          {filters.map((c) => (
            <button
              key={c}
              type="button"
              role="tab"
              aria-selected={c === cat}
              className={`tl-filter ${c === cat ? "tl-on" : ""}`}
              onClick={() => pick(c)}
            >
              {c}
            </button>
          ))}
        </div>
      </div>

      {shown.length === 0 ? (
        <p className="tl-section-sub">No stories in this desk yet.</p>
      ) : (
        <div key={pass} className="tl-grid">
          {shown.map((s, i) => (
            <Card key={s.href + i} s={s} i={i} />
          ))}
        </div>
      )}
    </section>
  );
}

function Card({ s, i }: { s: LedgerStory; i: number }) {
  return (
    <article className={`tl-card ${deskClass(s.cat)}`} style={{ "--ci": i } as CSSProperties}>
      <Link className="tl-card-media" href={s.href} aria-label={s.title}>
        <div className="tl-card-img-wrap">
          {s.img && (
            <Image
              src={s.img}
              alt=""
              fill
              sizes="(max-width: 680px) 100vw, (max-width: 1180px) 50vw, 360px"
              className="object-cover"
            />
          )}
        </div>
        <span className="tl-card-chip">{s.cat}</span>
      </Link>
      <div className="tl-card-copy">
        <Kicker cat={s.cat} time={s.time} />
        <h3 className="tl-card-title">
          <Link href={s.href}>{s.title}</Link>
        </h3>
        <p className="tl-card-deck">{s.deck}</p>
        <Link className="tl-read-link tl-sm" href={s.href}>
          Read story
          <ArrowRight small />
        </Link>
      </div>
    </article>
  );
}
