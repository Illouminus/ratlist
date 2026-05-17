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
import { useMemo, useState, type FormEvent } from 'react';
import { useAuth } from '../../auth/useAuth';
import { useGroups, type MyGroup, type UpdateGroupInput } from '../../groups/useGroups';
import { useGroupMembers, type GroupMember } from '../../groups/useGroupMembers';
import { usePeople, type Person } from '../../people/usePeople';
import { useI18n } from '../../i18n/useI18n';
import { pluralForm } from '../../i18n/plural';
import { errorMessage } from '../../lib/errors';
import { PaperLayout } from '../../components/PaperLayout';
import { Field } from '../../components/Field';
import { SketchInput } from '../../components/SketchInput';
import { Button } from '../../components/Button';
import { useToast } from '../../components/Toast';
import { useConfirm } from '../../components/ConfirmDialog';
import { SittingRat } from '../../components/rats';
import { ListSkeleton } from '../../components/Skeleton';
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
  const toast = useToast();
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
      toast.show(t('groups.createdToast', { name: result.group.name }));
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
    return <ListSkeleton rows={4} />;
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
  const toast = useToast();
  const confirm = useConfirm();
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
    const ok = await confirm({
      title: t('groups.deleteConfirmTitle', { name: group.name }),
      body: t('groups.deleteConfirm'),
      confirmLabel: t('groups.confirmYes'),
      cancelLabel: t('groups.cancel'),
      danger: true,
    });
    if (!ok) return;
    setDeleting(true);
    setError(null);
    const result = await onDelete(group.id);
    setDeleting(false);
    if ('error' in result) {
      setError(errorMessage(t, result.error));
      return;
    }
    toast.show(t('groups.deleted'));
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
            if ('ok' in r) {
              setEditing(false);
              toast.show(t('groups.saved'));
            }
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
      {showMembers && (
        <MembersList groupId={group.id} groupName={group.name} viewerIsAdmin={isAdmin} />
      )}
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

interface MembersListProps {
  groupId: string;
  groupName: string;
  /** True if the *viewer* is an admin of this group. Determines whether
   *  promote / demote / kick buttons are even shown for other members.
   *  RLS would refuse the writes anyway, but no point exposing the
   *  buttons to someone who isn't supposed to use them. */
  viewerIsAdmin: boolean;
}

function MembersList({ groupId, groupName, viewerIsAdmin }: MembersListProps) {
  const { t } = useI18n();
  const { user } = useAuth();
  const toast = useToast();
  const confirm = useConfirm();
  const { query, promote, demote, kick, leave, addMember } = useGroupMembers(groupId);
  // Only fetch people when we'll actually render the invite list —
  // admins of this group. usePeople is lazy under the hood, but we
  // skip even the auth check by gating here.
  const { query: peopleQ } = usePeople();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // People the viewer already shares some group with, minus the
  // members of *this* group. These are safe one-tap invites — they're
  // not strangers and they're not already here.
  const inviteCandidates: Person[] = useMemo(() => {
    if (!viewerIsAdmin) return [];
    if (query.status !== 'ready') return [];
    if (peopleQ.status !== 'ready') return [];
    const memberIds = new Set(query.members.map((m) => m.user_id));
    return peopleQ.people.filter((p) => !memberIds.has(p.id));
  }, [viewerIsAdmin, query, peopleQ]);

  /** Wraps an action with busy-state + error handling + an optional
   *  success message. Keeps each onClick a one-liner. */
  async function run(
    op: () => Promise<{ ok: true } | { error: string }>,
    key: string,
    successMessage?: string,
  ): Promise<void> {
    setBusy(key);
    setError(null);
    const r = await op();
    setBusy(null);
    if ('error' in r) {
      setError(errorMessage(t, r.error));
      return;
    }
    if (successMessage) toast.show(successMessage);
  }

  if (query.status === 'loading') {
    return <ListSkeleton rows={3} />;
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
            viewerIsAdmin={viewerIsAdmin}
            busyKey={busy}
            onPromote={() =>
              void run(
                () => promote(m.user_id),
                `promote:${m.user_id}`,
                t('groups.promoted', { name: m.display_name }),
              )
            }
            onDemote={() =>
              void run(
                () => demote(m.user_id),
                `demote:${m.user_id}`,
                t('groups.demoted', { name: m.display_name }),
              )
            }
            onKick={async () => {
              const ok = await confirm({
                title: t('groups.kickConfirmTitle', { name: m.display_name }),
                body: t('groups.kickConfirm', { group: groupName }),
                confirmLabel: t('groups.kick'),
                cancelLabel: t('groups.cancel'),
                danger: true,
              });
              if (!ok) return;
              void run(
                () => kick(m.user_id),
                `kick:${m.user_id}`,
                t('groups.kicked', { name: m.display_name }),
              );
            }}
            onLeave={async () => {
              const ok = await confirm({
                title: t('groups.leaveConfirmTitle', { name: groupName }),
                body: t('groups.leaveConfirm'),
                confirmLabel: t('groups.leave'),
                cancelLabel: t('groups.cancel'),
                danger: true,
              });
              if (!ok) return;
              void run(leave, `leave:${m.user_id}`, t('groups.leftGroup', { name: groupName }));
            }}
          />
        ))}
      </ul>

      {/* Admin-only: one-tap add from existing rats. Newcomers still
          come in via the invite-link section above. */}
      {viewerIsAdmin && (
        <InviteFromPeople
          candidates={inviteCandidates}
          busyKey={busy}
          onAdd={(p) =>
            void run(
              () => addMember(p.id),
              `add:${p.id}`,
              t('groups.addedMember', { name: p.handle ?? p.display_name }),
            )
          }
        />
      )}

      {error && (
        <p style={{ marginTop: 'var(--s-3)', color: 'var(--accent-deep)', fontSize: 13 }}>
          {error}
        </p>
      )}
    </div>
  );
}

// ─────────────────────────── invite-from-people ───────────────────────────

interface InviteFromPeopleProps {
  candidates: Person[];
  busyKey: string | null;
  onAdd: (person: Person) => void;
}

/** Sub-section of MembersList: the rats the viewer already shares a
 *  group with, minus those already in this one. One-tap "+ добавить"
 *  per row — cheaper than copy-pasting an invite link for someone the
 *  viewer is already in a circle with. */
function InviteFromPeople({ candidates, busyKey, onAdd }: InviteFromPeopleProps) {
  const { t } = useI18n();

  return (
    <section style={{ marginTop: 'var(--s-5)' }}>
      <div className="mono-meta" style={{ color: 'var(--ink-3)' }}>
        {t('groups.inviteFromPeopleTitle')}
      </div>
      <p
        style={{
          margin: 'var(--s-2) 0 var(--s-3)',
          fontSize: 12,
          color: 'var(--ink-3)',
          lineHeight: 1.5,
        }}
      >
        {t('groups.inviteFromPeopleHint')}
      </p>

      {candidates.length === 0 ? (
        <p
          style={{
            fontSize: 12,
            color: 'var(--ink-3)',
            fontStyle: 'italic',
            margin: 0,
          }}
        >
          {t('groups.allAlreadyHere')}
        </p>
      ) : (
        <ul
          style={{
            listStyle: 'none',
            padding: 0,
            margin: 0,
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          {candidates.map((p) => (
            <InviteCandidateRow
              key={p.id}
              person={p}
              isBusy={busyKey === `add:${p.id}`}
              onAdd={() => onAdd(p)}
            />
          ))}
        </ul>
      )}
    </section>
  );
}

function InviteCandidateRow({
  person,
  isBusy,
  onAdd,
}: {
  person: Person;
  isBusy: boolean;
  onAdd: () => void;
}) {
  const { t } = useI18n();
  const initial = person.display_name.charAt(0).toUpperCase() || '?';
  const headline = person.handle ?? person.display_name;

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
          width: 28,
          height: 28,
          flexShrink: 0,
          borderRadius: '50%',
          background: 'var(--accent-wash)',
          color: 'var(--ink)',
          display: 'grid',
          placeItems: 'center',
          fontFamily: 'var(--font-display)',
          fontStyle: 'italic',
          fontWeight: 500,
          fontSize: 13,
          boxShadow: 'inset 0 0 0 1px var(--hair-strong)',
        }}
      >
        {initial}
      </span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontSize: 13,
            fontWeight: 500,
            color: 'var(--ink)',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {headline}
        </div>
        {person.handle && person.handle !== person.display_name && (
          <div className="mono-meta" style={{ color: 'var(--ink-3)', marginTop: 1 }}>
            {person.display_name}
          </div>
        )}
      </div>
      <button
        type="button"
        onClick={onAdd}
        disabled={isBusy}
        className="mono-meta"
        style={{
          background: 'transparent',
          border: '1px solid var(--hair-strong)',
          padding: '4px 10px',
          borderRadius: 'var(--r-2)',
          cursor: isBusy ? 'default' : 'pointer',
          color: 'var(--accent)',
        }}
      >
        {isBusy ? t('groups.addingMember') : t('groups.inviteAdd')}
      </button>
    </li>
  );
}

interface MemberRowProps {
  member: GroupMember;
  isSelf: boolean;
  viewerIsAdmin: boolean;
  busyKey: string | null;
  onPromote: () => void;
  onDemote: () => void;
  onKick: () => void;
  onLeave: () => void;
}

function MemberRow({
  member,
  isSelf,
  viewerIsAdmin,
  busyKey,
  onPromote,
  onDemote,
  onKick,
  onLeave,
}: MemberRowProps) {
  const { t } = useI18n();
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
        viewerIsAdmin={viewerIsAdmin}
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
  viewerIsAdmin: boolean;
  isBusy: boolean;
  onPromote: () => void;
  onDemote: () => void;
  onKick: () => void;
  onLeave: () => void;
}

/** Picks the right small set of buttons based on (viewer role, target row):
 *
 *    self       → "leave circle" (always shown to the current user)
 *    other, admin viewer → promote/demote + kick
 *    other, member viewer → nothing
 *
 *  Non-admins used to see the admin controls and just hit an RLS
 *  refusal on click; now the controls are hidden entirely so the UI
 *  matches what's actually permitted.
 */
function MemberActions({
  member,
  isSelf,
  viewerIsAdmin,
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

  // Someone else's row — only admins get the management controls.
  if (!viewerIsAdmin) return null;

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
