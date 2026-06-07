import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Contact Us",
  description: "Get in touch with The Daily Ledger by email.",
};

const para = "leading-[1.8] text-fg-muted";
const link =
  "font-medium text-accent-link underline decoration-accent/40 underline-offset-2 transition-colors hover:decoration-accent";

export default function ContactPage() {
  return (
    <main className="mx-auto max-w-3xl px-4 py-12 sm:px-6 lg:py-16">
      <h1 className="font-display text-4xl font-extrabold tracking-tight text-fg sm:text-5xl">
        Contact Us
      </h1>

      <div className="mt-8 space-y-6">
        <p className={para}>
          {`We would love to hear from you. Whether you have a question, a news tip, feedback, or a business inquiry, you can reach The Daily Ledger by email:`}
        </p>

        <p className="text-lg">
          <span className="font-semibold text-fg">{`Email: `}</span>
          <a className={link} href="mailto:sayonkakda187@gmail.com">
            {`sayonkakda187@gmail.com`}
          </a>
        </p>

        <p className={para}>
          {`We read every message and aim to reply within a few business days.`}
        </p>
      </div>
    </main>
  );
}
