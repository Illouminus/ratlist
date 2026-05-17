/**
 * Privacy Policy — English source.
 *
 * Plain JSX so the legal text is searchable, version-controlled, and
 * doesn't depend on an MD parser dependency. Headings use the same
 * `display-italic` style as the rest of the editorial UI, applied via
 * the `.legal-article` class.
 *
 * Last updated: 2026-05-17. The date label itself is rendered by the
 * outer `LegalScreen` from the i18n `legal.lastUpdated` key — bump
 * both together when revising the policy.
 */
export function PrivacyEn() {
  return (
    <article>
      <h2>Who we are</h2>
      <p>
        Rat List (&laquo;we&raquo;, &laquo;the app&raquo;) is operated by Edouard Baillot,
        registered as auto-entrepreneur in France. Contact:{' '}
        <a href="mailto:hello@ratlist.app">hello@ratlist.app</a>.
      </p>

      <h2>What we collect</h2>
      <ul>
        <li>
          <strong>Email address</strong> — to sign you in. We never see your password
          because there isn&rsquo;t one; we just email you a one-time link.
        </li>
        <li>
          <strong>Display name</strong> and optional short handle — you pick both at
          sign-up. They are visible to people in the friend circles you&rsquo;ve joined.
        </li>
        <li>
          <strong>The content you create</strong> — wishlist items, photos you
          upload, group memberships, Secret Santa participation. All of this lives
          in our database under your account.
        </li>
        <li>
          <strong>Technical logs</strong> — IP address and User-Agent for the
          authentication provider&rsquo;s anti-abuse layer, kept for a short rolling
          window.
        </li>
        <li>
          <strong>Error reports</strong> via Sentry — when something crashes, we
          receive a stack trace and the URL you were on. No form values, no item
          titles, no names.
        </li>
      </ul>
      <p>
        We do not run ads. We do not have a tracking pixel. We do not sell or share
        your data with advertisers.
      </p>

      <h2>Why we collect it</h2>
      <p>
        To provide the service you signed up for (Art. 6(1)(b) GDPR — performance
        of contract):
      </p>
      <ul>
        <li>your email authenticates you</li>
        <li>your name and content are shown to people in your friend circles</li>
        <li>error reports help us fix bugs</li>
      </ul>

      <h2>Who we share it with</h2>
      <p>
        We use a small number of sub-processors that store or transmit your data
        on our behalf:
      </p>
      <ul>
        <li>
          <strong>Supabase</strong> (database, authentication, file storage) —
          Frankfurt region, EU
        </li>
        <li>
          <strong>Vercel</strong> (frontend hosting) — serves the static app to
          your browser
        </li>
        <li>
          <strong>Resend</strong> (email delivery) — sends magic-link sign-in
          emails
        </li>
        <li>
          <strong>Sentry</strong> (error monitoring) — anonymised crash reports
        </li>
      </ul>
      <p>
        None of them are authorised to use your data for their own purposes. We{' '}
        <strong>never</strong> share your wishlist content with marketers, brands
        or affiliate networks.
      </p>

      <h2>How long we keep it</h2>
      <p>
        For as long as your account exists. When you delete your account from{' '}
        <a href="/settings">settings</a>, everything you own (items, photos, group
        memberships, Santa records) is removed within 24 hours. Backups roll off
        within 30 days.
      </p>

      <h2>Your rights</h2>
      <p>Under GDPR you can ask us at any time to:</p>
      <ul>
        <li>
          <strong>access</strong> your data — use the <em>Export my data</em>{' '}
          button in <a href="/settings">settings</a>
        </li>
        <li>
          <strong>correct</strong> it — edit your profile in{' '}
          <a href="/settings">settings</a>
        </li>
        <li>
          <strong>delete</strong> it — the <em>Delete account</em> button in{' '}
          <a href="/settings">settings</a> does this in one click
        </li>
        <li>
          <strong>port</strong> it elsewhere — the export is a portable JSON file
        </li>
        <li>
          <strong>restrict or object</strong> to specific processing — email{' '}
          <a href="mailto:hello@ratlist.app">hello@ratlist.app</a>
        </li>
      </ul>
      <p>
        You can lodge a complaint with your local data protection authority. For
        France that&rsquo;s{' '}
        <a href="https://www.cnil.fr/" target="_blank" rel="noopener noreferrer">
          CNIL
        </a>
        .
      </p>

      <h2>Cookies</h2>
      <p>
        We use one first-party cookie that holds your auth session — without it
        you&rsquo;d have to sign in on every page reload. It&rsquo;s essential to
        the service and does not require consent.
      </p>
      <p>No tracking cookies, no advertising cookies, no third-party cookies.</p>

      <h2>Children</h2>
      <p>
        Rat List is not directed at children under 13. By signing in you confirm
        you are at least 13 years old.
      </p>

      <h2>Changes</h2>
      <p>
        If we update this policy in a way that materially affects you, we&rsquo;ll
        email you before the change takes effect.
      </p>

      <h2>Contact</h2>
      <p>
        Questions? Concerns?{' '}
        <a href="mailto:hello@ratlist.app">hello@ratlist.app</a>.
      </p>
    </article>
  );
}
