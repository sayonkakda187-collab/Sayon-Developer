import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description:
    "How The Daily Ledger collects, uses, and protects information, including cookies, advertising, and your privacy choices.",
};

const heading = "font-display text-2xl font-semibold tracking-tight text-fg sm:text-3xl";
const para = "leading-[1.8] text-fg-muted";
const list = "list-disc space-y-2 pl-6 leading-[1.7] text-fg-muted marker:text-fg-faint";
const link =
  "font-medium text-accent-link underline decoration-accent/40 underline-offset-2 transition-colors hover:decoration-accent";
const label = "font-semibold text-fg";

export default function PrivacyPage() {
  return (
    <main className="mx-auto max-w-3xl px-4 py-12 sm:px-6 lg:py-16">
      <h1 className="font-display text-4xl font-extrabold tracking-tight text-fg sm:text-5xl">
        Privacy Policy
      </h1>
      <p className="mt-3 text-sm text-fg-faint">{`Last updated: June 7, 2026`}</p>

      <div className="mt-8 space-y-8">
        <p className={para}>
          {`The Daily Ledger ("we", "us", or "our") operates the website dailyledger.today (the "Site"). This Privacy Policy explains how we collect, use, and protect information when you visit the Site, and the choices you have. By using the Site, you agree to this Privacy Policy.`}
        </p>

        <section className="space-y-3">
          <h2 className={heading}>Information We Collect</h2>
          <ul className={list}>
            <li>
              <strong className={label}>{`Information you provide:`}</strong>
              {` If you subscribe to our newsletter, you provide us your email address.`}
            </li>
            <li>
              <strong className={label}>{`Information collected automatically:`}</strong>
              {` Like most websites, we and our service providers automatically collect standard log information such as your IP address, browser type, device information, the pages you visit, and the date and time of your visit. This information is collected using cookies and similar technologies.`}
            </li>
          </ul>
        </section>

        <section className="space-y-3">
          <h2 className={heading}>Cookies and Similar Technologies</h2>
          <p className={para}>
            {`Cookies are small files placed on your device. We use cookies to operate and improve the Site, remember your preferences, understand how the Site is used, and to support advertising. You can control or delete cookies through your browser settings, but some parts of the Site may not work properly without them.`}
          </p>
        </section>

        <section className="space-y-3">
          <h2 className={heading}>Advertising and Third-Party Vendors</h2>
          <p className={para}>
            {`We display advertising on the Site to support our work, and we work with third-party advertising vendors, including Google.`}
          </p>
          <ul className={list}>
            <li>{`Google, as a third-party vendor, uses cookies to serve ads on the Site.`}</li>
            <li>
              {`Google's use of advertising cookies enables it and its partners to serve ads to you based on your visits to this Site and/or other sites on the internet.`}
            </li>
            <li>
              {`You can opt out of personalized advertising by visiting Google's My Ad Center at `}
              <a className={link} href="https://myadcenter.google.com" target="_blank" rel="noopener noreferrer">
                {`https://myadcenter.google.com`}
              </a>
              {`. You can learn more about how Google uses information from sites that use its services at `}
              <a
                className={link}
                href="https://policies.google.com/technologies/ads"
                target="_blank"
                rel="noopener noreferrer"
              >
                {`https://policies.google.com/technologies/ads`}
              </a>
              {`.`}
            </li>
            <li>
              {`We also work with other third-party advertising networks and partners that may use cookies, web beacons, and similar technologies to collect information and serve ads. You can opt out of personalized advertising from many participating companies at `}
              <a className={link} href="http://www.aboutads.info/choices/" target="_blank" rel="noopener noreferrer">
                {`http://www.aboutads.info/choices/`}
              </a>
              {` and `}
              <a className={link} href="http://optout.networkadvertising.org/" target="_blank" rel="noopener noreferrer">
                {`http://optout.networkadvertising.org/`}
              </a>
              {`.`}
            </li>
          </ul>
        </section>

        <section className="space-y-3">
          <h2 className={heading}>Your Privacy Choices</h2>
          <ul className={list}>
            <li>
              <strong className={label}>{`European Economic Area (EEA), United Kingdom, and Switzerland:`}</strong>
              {` We use a consent management tool to ask for your consent before non-essential cookies, including advertising cookies, are used. You can change or withdraw your consent at any time.`}
            </li>
            <li>
              <strong className={label}>{`California residents:`}</strong>
              {` Under the California Consumer Privacy Act (CCPA), you have certain rights regarding your personal information, including the right to know, to delete, and to opt out of the "sale" or "sharing" of personal information. You can exercise these rights by contacting us at the email address below.`}
            </li>
          </ul>
        </section>

        <section className="space-y-3">
          <h2 className={heading}>Newsletter</h2>
          <p className={para}>
            {`If you sign up for our newsletter, we use your email address only to send you updates from The Daily Ledger. You can unsubscribe at any time using the link in any email we send.`}
          </p>
        </section>

        <section className="space-y-3">
          <h2 className={heading}>{`Children's Privacy`}</h2>
          <p className={para}>
            {`The Site is not directed to children under the age of 13, and we do not knowingly collect personal information from children under 13. If you believe a child has provided us with personal information, please contact us and we will delete it.`}
          </p>
        </section>

        <section className="space-y-3">
          <h2 className={heading}>Data Security</h2>
          <p className={para}>
            {`We take reasonable measures to protect the information we handle. However, no method of transmission over the internet is completely secure, and we cannot guarantee absolute security.`}
          </p>
        </section>

        <section className="space-y-3">
          <h2 className={heading}>Links to Other Websites</h2>
          <p className={para}>
            {`The Site may contain links to other websites. We are not responsible for the privacy practices of those sites, and we encourage you to read their privacy policies.`}
          </p>
        </section>

        <section className="space-y-3">
          <h2 className={heading}>Changes to This Privacy Policy</h2>
          <p className={para}>
            {`We may update this Privacy Policy from time to time. Any changes will be posted on this page with an updated "Last updated" date.`}
          </p>
        </section>

        <section className="space-y-3">
          <h2 className={heading}>Contact Us</h2>
          <p className={para}>
            {`If you have any questions about this Privacy Policy, please contact us at `}
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
