import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Terms of Service",
  description: "The terms governing your use of The Daily Ledger (dailyledger.today).",
};

const heading = "font-display text-2xl font-semibold tracking-tight text-fg sm:text-3xl";
const para = "leading-[1.8] text-fg-muted";
const link =
  "font-medium text-accent-link underline decoration-accent/40 underline-offset-2 transition-colors hover:decoration-accent";

export default function TermsPage() {
  return (
    <main className="mx-auto max-w-3xl px-4 py-12 sm:px-6 lg:py-16">
      <h1 className="font-display text-4xl font-extrabold tracking-tight text-fg sm:text-5xl">
        Terms of Service
      </h1>
      <p className="mt-3 text-sm text-fg-faint">{`Last updated: June 7, 2026`}</p>

      <div className="mt-8 space-y-8">
        <p className={para}>
          {`Welcome to The Daily Ledger (dailyledger.today). By accessing or using this Site, you agree to these Terms of Service. If you do not agree, please do not use the Site.`}
        </p>

        <section className="space-y-3">
          <h2 className={heading}>Use of the Site</h2>
          <p className={para}>
            {`You may read and share our content for personal, non-commercial use. You agree not to misuse the Site, attempt to disrupt it, or use it for any unlawful purpose.`}
          </p>
        </section>

        <section className="space-y-3">
          <h2 className={heading}>Intellectual Property</h2>
          <p className={para}>
            {`Unless otherwise stated, the content on this Site, including text, images, and design, is owned by or licensed to The Daily Ledger and is protected by applicable laws. You may not reproduce or republish substantial portions without permission.`}
          </p>
        </section>

        <section className="space-y-3">
          <h2 className={heading}>Content and Accuracy</h2>
          <p className={para}>
            {`We work to provide accurate and up-to-date information, but we do not guarantee that all content is complete, accurate, or current. Content is provided for general information only and is not professional advice.`}
          </p>
        </section>

        <section className="space-y-3">
          <h2 className={heading}>Advertising and Third-Party Links</h2>
          <p className={para}>
            {`The Site contains advertising and may link to third-party websites. We are not responsible for the content, products, or practices of third parties.`}
          </p>
        </section>

        <section className="space-y-3">
          <h2 className={heading}>Limitation of Liability</h2>
          <p className={para}>
            {`The Site is provided "as is." To the fullest extent permitted by law, The Daily Ledger is not liable for any damages arising from your use of the Site.`}
          </p>
        </section>

        <section className="space-y-3">
          <h2 className={heading}>Changes to These Terms</h2>
          <p className={para}>
            {`We may update these Terms from time to time. Your continued use of the Site means you accept the updated Terms.`}
          </p>
        </section>

        <section className="space-y-3">
          <h2 className={heading}>Contact</h2>
          <p className={para}>
            {`If you have questions about these Terms, please email us at `}
            <a className={link} href="mailto:sayonkakda187@gmail.com">
              {`sayonkakda187@gmail.com`}
            </a>
            {`.`}
          </p>
        </section>
      </div>
    </main>
  );
}
