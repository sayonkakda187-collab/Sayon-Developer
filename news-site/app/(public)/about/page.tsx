import type { Metadata } from "next";
import { Link } from "next-view-transitions";

export const metadata: Metadata = {
  title: "About",
  description:
    "The Daily Ledger is an independent online publication covering technology, business, and world news.",
};

const heading = "font-display text-2xl font-semibold tracking-tight text-fg sm:text-3xl";
const para = "leading-[1.8] text-fg-muted";
const list = "list-disc space-y-2 pl-6 leading-[1.7] text-fg-muted marker:text-fg-faint";
const link =
  "font-medium text-accent-link underline decoration-accent/40 underline-offset-2 transition-colors hover:decoration-accent";
const label = "font-semibold text-fg";

export default function AboutPage() {
  return (
    <main className="mx-auto max-w-3xl px-4 py-12 sm:px-6 lg:py-16">
      <h1 className="font-display text-4xl font-extrabold tracking-tight text-fg sm:text-5xl">
        About The Daily Ledger
      </h1>

      <div className="mt-8 space-y-8">
        <p className={para}>
          {`The Daily Ledger is an independent online publication covering technology, business, and world news. Our goal is to provide clear, timely, and easy-to-read coverage that helps readers understand the stories shaping today's world.`}
        </p>

        <section className="space-y-3">
          <h2 className={heading}>What We Cover</h2>
          <ul className={list}>
            <li>
              <strong className={label}>{`Technology:`}</strong>
              {` the products, companies, and ideas changing how we live and work.`}
            </li>
            <li>
              <strong className={label}>{`Business:`}</strong>
              {` markets, the economy, and the decisions behind them.`}
            </li>
            <li>
              <strong className={label}>{`World:`}</strong>
              {` the events and developments that matter, explained simply.`}
            </li>
          </ul>
        </section>

        <p className={para}>
          {`We believe useful news should be easy to read and free to access. The Daily Ledger is independently operated and reader-focused.`}
        </p>

        <p className={para}>
          {`Have a question, news tip, or feedback? Please visit our `}
          <Link className={link} href="/contact">
            {`Contact page`}
          </Link>
          {` or email us at `}
          <a className={link} href="mailto:sayonkakda187@gmail.com">
            {`sayonkakda187@gmail.com`}
          </a>
          {`.`}
        </p>
      </div>
    </main>
  );
}
