/**
 * `HomeScreen` — landing page for authenticated, onboarded users.
 *
 * For v0.1 this is still a thin shell: it greets the user, shows how many
 * circles they're in (with a link to manage them), and reserves space for
 * the real wishlist UI that lands in the next iteration.
 */
import { Link } from 'react-router-dom';
import { useProfile } from '../auth/useProfile';
import { useGroups } from '../groups/useGroups';
import { useI18n } from '../i18n/useI18n';
import { pluralForm } from '../i18n/plural';
import { PaperLayout } from '../components/PaperLayout';
import { TopBar } from '../components/TopBar';

export function HomeScreen() {
  const { t, lang } = useI18n();
  const { query: profileQ } = useProfile();
  const { query: groupsQ } = useGroups();

  // `RequireAuth` guarantees the profile is ready by the time we render.
  // This narrow keeps TypeScript happy and is cheap.
  if (profileQ.status !== 'ready') return null;

  const groupCount = groupsQ.status === 'ready' ? groupsQ.groups.length : null;

  return (
    <PaperLayout>
      <TopBar />

      <hr style={{ border: 0, borderTop: '1px solid var(--hair)', margin: '0 0 var(--s-6)' }} />

      <p
        className="display-italic"
        style={{ fontSize: 28, lineHeight: 1.3, margin: 0 }}
      >
        {t('home.welcome', { name: profileQ.profile.display_name })}
      </p>

      <p style={{ color: 'var(--ink-2)', marginTop: 'var(--s-3)', maxWidth: 540, lineHeight: 1.55 }}>
        {t('home.placeholder')}
      </p>

      <GroupsSummary count={groupCount} lang={lang} t={t} />
    </PaperLayout>
  );
}

// ─────────────────────────── groups summary ───────────────────────────

interface GroupsSummaryProps {
  count: number | null;
  lang: 'ru' | 'en';
  t: (key: string, vars?: Record<string, string | number>) => string;
}

function GroupsSummary({ count, lang, t }: GroupsSummaryProps) {
  // Skeleton while loading — keep the same vertical space so the layout
  // doesn't pop when the count arrives.
  if (count === null) {
    return (
      <p className="mono-meta" style={{ marginTop: 'var(--s-6)', color: 'var(--ink-3)' }}>
        …
      </p>
    );
  }

  if (count === 0) {
    return (
      <div style={{ marginTop: 'var(--s-6)' }}>
        <p
          className="display-italic"
          style={{ fontSize: 20, color: 'var(--ink-2)', marginBottom: 'var(--s-2)' }}
        >
          {t('home.groupsZero')}
        </p>
        <Link
          to="/groups"
          className="mono-meta"
          style={{ color: 'var(--accent)', textDecoration: 'none' }}
        >
          {t('home.setUpGroupsCta')} →
        </Link>
      </div>
    );
  }

  const word = pluralForm(lang, count, {
    one: t('groups.groupWord1'),
    few: t('groups.groupWord2'),
    many: t('groups.groupWord5'),
  });

  return (
    <div style={{ marginTop: 'var(--s-6)' }}>
      <p style={{ color: 'var(--ink-2)' }}>
        {t('home.groupsSummary', { count, countWord: word })}
      </p>
      <Link
        to="/groups"
        className="mono-meta"
        style={{ color: 'var(--accent)', textDecoration: 'none', display: 'inline-block', marginTop: 'var(--s-2)' }}
      >
        {t('home.groupsManage')}
      </Link>
    </div>
  );
}
