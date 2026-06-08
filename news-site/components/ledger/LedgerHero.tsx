import Image from "next/image";
import { Link } from "next-view-transitions";
import type { CSSProperties } from "react";
import type { LedgerStory } from "@/lib/ledger";
import { Kicker } from "./Kicker";
import { ArrowRight } from "./icons";

/** Hero: a large lead story (headline animates in word-by-word) beside a hairline-
 *  separated side rail of secondary stories. */
export function LedgerHero({ hero, leads }: { hero: LedgerStory; leads: LedgerStory[] }) {
  return (
    <section className="tl-hero">
      <article className="tl-hero-lead">
        <Link className="tl-hero-media" href={hero.href} aria-label={hero.title}>
          <div className="tl-hero-img-wrap">
            {hero.img && (
              <Image
                src={hero.img}
                alt=""
                fill
                priority
                sizes="(max-width: 920px) 100vw, 62vw"
                className="object-cover"
              />
            )}
          </div>
          <span className="tl-hero-cred">The Daily Ledger</span>
        </Link>
        <div className="tl-hero-copy">
          <Kicker cat={hero.cat} />
          <h1 className="tl-hero-title">
            {hero.title.split(" ").map((w, i) => (
              <span key={i} className="tl-word">
                <span className="tl-word-in" style={{ "--wi": `${i * 34}ms` } as CSSProperties}>
                  {w}&nbsp;
                </span>
              </span>
            ))}
          </h1>
          <p className="tl-hero-deck">{hero.deck}</p>
          <div className="tl-hero-foot">
            <Link className="tl-read-link" href={hero.href}>
              Read full story
              <ArrowRight />
            </Link>
            <span className="tl-hero-time">{hero.time}</span>
          </div>
        </div>
      </article>

      <aside className="tl-hero-side">
        {leads.map((s, i) => (
          <Link
            key={s.href + i}
            className="tl-side-story"
            href={s.href}
            style={{ "--wi": `${260 + i * 90}ms` } as CSSProperties}
          >
            <div className="tl-side-media">
              <div className="tl-side-img-wrap">
                {s.img && (
                  <Image src={s.img} alt="" fill sizes="(max-width: 920px) 50vw, 30vw" className="object-cover" />
                )}
              </div>
            </div>
            <div className="tl-side-copy">
              <Kicker cat={s.cat} time={s.time} />
              <h3 className="tl-side-title">{s.title}</h3>
              <p className="tl-side-deck">{s.deck}</p>
            </div>
          </Link>
        ))}
      </aside>
    </section>
  );
}
