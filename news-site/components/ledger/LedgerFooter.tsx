import { Link } from "next-view-transitions";

type FooterSection = { name: string; href: string };

/** Footer: small wordmark + blurb, Sections / The Paper link columns, hairline
 *  divider, and the bottom copyright row. */
export function LedgerFooter({ sections }: { sections: FooterSection[] }) {
  return (
    <footer className="tl-footer">
      <div className="tl-footer-top">
        <div className="tl-footer-brand">
          <Link className="tl-wordmark tl-sm" href="/" aria-label="The Daily Ledger">
            <span className="tl-wm-the">The</span>
            <span className="tl-wm-main">Daily&nbsp;Ledger</span>
          </Link>
          <p className="tl-footer-tag">
            Independent reporting on technology, business, and the world.
          </p>
        </div>
        <div className="tl-footer-cols">
          <div className="tl-fcol">
            <h4>Sections</h4>
            <Link href="/">Home</Link>
            {sections.map((s) => (
              <Link key={s.href} href={s.href}>
                {s.name}
              </Link>
            ))}
          </div>
          <div className="tl-fcol">
            <h4>The Paper</h4>
            <Link href="/about">About</Link>
            <Link href="/contact">Contact</Link>
            <Link href="/privacy">Privacy Policy</Link>
            <Link href="/terms">Terms of Service</Link>
          </div>
        </div>
      </div>
      <div className="tl-footer-bottom">
        <span>© {new Date().getFullYear()} The Daily Ledger. All rights reserved.</span>
        <span>Published independently · Worldwide</span>
      </div>
    </footer>
  );
}
