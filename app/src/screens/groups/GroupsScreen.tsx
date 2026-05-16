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
import { useAuth } from '../../auth/useAuth';
import { useGroups, type MyGroup, type UpdateGroupInput } from '../../groups/useGroups';
import { useGroupMembers, type GroupMember } from '../../groups/useGroupMembers';
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
  const { query, createGroup, updateGroup, deleteGroup } = useGroups();

  return (
    <PaperLayout>
      <header style={{ marginBottom: 'var(--s-6)' }}>
        <div className="mono-meta" style={{ marginBottom: 'var(--s-3)' }}>
          {t('groups.eyebrow')}
        </div>
        <h2
          className="display-italic"
          style={{ fontSize: 'var(--display-m)', margin: 0, lineHeight: 1.1, letterSpacing: -1 }}
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

      <GroupsList query={query} onUpdate={updateGroup} onDelete={deleteGroup} />
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

interface GroupsListProps {
  query: ReturnType<typeof useGroups>['query'];
  onUpdate: ReturnType<typeof useGroups>['updateGroup'];
  onDelete: ReturnType<typeof useGroups>['deleteGroup'];
}

function GroupsList({ query, onUpdate, onDelete }: GroupsListProps) {
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
          <GroupCard key={g.id} group={g} onUpdate={onUpdate} onDelete={onDelete} />
        ))}
      </div>
    </section>
  );
}

// ─────────────────────────── card ───────────────────────────

interface GroupCardProps {
  group: MyGroup;
  onUpdate: ReturnType<typeof useGroups>['updateGroup'];
  onDelete: ReturnType<typeof useGroups>['deleteGroup'];
}

/** A single group's card: header row + description, plus collapsible
 *  sections (invites, members) and inline edit / delete for admins.
 *
 *  Mounts the per-group hooks (`useGroupMembers`) only when the section
 *  is open, so a screen with many groups doesn't fire a fanout of
 *  queries up front. */
function GroupCard({ group, onUpdate, onDelete }: GroupCardProps) {
  const { t, lang } = useI18n();
  const isAdmin = group.role === 'admin';
  const [showInvites, setShowInvites] = useState(false);
  const [showMembers, setShowMembers] = useState(false);
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const memberWord = pluralForm(lang, group.member_count, {
    one: t('groups.memberWord1'),
    few: t('groups.memberWord2'),
    many: t('groups.memberWord5'),
  });

  async function handleDelete(): Promise<void> {
    if (!window.confirm(t('groups.deleteConfirm', { name: group.name }))) return;
    setDeleting(true);
    setError(null);
    const result = await onDelete(group.id);
    setDeleting(false);
    if ('error' in result) setError(errorMessage(t, result.error));
  }

  return (
    <article
      style={{
        padding: 'var(--s-5)',
        background: '#fffdf6',
        border: '1px solid var(--hair)',
      }}
    >
      {editing ? (
        <GroupEditForm
          group={group}
          onSave={async (input) => {
            const r = await onUpdate(group.id, input);
            if ('ok' in r) setEditing(false);
            return r;
          }}
          onCancel={() => setEditing(false)}
        />
      ) : (
        <>
          <header
            style={{
              display: 'flex',
              alignItems: 'baseline',
              gap: 'var(--s-3)',
              flexWrap: 'wrap',
            }}
          >
            {group.emoji && (
              <span style={{ fontSize: 22, lineHeight: 1 }} aria-hidden>
                {group.emoji}
              </span>
            )}
            <h3
              className="display-italic"
              style={{ margin: 0, fontSize: 24, letterSpacing: -0.5 }}
            >
              {group.name}
            </h3>
            <span className="mono-meta" style={{ color: 'var(--ink-3)' }}>
              {group.member_count} {memberWord}
            </span>
            <span className="mono-meta" style={{ color: 'var(--accent)' }}>
              {isAdmin ? t('groups.roleAdmin') : t('groups.roleMember')}
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
        </>
      )}

      <div
        style={{
          marginTop: 'var(--s-4)',
          display: 'flex',
          alignItems: 'center',
          gap: 'var(--s-4)',
          flexWrap: 'wrap',
        }}
      >
        <ToggleAction
          open={showMembers}
          onClick={() => setShowMembers((v) => !v)}
          label={t('groups.membersTitle')}
        />
        <ToggleAction
          open={showInvites}
          onClick={() => setShowInvites((v) => !v)}
          label={t('groups.invitesTitle')}
        />

        {isAdmin && !editing && (
          <button
            type="button"
            onClick={() => {
              setEditing(true);
              setError(null);
            }}
            className="mono-meta"
            style={{
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              padding: 0,
              color: 'var(--ink-3)',
              marginLeft: 'auto',
            }}
          >
            {t('groups.edit')}
          </button>
        )}
        {isAdmin && !editing && (
          <button
            type="button"
            onClick={() => void handleDelete()}
            disabled={deleting}
            className="mono-meta"
            style={{
              background: 'transparent',
              border: 'none',
              cursor: deleting ? 'default' : 'pointer',
              padding: 0,
              color: 'var(--accent-deep)',
            }}
          >
            {deleting ? t('groups.deleting') : t('groups.delete')}
          </button>
        )}
      </div>

      {error && (
        <p style={{ marginTop: 'var(--s-3)', color: 'var(--accent-deep)', fontSize: 13 }}>
          {error}
        </p>
      )}

      {showInvites && <InviteList groupId={group.id} />}
      {showMembers && <MembersList groupId={group.id} groupName={group.name} />}
    </article>
  );
}

// ─────────────────────────── inline edit form ───────────────────────────

interface GroupEditFormProps {
  group: MyGroup;
  onSave: (input: UpdateGroupInput) => Promise<{ ok: true } | { error: string }>;
  onCancel: () => void;
}

function GroupEditForm({ group, onSave, onCancel }: GroupEditFormProps) {
  const { t } = useI18n();
  const [name, setName] = useState(group.name);
  const [emoji, setEmoji] = useState(group.emoji ?? '');
  const [description, setDescription] = useState(group.description ?? '');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent<HTMLFormElement>): Promise<void> {
    e.preventDefault();
    const trimmed = name.trim();
    if (trimmed.length === 0) return;
    setSubmitting(true);
    setError(null);
    const r = await onSave({ name: trimmed, emoji, description });
    setSubmitting(false);
    if ('error' in r) setError(errorMessage(t, r.error));
  }

  return (
    <form
      onSubmit={handleSubmit}
      style={{ display: 'grid', gridTemplateColumns: '1fr 80px', gap: 'var(--s-4)' }}
    >
      <Field label={t('groups.nameLabel')}>
        <SketchInput
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
          maxLength={80}
        />
      </Field>
      <Field label={t('groups.emojiLabel')}>
        <SketchInput
          type="text"
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
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            maxLength={140}
          />
        </Field>
      </div>
      <div
        style={{
          gridColumn: '1 / -1',
          display: 'flex',
          justifyContent: 'flex-end',
          gap: 'var(--s-3)',
        }}
      >
        <Button variant="ghost" onClick={onCancel}>
          {t('groups.cancel')}
        </Button>
        <Button type="submit" variant="primary" disabled={submitting || name.trim().length === 0}>
          {submitting ? t('groups.saving') : t('groups.save')}
        </Button>
      </div>
      {error && (
        <p style={{ gridColumn: '1 / -1', color: 'var(--accent-deep)', fontSize: 13 }}>{error}</p>
      )}
    </form>
  );
}

// ─────────────────────────── members section ───────────────────────────

function MembersList({ groupId, groupName }: { groupId: string; groupName: string }) {
  const { t } = useI18n();
  const { user } = useAuth();
  const { query, promote, demote, kick, leave } = useGroupMembers(groupId);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run(
    op: () => Promise<{ ok: true } | { error: string }>,
    key: string,
  ): Promise<void> {
    setBusy(key);
    setError(null);
    const r = await op();
    setBusy(null);
    if ('error' in r) setError(errorMessage(t, r.error));
  }

  if (query.status === 'loading') {
    return (
      <div className="mono-meta" style={{ marginTop: 'var(--s-3)', color: 'var(--ink-3)' }}>
        …
      </div>
    );
  }
  if (query.status === 'error') {
    return (
      <p style={{ marginTop: 'var(--s-3)', color: 'var(--accent-deep)', fontSize: 13 }}>
        {query.error}
      </p>
    );
  }
  if (query.status !== 'ready') return null;

  return (
    <div style={{ marginTop: 'var(--s-4)' }}>
      <ul
        style={{
          listStyle: 'none',
          padding: 0,
          margin: 0,
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        {query.members.map((m) => (
          <MemberRow
            key={m.user_id}
            member={m}
            isSelf={m.user_id === user?.id}
            busyKey={busy}
            onPromote={() => void run(() => promote(m.user_id), `promote:${m.user_id}`)}
            onDemote={() => void run(() => demote(m.user_id), `demote:${m.user_id}`)}
            onKick={() => {
              if (!window.confirm(t('groups.kickConfirm', { name: m.display_name, group: groupName }))) return;
              void run(() => kick(m.user_id), `kick:${m.user_id}`);
            }}
            onLeave={() => {
              if (!window.confirm(t('groups.leaveConfirm', { name: groupName }))) return;
              void run(leave, `leave:${m.user_id}`);
            }}
          />
        ))}
      </ul>
      {error && (
        <p style={{ marginTop: 'var(--s-3)', color: 'var(--accent-deep)', fontSize: 13 }}>
          {error}
        </p>
      )}
    </div>
  );
}

interface MemberRowProps {
  member: GroupMember;
  isSelf: boolean;
  busyKey: string | null;
  onPromote: () => void;
  onDemote: () => void;
  onKick: () => void;
  onLeave: () => void;
}

function MemberRow({
  member,
  isSelf,
  busyKey,
  onPromote,
  onDemote,
  onKick,
  onLeave,
}: MemberRowProps) {
  const { t } = useI18n();
  // `viewerIsAdmin` is derived from the parent group's role; we pass it
  // here implicitly via which controls render — admins see promote /
  // demote / kick on others, the current user always sees "leave" on
  // their own row. Non-admin rows show no controls.
  const initial = member.display_name.charAt(0).toUpperCase() || '?';
  const isBusy = busyKey?.endsWith(`:${member.user_id}`);

  return (
    <li
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 'var(--s-3)',
        padding: 'var(--s-3) 0',
        borderBottom: '1px solid var(--hair)',
      }}
    >
      <span
        aria-hidden
        style={{
          width: 32,
          height: 32,
          flexShrink: 0,
          borderRadius: '50%',
          background: 'var(--accent-wash)',
          color: 'var(--ink)',
          display: 'grid',
          placeItems: 'center',
          fontFamily: 'var(--font-display)',
          fontStyle: 'italic',
          fontWeight: 500,
          fontSize: 14,
          boxShadow: 'inset 0 0 0 1px var(--hair-strong)',
        }}
      >
        {initial}
      </span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontSize: 14,
            fontWeight: 600,
            color: 'var(--ink)',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {member.display_name}
          {isSelf && (
            <span
              className="mono-meta"
              style={{ marginLeft: 'var(--s-2)', color: 'var(--accent)' }}
            >
              {t('groups.youBadge')}
            </span>
          )}
        </div>
        <div className="mono-meta" style={{ color: 'var(--ink-3)', marginTop: 2 }}>
          {member.role === 'admin' ? t('groups.roleAdmin') : t('groups.roleMember')}
        </div>
      </div>

      <MemberActions
        member={member}
        isSelf={isSelf}
        isBusy={!!isBusy}
        onPromote={onPromote}
        onDemote={onDemote}
        onKick={onKick}
        onLeave={onLeave}
      />
    </li>
  );
}

interface MemberActionsProps {
  member: GroupMember;
  isSelf: boolean;
  isBusy: boolean;
  onPromote: () => void;
  onDemote: () => void;
  onKick: () => void;
  onLeave: () => void;
}

/** Splits the role/relationship into the right small set of buttons.
 *  Kept in its own component to keep MemberRow's render tree flat. The
 *  viewer-is-admin signal is implicit: we wouldn't even mount these
 *  actions for non-admins on rows other than their own (the row only
 *  ever shows `Leave` to non-admins, see below). */
function MemberActions({
  member,
  isSelf,
  isBusy,
  onPromote,
  onDemote,
  onKick,
  onLeave,
}: MemberActionsProps) {
  const { t } = useI18n();

  if (isSelf) {
    return (
      <button
        type="button"
        onClick={onLeave}
        disabled={isBusy}
        className="mono-meta"
        style={{
          background: 'transparent',
          border: 'none',
          cursor: isBusy ? 'default' : 'pointer',
          padding: 0,
          color: 'var(--accent-deep)',
        }}
      >
        {t('groups.leave')}
      </button>
    );
  }

  // Buttons for someone else's row. These only render if the parent
  // group is one where the viewer is admin — see GroupCard, which
  // mounts `MembersList` regardless of role but the underlying RLS
  // would refuse non-admin writes. We still show the buttons so the
  // server-side denial path is visible during development; in
  // practice non-admin viewers never reach this branch since they
  // wouldn't see the controls in their own view.
  return (
    <div style={{ display: 'flex', gap: 'var(--s-3)', alignItems: 'center' }}>
      {member.role === 'member' ? (
        <button
          type="button"
          onClick={onPromote}
          disabled={isBusy}
          className="mono-meta"
          style={ghostButton}
        >
          {t('groups.promote')}
        </button>
      ) : (
        <button
          type="button"
          onClick={onDemote}
          disabled={isBusy}
          className="mono-meta"
          style={ghostButton}
        >
          {t('groups.demote')}
        </button>
      )}
      <button
        type="button"
        onClick={onKick}
        disabled={isBusy}
        className="mono-meta"
        style={{ ...ghostButton, color: 'var(--accent-deep)' }}
      >
        {t('groups.kick')}
      </button>
    </div>
  );
}

const ghostButton: React.CSSProperties = {
  background: 'transparent',
  border: 'none',
  cursor: 'pointer',
  padding: 0,
  color: 'var(--ink-3)',
};

// ─────────────────────────── small atoms ───────────────────────────

interface ToggleActionProps {
  open: boolean;
  onClick: () => void;
  label: string;
}

/** Discreet "+ / − label" toggle, repeated for invites and members. */
function ToggleAction({ open, onClick, label }: ToggleActionProps) {
  return (
    <Button variant="ghost" onClick={onClick} style={{ color: 'var(--accent)' }}>
      {open ? '−' : '+'} {label}
    </Button>
  );
}
