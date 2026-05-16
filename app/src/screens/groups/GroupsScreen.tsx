/**
 * `GroupsScreen` — manage rat circles. List your groups, create a new one,
 * generate and share invite links. The empty state guides the user to
 * either create their first circle or ask a friend for an invite.
 *
 * Composition:
 *   GroupsScreen
 *     ├── TopBar (wordmark + lang + sign out)
 *     ├── header (eyebrow + title + sub-description)
 *     ├── CreateGroupForm
 *     └── list of <GroupCard>
 *           └── <InviteList> (collapsible per card)
 */
import { useState, type FormEvent } from 'react';
import { useGroups, type MyGroup } from '../../groups/useGroups';
import { useI18n } from '../../i18n/useI18n';
import { pluralForm } from '../../i18n/plural';
import { errorMessage } from '../../lib/errors';
import { PaperLayout } from '../../components/PaperLayout';
import { Field } from '../../components/Field';
import { SketchInput } from '../../components/SketchInput';
import { Button } from '../../components/Button';
import { SittingRat } from '../../components/rats';
import { InviteList } from './InviteList';

export function GroupsScreen() {
  const { t } = useI18n();
  const { query, createGroup } = useGroups();

  return (
    <PaperLayout>
      <header style={{ marginBottom: 'var(--s-6)' }}>
        <div className="mono-meta" style={{ marginBottom: 'var(--s-3)' }}>
          {t('groups.eyebrow')}
        </div>
        <h2
          className="display-italic"
          style={{ fontSize: 40, margin: 0, lineHeight: 1.1, letterSpacing: -1 }}
        >
          {t('groups.title')}
        </h2>
        <p
          style={{
            fontSize: 14,
            color: 'var(--ink-2)',
            marginTop: 'var(--s-3)',
            maxWidth: 560,
            lineHeight: 1.55,
          }}
        >
          {t('groups.sub')}
        </p>
      </header>

      <CreateGroupForm onCreate={createGroup} />

      <hr style={{ border: 0, borderTop: '1px solid var(--hair)', margin: 'var(--s-6) 0' }} />

      <GroupsList query={query} />
    </PaperLayout>
  );
}

// ─────────────────────────── create form ───────────────────────────

interface CreateGroupFormProps {
  onCreate: ReturnType<typeof useGroups>['createGroup'];
}

function CreateGroupForm({ onCreate }: CreateGroupFormProps) {
  const { t } = useI18n();
  const [name, setName] = useState('');
  const [emoji, setEmoji] = useState('');
  const [description, setDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent<HTMLFormElement>): Promise<void> {
    e.preventDefault();
    const trimmedName = name.trim();
    if (trimmedName.length === 0) return;

    setSubmitting(true);
    setError(null);
    const result = await onCreate({
      name: trimmedName,
      emoji: emoji.trim() || null,
      description: description.trim() || null,
    });
    if ('error' in result) {
      setError(errorMessage(t, result.error));
    } else {
      setName('');
      setEmoji('');
      setDescription('');
    }
    setSubmitting(false);
  }

  return (
    <section>
      <div className="mono-meta" style={{ marginBottom: 'var(--s-3)', color: 'var(--ink-3)' }}>
        {t('groups.createTitle')}
      </div>

      <form
        onSubmit={handleSubmit}
        style={{ display: 'grid', gridTemplateColumns: '1fr 80px', gap: 'var(--s-4)' }}
      >
        <Field label={t('groups.nameLabel')}>
          <SketchInput
            type="text"
            placeholder={t('groups.namePh')}
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            maxLength={80}
          />
        </Field>
        <Field label={t('groups.emojiLabel')}>
          <SketchInput
            type="text"
            placeholder={t('groups.emojiPh')}
            value={emoji}
            onChange={(e) => setEmoji(e.target.value)}
            maxLength={4}
            style={{ textAlign: 'center' }}
          />
        </Field>

        <div style={{ gridColumn: '1 / -1' }}>
          <Field label={t('groups.descLabel')}>
            <SketchInput
              type="text"
              placeholder={t('groups.descPh')}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              maxLength={140}
            />
          </Field>
        </div>

        <div style={{ gridColumn: '1 / -1', display: 'flex', justifyContent: 'flex-end' }}>
          <Button type="submit" variant="primary" disabled={submitting || name.trim().length === 0}>
            {submitting ? t('groups.creating') : t('groups.create')}
          </Button>
        </div>

        {error && (
          <p
            style={{ gridColumn: '1 / -1', color: 'var(--accent-deep)', fontSize: 13 }}
          >
            {error}
          </p>
        )}
      </form>
    </section>
  );
}

// ─────────────────────────── list ───────────────────────────

function GroupsList({ query }: { query: ReturnType<typeof useGroups>['query'] }) {
  const { t } = useI18n();

  if (query.status === 'loading') {
    return <div className="mono-meta" style={{ color: 'var(--ink-3)' }}>…</div>;
  }
  if (query.status === 'error') {
    return <p style={{ color: 'var(--accent-deep)' }}>{query.error}</p>;
  }
  if (query.status === 'anonymous') return null;

  if (query.groups.length === 0) {
    return (
      <section
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          gap: 'var(--s-6)',
          flexWrap: 'wrap',
        }}
      >
        <div style={{ flex: 1, minWidth: 240 }}>
          <p
            className="display-italic"
            style={{ fontSize: 22, color: 'var(--ink-2)', marginBottom: 'var(--s-2)' }}
          >
            {t('groups.empty')}
          </p>
          <p style={{ color: 'var(--ink-3)', fontSize: 14 }}>{t('groups.emptyBody')}</p>
        </div>
        <div style={{ opacity: 0.85 }}>
          <SittingRat size={72} />
        </div>
      </section>
    );
  }

  return (
    <section>
      <div className="mono-meta" style={{ marginBottom: 'var(--s-3)', color: 'var(--ink-3)' }}>
        {t('groups.yours')}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s-5)' }}>
        {query.groups.map((g) => (
          <GroupCard key={g.id} group={g} />
        ))}
      </div>
    </section>
  );
}

// ─────────────────────────── card ───────────────────────────

function GroupCard({ group }: { group: MyGroup }) {
  const { t, lang } = useI18n();
  const [showInvites, setShowInvites] = useState(false);

  const memberWord = pluralForm(lang, group.member_count, {
    one: t('groups.memberWord1'),
    few: t('groups.memberWord2'),
    many: t('groups.memberWord5'),
  });

  return (
    <article
      style={{
        padding: 'var(--s-5)',
        background: '#fffdf6',
        border: '1px solid var(--hair)',
      }}
    >
      <header style={{ display: 'flex', alignItems: 'baseline', gap: 'var(--s-3)', flexWrap: 'wrap' }}>
        {group.emoji && (
          <span style={{ fontSize: 22, lineHeight: 1 }} aria-hidden>
            {group.emoji}
          </span>
        )}
        <h3 className="display-italic" style={{ margin: 0, fontSize: 24, letterSpacing: -0.5 }}>
          {group.name}
        </h3>
        <span className="mono-meta" style={{ color: 'var(--ink-3)' }}>
          {group.member_count} {memberWord}
        </span>
        <span className="mono-meta" style={{ color: 'var(--accent)' }}>
          {group.role === 'admin' ? t('groups.roleAdmin') : t('groups.roleMember')}
        </span>
      </header>

      {group.description && (
        <p
          style={{
            margin: 'var(--s-3) 0 0',
            color: 'var(--ink-2)',
            fontSize: 14,
            lineHeight: 1.55,
          }}
        >
          {group.description}
        </p>
      )}

      <div style={{ marginTop: 'var(--s-4)' }}>
        <Button
          variant="ghost"
          onClick={() => setShowInvites((v) => !v)}
          style={{ color: 'var(--accent)' }}
        >
          {showInvites ? '−' : '+'} {t('groups.invitesTitle')}
        </Button>
      </div>

      {showInvites && <InviteList groupId={group.id} />}
    </article>
  );
}
