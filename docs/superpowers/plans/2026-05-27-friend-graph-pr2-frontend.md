# Friend graph PR 2 — frontend switchover

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the circles UX with the friend-graph + categories UX shipped backend-side in PR 1. After this PR lands, users add friends (email/add-me-link), set per-item visibility (private/friends/public), and organise items into freeform categories. Old `/groups` screen becomes a redirect to `/people`. Events untouched.

**Architecture:** All work is `app/src/`. Three new screens (`AddMeScreen`, `AcceptFriendInviteScreen`, `FriendsScreen` — the last is a rename of `PeopleScreen`). Four new components (`AddFriendModal`, `VisibilitySelector`, `CategoryInput`, `CategoryChips`). Two new hooks (`useFriends`, `useFriendInvites`). Modifications to `MyListScreen`/`FriendListScreen`/`PublicListScreen`/`AddItemScreen`/`EditItemScreen`/`InviteFromPeopleModal`/`Router`/`AuthCallbackScreen`/`LandingScreen`/`SettingsScreen`. New `errors.ts` codes for the friend-invite branches. i18n keys in both `ru.ts` and `en.ts`.

**Tech Stack:** React 19 + TypeScript strict, Supabase JS client, react-router-dom 7. Tests via vitest + React Testing Library.

**Spec:** `docs/superpowers/specs/2026-05-27-friend-graph-categories-design.md` (already merged to main).

**Plan for PR 1 (already merged):** `docs/superpowers/plans/2026-05-27-friend-graph-pr1-additive.md`. See it for the RPC contracts you'll consume from the frontend.

---

## File structure summary

**Added:**
```
app/src/friends/
  ├─ useFriends.tsx            # wraps get_friends() + unfriend + realtime
  └─ useFriendInvites.tsx      # wraps sent pending invites (for resend/revoke)

app/src/screens/
  ├─ FriendsScreen.tsx         # RENAMED from PeopleScreen.tsx (same route /people)
  ├─ AddMeScreen.tsx           # NEW route /add-me/:token (anon-friendly)
  └─ AcceptFriendInviteScreen.tsx  # NEW route /friend-invite/:token

app/src/components/
  ├─ AddFriendModal.tsx        # email + add-me-link, two paths in one modal
  ├─ VisibilitySelector.tsx    # 3-segment toggle for items
  ├─ CategoryInput.tsx         # text input + autocomplete dropdown
  └─ CategoryChips.tsx         # chip-row filter
```

**Modified:**
```
app/src/Router.tsx                     # new routes, /groups redirect
app/src/auth/AuthCallbackScreen.tsx    # pending friend-invite/add-me redirect
app/src/screens/MyListScreen.tsx       # CategoryChips
app/src/screens/FriendListScreen.tsx   # CategoryChips + unfriend kebab
app/src/screens/PublicListScreen.tsx   # CategoryChips
app/src/screens/AddItemScreen.tsx      # VisibilitySelector + CategoryInput
app/src/screens/EditItemScreen.tsx     # VisibilitySelector + CategoryInput
app/src/screens/LandingScreen.tsx      # update feature1 + add boards feature
app/src/screens/SettingsScreen.tsx     # drop "manage groups" link (if present)
app/src/components/InviteFromPeopleModal.tsx  # use useFriends instead of useGroups
app/src/lib/errors.ts                  # add codes for the new RPC exceptions
app/src/i18n/ru.ts                     # new keys
app/src/i18n/en.ts                     # new keys
```

**Removed (PR 3, not this one):** GroupsScreen, useGroups, InviteList, etc.

---

## Task 0 — Setup

- [ ] **Step 0.1: Branch off main**

```bash
cd /Users/edouard/dev/wishlist
git checkout main && git pull --ff-only
git checkout -b feat/friend-graph-pr2-frontend
```

- [ ] **Step 0.2: Verify Supabase local is running**

```bash
supabase status --output env | grep API_URL
```
Expected: `API_URL="http://127.0.0.1:54421"`.

- [ ] **Step 0.3: Verify PR 1 schema is applied locally**

```bash
PGPASSWORD=postgres psql -h 127.0.0.1 -p 54422 -U postgres -d postgres \
  -c "select count(*) from pg_proc where proname in ('get_friends', 'create_friend_invite', 'accept_friend_invite', 'accept_add_me', 'unfriend', 'rotate_add_me_token', 'are_friends', 'get_friend_list');"
```
Expected: `8`. If less, run `supabase migration up --local`.

---

## Task 1 — Hooks foundation: `useFriends` + `useFriendInvites` + error mapper

**Files:**
- Create: `app/src/friends/useFriends.tsx`
- Create: `app/src/friends/useFriendInvites.tsx`
- Modify: `app/src/lib/errors.ts`
- Create: `app/src/friends/__tests__/useFriends.test.tsx`

**Context:** Follow the existing hook pattern: pure free async fetcher returns a FetchState, then a `useEffect` calls it and `setState` happens after `.then(...)` — never synchronously inside the effect body. Existing reference: `app/src/people/usePeople.tsx`.

- [ ] **Step 1.1: Write the failing useFriends test**

`app/src/friends/__tests__/useFriends.test.tsx` — mock the Supabase client, exercise the hook's loading → loaded → unfriend flow. Mirror the pattern from `app/src/people/__tests__/usePeople.test.tsx` (read that file to match the fixture shape).

Minimum 3 test cases:
1. `useFriends` returns `state.kind === 'loading'` then `state.kind === 'loaded'` with friends list.
2. `unfriend` removes a row from the in-memory list AND calls `supabase.rpc('unfriend', { _other: ... })`.
3. Real-time `INSERT` event on `friendships` adds a new friend via re-fetch.

- [ ] **Step 1.2: Run test, verify failure**

```bash
cd /Users/edouard/dev/wishlist/app && npm test -- useFriends
```
Expected: module-not-found / hook doesn't exist.

- [ ] **Step 1.3: Implement `useFriends`**

`app/src/friends/useFriends.tsx`:

```tsx
import { useEffect, useState, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { debounce } from '../lib/debounce';
import type { Database } from '../types/database';

type ProfileRow = Database['public']['Functions']['get_friends']['Returns'][number];

export type FriendsState =
  | { kind: 'loading' }
  | { kind: 'loaded'; friends: ProfileRow[] }
  | { kind: 'error'; message: string };

async function fetchFriends(): Promise<FriendsState> {
  const { data, error } = await supabase.rpc('get_friends');
  if (error) return { kind: 'error', message: error.message };
  return { kind: 'loaded', friends: (data ?? []) as ProfileRow[] };
}

export function useFriends(): {
  state: FriendsState;
  refresh: () => void;
  unfriend: (otherId: string) => Promise<{ ok: true } | { ok: false; message: string }>;
} {
  const [state, setState] = useState<FriendsState>({ kind: 'loading' });
  const [tick, setTick] = useState(0);
  const refresh = useCallback(() => setTick((t) => t + 1), []);

  useEffect(() => {
    let cancelled = false;
    fetchFriends().then((next) => {
      if (!cancelled) setState(next);
    });
    return () => { cancelled = true; };
  }, [tick]);

  // Realtime: re-fetch (debounced) when friendships change anywhere.
  // Server filters via RLS to only the current user's edges.
  useEffect(() => {
    const debounced = debounce(refresh, 300);
    const channel = supabase
      .channel('friendships-changes')
      .on('postgres_changes',
          { event: '*', schema: 'public', table: 'friendships' },
          () => debounced())
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [refresh]);

  const unfriend = useCallback(async (otherId: string) => {
    const { error } = await supabase.rpc('unfriend', { _other: otherId });
    if (error) return { ok: false as const, message: error.message };
    refresh();
    return { ok: true as const };
  }, [refresh]);

  return { state, refresh, unfriend };
}
```

- [ ] **Step 1.4: Implement `useFriendInvites`**

Smaller hook — exposes the caller's pending sent invites (where `accepted_at is null`). Used by FriendsScreen for a "pending" section if any exist, and to allow revoke.

`app/src/friends/useFriendInvites.tsx`:

```tsx
import { useEffect, useState, useCallback } from 'react';
import { supabase } from '../lib/supabase';

export interface PendingInvite {
  token: string;
  to_email: string;
  created_at: string;
  message: string | null;
}

export type PendingInvitesState =
  | { kind: 'loading' }
  | { kind: 'loaded'; invites: PendingInvite[] }
  | { kind: 'error'; message: string };

async function fetchPending(): Promise<PendingInvitesState> {
  const { data, error } = await supabase
    .from('friend_invites')
    .select('token, to_email, created_at, message')
    .is('accepted_at', null)
    .order('created_at', { ascending: false });
  if (error) return { kind: 'error', message: error.message };
  return { kind: 'loaded', invites: (data ?? []) as PendingInvite[] };
}

export function useFriendInvites(): {
  state: PendingInvitesState;
  refresh: () => void;
  revoke: (token: string) => Promise<{ ok: true } | { ok: false; message: string }>;
} {
  const [state, setState] = useState<PendingInvitesState>({ kind: 'loading' });
  const [tick, setTick] = useState(0);
  const refresh = useCallback(() => setTick((t) => t + 1), []);

  useEffect(() => {
    let cancelled = false;
    fetchPending().then((next) => { if (!cancelled) setState(next); });
    return () => { cancelled = true; };
  }, [tick]);

  const revoke = useCallback(async (token: string) => {
    const { error } = await supabase.from('friend_invites').delete().eq('token', token);
    if (error) return { ok: false as const, message: error.message };
    refresh();
    return { ok: true as const };
  }, [refresh]);

  return { state, refresh, revoke };
}
```

- [ ] **Step 1.5: Extend `lib/errors.ts` with new codes**

Read existing `app/src/lib/errors.ts` first. Add to the `ErrorCode` union:
```ts
| 'tokenNotFound'
| 'tokenExpired'      // not used in PR-1 RPCs but reserved for future
| 'alreadyAccepted'
| 'emailMismatch'
| 'selfInvite'
| 'selfLink'
| 'selfUnfriend'
| 'noEmail'
| 'invalidEmail'
| 'inviteNotFound'    // edge-fn-side
| 'inviteUsed'        // edge-fn-side
| 'notOwner'          // edge-fn-side
| 'sendFailed'        // edge-fn-side
```

Add matching translation keys in `errors.*` in both i18n files (Task 2).

Inside `errorCode(err)`, add `m.includes(...)` branches:
- `'token_not_found' → 'tokenNotFound'`
- `'already_accepted' → 'alreadyAccepted'`
- `'email_mismatch' → 'emailMismatch'`
- `'self_invite' → 'selfInvite'`
- `'self_link' → 'selfLink'`
- `'self_unfriend' → 'selfUnfriend'`
- `'no_email' → 'noEmail'`
- `'invalid_email' → 'invalidEmail'`
- `'invite_not_found' → 'inviteNotFound'`
- `'invite_used' → 'inviteUsed'`
- `'not_owner' → 'notOwner'`
- `'send_failed' → 'sendFailed'`

- [ ] **Step 1.6: Run tests, verify pass**

```bash
cd /Users/edouard/dev/wishlist/app && npm test -- useFriends
```
Expected: 3 tests pass.

- [ ] **Step 1.7: Run full frontend tests for regression sanity**

```bash
cd /Users/edouard/dev/wishlist/app && npm test
```
Expected: 190+/190+ pass (187 was the pre-PR-1 baseline; PR 1 added 0 frontend tests; Task 1 here adds 3 = 190).

- [ ] **Step 1.8: Commit**

```bash
cd /Users/edouard/dev/wishlist
git add app/src/friends/ app/src/lib/errors.ts
git commit -m "feat(friends): hooks foundation + error mapper

Adds useFriends (list + unfriend + realtime) and useFriendInvites
(pending sent invites + revoke). Extends lib/errors.ts to map the
13 new exception/error codes from PR-1's friend-graph RPCs and
the send-friend-invite Edge Function.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 2 — i18n keys (RU + EN)

**Files:**
- Modify: `app/src/i18n/ru.ts`
- Modify: `app/src/i18n/en.ts`

Both files must change together to keep the `Translation` shape conformant.

- [ ] **Step 2.1: Add the new keys**

Read `app/src/i18n/ru.ts` first to understand existing structure (it's the source-of-truth shape).

Add (or expand existing sections):

```typescript
// New top-level section: friends.*
friends: {
  title:                'Крысы',                              // EN: 'My rats'
  empty:                'Ещё нет крыс. Добавь первую →',
  addCta:               'Добавить',
  unfriend:             'Убрать из крыс',
  unfriendConfirm:      'Аня больше не увидит твой список, и ты — её. Точно?',
  unfriendDone:         'Убрали из крыс.',
  pendingTitle:         'Отправленные приглашения',
  pendingEmpty:         'Нет ожидающих ответа.',
  revoke:               'Отменить',
  revokeConfirm:        'Отменить приглашение для {email}?',
},

// Friend-invite modal: addFriend.*
addFriend: {
  title:                'Добавить крысу',
  emailLabel:           'По email',
  emailPlaceholder:     'anya@example.com',
  emailMessageLabel:    'Сообщение (необязательно)',
  emailMessagePlaceholder: 'Аня, добавляйся, шобы я знал что тебе подарить',
  emailSubmit:          'Отправить приглашение',
  emailSent:            'Приглашение отправлено',
  divider:              '— или —',
  linkLabel:            'Твоя ссылка',
  linkHint:             'Скинь её в Telegram/WhatsApp.',
  linkCopy:             'Скопировать',
  linkCopied:           'Скопировано',
  linkRotate:           'Обновить ссылку',
  linkRotated:          'Ссылка обновлена',
},

// Add-me public landing
addMe: {
  title:                '{name} хочет дружить',
  body:                 'На Rat List вы будете видеть вишлисты друг друга — без рекламы и алгоритмов.',
  cta:                  'Подружиться',
  acceptedToast:        'Готово, теперь вы крысы',
  selfErr:              'Это твоя собственная ссылка.',
  tokenNotFoundErr:     'Ссылка больше не действительна.',
},

// Accept-friend-invite landing
acceptFriendInvite: {
  title:                '{name} зовёт тебя дружить',
  body:                 'На Rat List вы будете видеть вишлисты друг друга — без рекламы и алгоритмов.',
  cta:                  'Принять',
  acceptedToast:        'Готово, теперь вы крысы',
  alreadyAcceptedErr:   'Это приглашение уже использовано. Попроси новое.',
  emailMismatchErr:     'Приглашение было отправлено на другой email. Попроси переотправить.',
  tokenNotFoundErr:     'Приглашение не найдено или истекло.',
  selfErr:              'Себя в друзья добавить нельзя.',
},

// Item visibility
visibility: {
  private:              'Только я',
  friends:              'Друзья',
  public:               'Всем по ссылке',
  privateHelp:          'Видишь только ты — никто из друзей не увидит.',
  friendsHelp:          'Твои крысы видят это в твоём списке.',
  publicHelp:           'Появляется на твоей публичной странице — там, где есть share-ссылка.',
},

// Categories
categories: {
  inputLabel:           'Категория',
  inputPlaceholder:     'Кухня, книги, для дома…',
  inputHelp:            'Свободный текст. Используется чтобы фильтровать список.',
  chipAll:              'Все',
  chipUncategorised:    'Без категории',
},

// errors.* — add new entries
errors: {
  // ... existing entries stay
  tokenNotFound:        'Ссылка не найдена или истекла.',
  alreadyAccepted:      'Это приглашение уже использовано.',
  emailMismatch:        'Приглашение было отправлено на другой email.',
  selfInvite:           'Себя в друзья добавить нельзя.',
  selfLink:             'Это твоя собственная ссылка.',
  selfUnfriend:         'Себя из друзей удалить нельзя.',
  noEmail:              'У твоего аккаунта нет email.',
  invalidEmail:         'Неверный формат email.',
  inviteNotFound:       'Приглашение не найдено.',
  inviteUsed:           'Это приглашение уже использовано.',
  notOwner:             'Только отправитель может управлять этим приглашением.',
  sendFailed:           'Не удалось отправить письмо. Попробуй ещё раз.',
},
```

Plus update `landing.feature*Body` if the spec says to replace one with «доски» (Task 10 will handle the landing details — i18n keys for that go here too):

```typescript
landing: {
  // ... existing entries
  // Replace feature1Body with friend-graph version, OR add new feature5 keys.
  // Per the spec, the 4 features become:
  //   1. крысиные стаи (rebranded body — about friends)
  //   2. тайный санта (unchanged)
  //   3. доски (replaces "поделись ссылкой")
  //   4. бумажный вайб (unchanged)
  feature1Title:   'крысиные стаи',
  feature1Body:    'добавляешь крыс в стаю, они видят твой список, ты — их. без алгоритмов и рекламы.',
  feature3Title:   'доски',
  feature3Body:    'кухня, книги, для дома — рассортируй желания на доски, как в Pinterest. шеришь ссылкой — все или ничего, как сам решишь.',
},
```

Provide English equivalents in `en.ts` — same structure, English text. Keep the casual register.

- [ ] **Step 2.2: Verify tsc**

```bash
cd /Users/edouard/dev/wishlist/app && npx tsc -b
```
Expected: clean. If error like "Property 'X' is missing in type 'Translation'…" then one file is out of sync — fix.

- [ ] **Step 2.3: Commit**

```bash
cd /Users/edouard/dev/wishlist
git add app/src/i18n/
git commit -m "feat(i18n): friend-graph + categories + visibility keys (RU + EN)

Adds friends.*, addFriend.*, addMe.*, acceptFriendInvite.*,
visibility.*, categories.* sections. Extends errors.* with the 12
new RPC/edge-fn exception codes from PR 1. Updates landing
feature1Body + feature3 (replaces 'поделись ссылкой' with 'доски').

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 3 — `<AddFriendModal>` component

**Files:**
- Create: `app/src/components/AddFriendModal.tsx`
- Create: `app/src/components/__tests__/AddFriendModal.test.tsx`

**Spec:** One modal with two paths rendered side-by-side: (1) email + optional message → `create_friend_invite` RPC + `send-friend-invite` Edge Function; (2) read-only display of caller's `add_me_token` with copy + rotate buttons.

- [ ] **Step 3.1: Write the failing test**

3 cases:
1. Renders both paths (email input + add-me link visible).
2. Submit email → calls `create_friend_invite` RPC + invokes Edge Function + shows toast.
3. Copy button copies the add-me URL to clipboard (mock `navigator.clipboard.writeText`).

Mirror `app/src/components/__tests__/ShareDialog.test.tsx` for the modal/clipboard pattern.

- [ ] **Step 3.2–3.4: Run failing, implement, run passing**

Component shape:

```tsx
import { useState } from 'react';
import { supabase } from '../lib/supabase';
import { useI18n } from '../i18n/useI18n';
import { useToast } from './Toast';
import { useProfile } from '../auth/useProfile';
import { Button } from './Button';
import { Field } from './Field';
import { SketchInput } from './SketchInput';
import { errorCode, errorMessage } from '../lib/errors';

export interface AddFriendModalProps {
  open: boolean;
  onClose: () => void;
}

export function AddFriendModal({ open, onClose }: AddFriendModalProps) {
  const { t } = useI18n();
  const { profile, refresh: refreshProfile } = useProfile();
  const toast = useToast();
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  if (!open) return null;

  const addMeUrl = profile?.add_me_token
    ? `${window.location.origin}/add-me/${profile.add_me_token}`
    : '';

  async function submitEmail() {
    setBusy(true);
    const { data: token, error } = await supabase.rpc('create_friend_invite', {
      _email: email,
      _message: message || null,
    });
    if (error) {
      toast.show(errorMessage(t, error));
      setBusy(false);
      return;
    }
    const { error: fnErr } = await supabase.functions.invoke('send-friend-invite', {
      body: { token, email },
    });
    setBusy(false);
    if (fnErr) {
      toast.show(t('errors.sendFailed'));
      return;
    }
    toast.show(t('addFriend.emailSent'));
    setEmail('');
    setMessage('');
    onClose();
  }

  async function copyLink() {
    await navigator.clipboard.writeText(addMeUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  async function rotateLink() {
    const { error } = await supabase.rpc('rotate_add_me_token');
    if (error) {
      toast.show(errorMessage(t, error));
      return;
    }
    await refreshProfile();
    toast.show(t('addFriend.linkRotated'));
  }

  return (
    <div role="dialog" aria-modal="true" style={{ /* overlay + paper card */ }}>
      <h2 className="display-italic">{t('addFriend.title')}</h2>

      {/* — email path — */}
      <section>
        <Field label={t('addFriend.emailLabel')}>
          <SketchInput
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder={t('addFriend.emailPlaceholder')}
          />
        </Field>
        <Field label={t('addFriend.emailMessageLabel')}>
          <SketchInput
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder={t('addFriend.emailMessagePlaceholder')}
          />
        </Field>
        <Button variant="primary" onClick={submitEmail} disabled={!email || busy}>
          {t('addFriend.emailSubmit')}
        </Button>
      </section>

      <p className="mono-meta">{t('addFriend.divider')}</p>

      {/* — add-me link path — */}
      <section>
        <Field label={t('addFriend.linkLabel')}>
          <code>{addMeUrl}</code>
        </Field>
        <p className="marginalia">{t('addFriend.linkHint')}</p>
        <Button onClick={copyLink}>{copied ? t('addFriend.linkCopied') : t('addFriend.linkCopy')}</Button>
        <Button variant="ghost" onClick={rotateLink}>{t('addFriend.linkRotate')}</Button>
      </section>

      <Button variant="ghost" onClick={onClose}>{t('common.close')}</Button>
    </div>
  );
}
```

Styling: paper card overlay, hairline borders, terracotta accent on primary CTA. Use the editorial vibe — see `app/src/components/ShareDialog.tsx` for a working modal template to copy structurally.

Focus trap: required per WCAG, the project ships its own focus-trap pattern — see `ShareDialog`.

- [ ] **Step 3.5: Commit**

```bash
git add app/src/components/AddFriendModal.tsx \
        app/src/components/__tests__/AddFriendModal.test.tsx
git commit -m "feat(friends): AddFriendModal — email invite + add-me-link, one dialog

Two paths in a single modal: (1) email + optional message → calls
create_friend_invite RPC + send-friend-invite Edge Function;
(2) per-user add-me link with copy + rotate.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 4 — `<VisibilitySelector>` + `<CategoryInput>` + `<CategoryChips>` components

**Files:**
- Create: `app/src/components/VisibilitySelector.tsx`
- Create: `app/src/components/CategoryInput.tsx`
- Create: `app/src/components/CategoryChips.tsx`
- Create: `app/src/components/__tests__/VisibilitySelector.test.tsx`
- Create: `app/src/components/__tests__/CategoryInput.test.tsx`
- Create: `app/src/components/__tests__/CategoryChips.test.tsx`

Three small, focused components — one task because they're cohesive.

- [ ] **Step 4.1: Implement VisibilitySelector**

Three-segment toggle. Icons: 🔒 (lock for private), 👥 / two-rats for friends, 🌐 / globe for public. Use SVGs from existing `rats/` or simple line drawings. Active segment: terracotta underline. Show helper text below for the active state.

```tsx
export type Visibility = 'private' | 'friends' | 'public';

export interface VisibilitySelectorProps {
  value: Visibility;
  onChange: (next: Visibility) => void;
}

export function VisibilitySelector({ value, onChange }: VisibilitySelectorProps) {
  // 3 segments + helper text below
}
```

Test: default state, click each segment, helper text matches.

- [ ] **Step 4.2: Implement CategoryInput**

Text input with autocomplete dropdown. Fetches owner's distinct categories via:
```ts
const { data } = await supabase
  .from('items')
  .select('category')
  .eq('owner_id', userId)
  .not('category', 'is', null);
const unique = Array.from(new Set(data?.map(r => r.category as string) ?? [])).sort();
```
Filter by case-insensitive prefix match on the typed text. Render top 5 suggestions as a paper-card popover below the input. Enter or click → applies.

```tsx
export interface CategoryInputProps {
  value: string | null;
  onChange: (next: string | null) => void;
}
```

Test: empty value = null; type "Кух..." with existing "Кухня" → suggestion appears; pick → sets value; type new value + blur → sets new value.

- [ ] **Step 4.3: Implement CategoryChips**

Horizontal row of chips. First chip "Все" / "All" (active by default). Then one chip per distinct category in the items list passed in via props, with count. "Без категории" / "Uncategorised" chip if any null-category items exist.

```tsx
export interface CategoryChipsProps {
  items: Array<{ category: string | null }>;
  active: string | null | 'all';  // 'all' = no filter, null = uncategorised
  onChange: (next: string | null | 'all') => void;
}
```

Counts computed client-side from the loaded items. Active chip: terracotta underline.

Test: renders all distinct categories with counts; click triggers onChange with the right value; "Все" resets.

- [ ] **Step 4.4: Run tests + commit**

```bash
cd /Users/edouard/dev/wishlist/app && npm test -- VisibilitySelector CategoryInput CategoryChips
```
Expected: all tests pass.

```bash
git add app/src/components/VisibilitySelector.tsx app/src/components/CategoryInput.tsx \
        app/src/components/CategoryChips.tsx app/src/components/__tests__/Visibility* \
        app/src/components/__tests__/Category*
git commit -m "feat(items): visibility selector + category input/chips components

Three small focused components for PR-2 item-form + list filters:
- VisibilitySelector: 3-segment private/friends/public toggle
- CategoryInput: text + autocomplete dropdown (case-insensitive dedup
  matches the spec; uses owner's existing categories)
- CategoryChips: horizontal filter row (Все · Кухня (8) · Книги (3) · …)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 5 — Rename PeopleScreen → FriendsScreen, wire up AddFriendModal + unfriend

**Files:**
- Move/Rename: `app/src/screens/PeopleScreen.tsx` → `app/src/screens/FriendsScreen.tsx`
- Modify: `app/src/Router.tsx` (update the import)
- Update existing tests if they import PeopleScreen

- [ ] **Step 5.1: Read PeopleScreen to understand current shape**

```bash
cat /Users/edouard/dev/wishlist/app/src/screens/PeopleScreen.tsx
```

It currently uses `usePeople` (group-members-derived). New version uses `useFriends` (Task 1).

- [ ] **Step 5.2: Rename file + rewrite content**

`git mv app/src/screens/PeopleScreen.tsx app/src/screens/FriendsScreen.tsx`

Then rewrite — replace `usePeople` with `useFriends`, change the empty state copy to `t('friends.empty')`, add a `+ Добавить` CTA in the header that opens `<AddFriendModal>`, add a kebab menu on each friend card with "Убрать из крыс" → confirm dialog → `unfriend(otherId)`.

Inside the screen, also render the pending sent invites from `useFriendInvites` if any are present — a small section above the friends grid.

- [ ] **Step 5.3: Update Router**

```ts
// app/src/Router.tsx
const FriendsScreen = lazyNamed(
  () => import('./screens/FriendsScreen'),
  'FriendsScreen',
);
// Then in the routes table:
<Route path="/people" element={appRoute(<FriendsScreen />)} />
```

- [ ] **Step 5.4: Test the rename works**

```bash
cd /Users/edouard/dev/wishlist/app && npx tsc -b && npm test 2>&1 | tail -10
```
Expected: clean. If any existing test imports `PeopleScreen`, update those imports to `FriendsScreen`.

- [ ] **Step 5.5: Commit**

```bash
git add app/src/screens/FriendsScreen.tsx app/src/Router.tsx
git rm app/src/screens/PeopleScreen.tsx  # if not done via git mv
git commit -m "refactor(friends): PeopleScreen → FriendsScreen, wire useFriends + AddFriendModal

Route /people unchanged (URL stability). Component now reads
useFriends (the new mutual friend graph) instead of usePeople
(legacy group-derived). Adds an 'Добавить' CTA opening
AddFriendModal, and an 'Убрать из крыс' kebab on each friend
card with confirm dialog.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 6 — AddMeScreen + AcceptFriendInviteScreen + Router routes + AuthCallback handling

**Files:**
- Create: `app/src/screens/AddMeScreen.tsx`
- Create: `app/src/screens/AcceptFriendInviteScreen.tsx`
- Modify: `app/src/Router.tsx`
- Modify: `app/src/auth/AuthCallbackScreen.tsx`

**Key behaviour:** Both screens must work when the user lands while signed-out: capture the token in `?next=`-style param, send to `/login`, then AuthCallback redirects back here and we accept.

- [ ] **Step 6.1: AddMeScreen**

`app/src/screens/AddMeScreen.tsx`:

```tsx
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../auth/useAuth';
import { useI18n } from '../i18n/useI18n';
import { errorCode } from '../lib/errors';
import { PaperLayout } from '../components/PaperLayout';
import { Button } from '../components/Button';

export function AddMeScreen() {
  const { token } = useParams<{ token: string }>();
  const { user } = useAuth();
  const { t } = useI18n();
  const navigate = useNavigate();
  const [ownerName, setOwnerName] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Preview the profile (anon-friendly via add_me_token unique lookup).
  // Strictly speaking we don't expose a "preview by add_me_token" RPC
  // yet — for PR 2 we just show a generic "someone wants to be your
  // friend" without the name. PR 3+ can add a `get_add_me_preview` RPC.
  // For now display generic copy.

  if (!user) {
    return (
      <PaperLayout as="main">
        <h1 className="display-italic">{t('addMe.title', { name: '' })}</h1>
        <p>{t('addMe.body')}</p>
        <Link to={`/login?next=${encodeURIComponent(`/add-me/${token}`)}`}>
          <Button variant="primary">{t('auth.signIn')}</Button>
        </Link>
      </PaperLayout>
    );
  }

  async function accept() {
    setBusy(true);
    const { data: ownerId, error } = await supabase.rpc('accept_add_me', { _token: token! });
    setBusy(false);
    if (error) {
      const code = errorCode(error);
      if (code === 'selfLink') setError(t('addMe.selfErr'));
      else if (code === 'tokenNotFound') setError(t('addMe.tokenNotFoundErr'));
      else setError(t('errors.unexpected'));
      return;
    }
    navigate(`/p/${ownerId}`);
  }

  return (
    <PaperLayout as="main">
      <h1 className="display-italic">{t('addMe.title', { name: ownerName ?? '' })}</h1>
      <p>{t('addMe.body')}</p>
      {error && <p style={{ color: 'var(--accent-deep)' }}>{error}</p>}
      <Button variant="primary" onClick={accept} disabled={busy}>{t('addMe.cta')}</Button>
    </PaperLayout>
  );
}
```

- [ ] **Step 6.2: AcceptFriendInviteScreen**

`app/src/screens/AcceptFriendInviteScreen.tsx` — same shape as AddMeScreen, but calls `accept_friend_invite` and handles different exceptions (`emailMismatch`, `alreadyAccepted`, `tokenNotFound`, `selfInvite`).

- [ ] **Step 6.3: Router updates**

```tsx
// app/src/Router.tsx — eager imports (these screens need to work pre-auth)
import { AddMeScreen } from './screens/AddMeScreen';
import { AcceptFriendInviteScreen } from './screens/AcceptFriendInviteScreen';

// Routes
<Route path="/add-me/:token" element={<AddMeScreen />} />
<Route path="/friend-invite/:token" element={<AcceptFriendInviteScreen />} />
```

Both routes work for anonymous AND authed callers — the screens themselves decide what to render.

- [ ] **Step 6.4: AuthCallbackScreen — handle next-redirect for these new flows**

Read `app/src/auth/AuthCallbackScreen.tsx`. The existing implementation honours a `next` URL param via the magic-link redirect. Verify it correctly routes to `/add-me/:token` or `/friend-invite/:token` after sign-in. If the existing logic is generic (allows any same-origin path), nothing to change.

- [ ] **Step 6.5: Commit**

```bash
git add app/src/screens/AddMeScreen.tsx \
        app/src/screens/AcceptFriendInviteScreen.tsx \
        app/src/Router.tsx \
        app/src/auth/AuthCallbackScreen.tsx
git commit -m "feat(friends): /add-me and /friend-invite landing screens

Two new routes that work for both signed-out and signed-in visitors.
Signed-out: prompt sign-in, preserve token in ?next=. Signed-in:
call accept_add_me / accept_friend_invite, redirect to /p/<id>.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 7 — AddItemScreen + EditItemScreen: integrate VisibilitySelector + CategoryInput

**Files:**
- Modify: `app/src/screens/AddItemScreen.tsx`
- Modify: `app/src/screens/EditItemScreen.tsx`

If there's a shared `ItemForm` component, modify that instead — both screens probably use it.

- [ ] **Step 7.1: Read existing AddItemScreen + EditItemScreen + ItemForm**

```bash
cat /Users/edouard/dev/wishlist/app/src/screens/AddItemScreen.tsx
cat /Users/edouard/dev/wishlist/app/src/screens/EditItemScreen.tsx
grep -rn "ItemForm" /Users/edouard/dev/wishlist/app/src/ | head
```

Confirm which file holds the form fields.

- [ ] **Step 7.2: Add fields to the form**

Insert `<VisibilitySelector>` and `<CategoryInput>` into the form. Default visibility = `'friends'`. Default category = null.

Form submission: include `visibility` and `category` in the INSERT/UPDATE payload to the `items` table.

Remove the old "publish to circle X" multi-select if present (that was the old item_groups UI). Don't touch the `item_groups` table writes if they still exist somewhere — PR 3 will drop them. For PR 2: just don't write to `item_groups` anymore. Reads from the items table will Just Work because the items SELECT RLS already covers the 3-state visibility (PR 1 Task 3).

- [ ] **Step 7.3: Update tests**

The existing AddItemScreen / EditItemScreen tests should still pass with the new fields. Run:

```bash
cd /Users/edouard/dev/wishlist/app && npm test -- AddItemScreen EditItemScreen ItemForm
```

Add new test cases asserting:
- Default visibility = 'friends'.
- Submitting writes `visibility` and `category` to the payload.

- [ ] **Step 7.4: Commit**

```bash
git add app/src/screens/AddItemScreen.tsx app/src/screens/EditItemScreen.tsx \
        app/src/screens/ItemForm.tsx  # if separate
git commit -m "feat(items): VisibilitySelector + CategoryInput in add/edit forms

Replaces the old circles multi-select with per-item visibility (3-state)
and freeform category text. Default visibility = 'friends'.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 8 — MyList + FriendList + PublicList: CategoryChips integration

**Files:**
- Modify: `app/src/screens/MyListScreen.tsx`
- Modify: `app/src/screens/FriendListScreen.tsx`
- Modify: `app/src/screens/PublicListScreen.tsx`

- [ ] **Step 8.1: Add CategoryChips to each list screen**

For each screen:
1. Compute the list of distinct categories from the loaded items (client-side, single pass).
2. Render `<CategoryChips>` above the items grid/list.
3. Track active filter in local state (default 'all').
4. Filter the displayed items by active category.

For `FriendListScreen`, when category is non-null, call `useFriendList(friendId, category)` (or filter client-side from the already-loaded list — pick whichever is simpler given how the existing hook is structured).

- [ ] **Step 8.2: Compose with existing sortMode / viewMode (PR #33/#36)**

Be careful: if `sortMode` is something other than `priority`, the existing sectioned UI flips to flat. Category filter composes WITH whatever sort+view is active — it just narrows the visible set.

If sort=priority AND category filter active, sections still render but only show items matching the filter. Sections with zero matching items should hide.

- [ ] **Step 8.3: Tests**

Add a test per screen asserting:
- All chip shows full list.
- Click "Кухня" chip → only kitchen items.
- Compose with sort=price → flat order, only kitchen items.

```bash
cd /Users/edouard/dev/wishlist/app && npm test -- MyListScreen FriendListScreen PublicListScreen
```

- [ ] **Step 8.4: Commit**

```bash
git add app/src/screens/MyListScreen.tsx app/src/screens/FriendListScreen.tsx \
        app/src/screens/PublicListScreen.tsx
git commit -m "feat(lists): CategoryChips filter on MyList / Friend / Public lists

Adds the chip-row above each list. Composes with the existing sort
and view-mode toggles. Counts computed client-side from loaded items.
'Все' chip resets; per-category chip filters; 'Без категории' chip
shows null-category items.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 9 — InviteFromPeopleModal source swap (group_members → useFriends)

**Files:**
- Modify: `app/src/components/InviteFromPeopleModal.tsx`

Currently sources from "people you've crossed paths with" via `get_my_people` RPC or similar (driven by group_members). After this PR, source becomes `useFriends`.

- [ ] **Step 9.1: Read existing modal**

```bash
cat /Users/edouard/dev/wishlist/app/src/components/InviteFromPeopleModal.tsx
```

- [ ] **Step 9.2: Swap source**

Replace whatever hook it uses with `useFriends()`. Keep the rest of the modal — the per-row UI and the parent's invite-flow integration are unchanged.

- [ ] **Step 9.3: Test**

The existing tests for events that use this modal should still pass:

```bash
cd /Users/edouard/dev/wishlist/app && npm test -- InviteFromPeopleModal CreateEventScreen EventDetailScreen
```

- [ ] **Step 9.4: Commit**

```bash
git add app/src/components/InviteFromPeopleModal.tsx
git commit -m "refactor(events): InviteFromPeopleModal source friends instead of groups

The modal's external behaviour is unchanged — it still shows a list
of suggested people to invite as event participants. Internal source
swapped from group_members heuristic to useFriends().

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 10 — Landing copy + Settings cleanup + /groups redirect

**Files:**
- Modify: `app/src/screens/LandingScreen.tsx`
- Modify: `app/src/screens/SettingsScreen.tsx`
- Modify: `app/src/Router.tsx`

- [ ] **Step 10.1: Landing copy**

Replace feature card 3 (currently "поделись ссылкой") with the "доски" card per the spec. Update body copy of card 1 (крысиные стаи) per Task 2's i18n keys. The two unchanged cards (тайный санта, бумажный вайб) stay.

Verify the prerendered route still builds:
```bash
cd /Users/edouard/dev/wishlist/app && npm run build
```

- [ ] **Step 10.2: Settings cleanup**

Read `SettingsScreen.tsx`. If there's a link "Manage groups" or similar, remove it. If there's any other groups-related entry, mark it for PR 3 cleanup (don't remove yet — PR 3 will drop GroupsScreen entirely).

- [ ] **Step 10.3: `/groups` → `/people` redirect**

```tsx
// app/src/Router.tsx
<Route path="/groups" element={<Navigate to="/people" replace />} />
```

Remove (or comment out for PR 3) the lazy import of `GroupsScreen`. Keep it for PR 3 — frontend doesn't reference it anymore via routing, but the file remains.

- [ ] **Step 10.4: Commit**

```bash
git add app/src/screens/LandingScreen.tsx app/src/screens/SettingsScreen.tsx \
        app/src/Router.tsx
git commit -m "feat(landing+nav): replace 'поделись ссылкой' with 'доски', /groups → /people

- LandingScreen feature card 3 now describes Pinterest-style boards.
- SettingsScreen drops 'manage groups' link (the screen itself remains
  on disk until PR 3 for safety).
- Router redirects /groups → /people, preserving the URL for users
  who bookmarked it.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 11 — Final validation + smoke + PR

- [ ] **Step 11.1: All tests**

```bash
cd /Users/edouard/dev/wishlist/app && npm test 2>&1 | tail -10
cd /Users/edouard/dev/wishlist/supabase/tests/integration && npm test 2>&1 | tail -10
cd /Users/edouard/dev/wishlist/app && npm run test:edge 2>&1 | tail -5
```
Expected: all green.

- [ ] **Step 11.2: tsc + lint + build**

```bash
cd /Users/edouard/dev/wishlist/app && npx tsc -b && npm run lint && npm run build 2>&1 | tail -10
```
Expected: clean, prerendered pages generated.

- [ ] **Step 11.3: Manual smoke in incognito**

```bash
cd /Users/edouard/dev/wishlist/app && npm run dev
```

Open http://localhost:5173 in incognito. Walk through:
1. Sign up (krysa@example.com is the local test user, or use a new email).
2. Land on `/people` (empty state).
3. Click "+ Добавить" → modal opens with two paths.
4. Email path: type `test@example.com` → submit → check Mailpit at http://localhost:54424 → click magic link → expect `/friend-invite/<token>` → "Принять" → redirect to `/p/<friend>`.
5. Copy `/add-me/<token>` from the same modal → open in another incognito tab → sign up → expect AddMeScreen → "Подружиться" → redirect.
6. Add an item with category="Кухня", visibility=friends → MyList shows chip "Кухня (1)".
7. Filter by "Кухня" — only that item visible.
8. Open `/p/<friend>` — see their friends-tier items, not their private items.
9. Old `/groups` URL → redirects to `/people`.
10. Unfriend from kebab — confirm dialog — disappears from list.

If any of the above breaks, STOP and report which step.

- [ ] **Step 11.4: Push**

```bash
cd /Users/edouard/dev/wishlist
git push -u origin feat/friend-graph-pr2-frontend
```

- [ ] **Step 11.5: Open PR**

```bash
gh pr create --title "feat(ui): friend graph + categories — PR 2 (frontend switchover)" --body "$(cat <<'EOF'
## Summary

PR 2 of the circles → friend graph + categories redesign. Frontend switches from the legacy circles UX to the new mutual friend graph (with both email-invite and add-me-link paths), per-item visibility (private/friends/public), and Pinterest-style freeform categories. Old `/groups` URL redirects to `/people`.

**Spec:** `docs/superpowers/specs/2026-05-27-friend-graph-categories-design.md`
**Plan:** `docs/superpowers/plans/2026-05-27-friend-graph-pr2-frontend.md`

## What lands

- New hooks: `useFriends` (list/unfriend/realtime), `useFriendInvites` (pending sent invites)
- New components: `AddFriendModal` (email + add-me-link side-by-side), `VisibilitySelector`, `CategoryInput` (with autocomplete), `CategoryChips` (filter row)
- New screens: `FriendsScreen` (renamed from PeopleScreen), `AddMeScreen` (route `/add-me/:token`), `AcceptFriendInviteScreen` (route `/friend-invite/:token`)
- Item form: visibility selector + category input replace the old circles multi-select
- Lists: CategoryChips above MyList/FriendList/PublicList, composes with sort + view-mode
- Landing: feature 3 ("поделись ссылкой") becomes "доски"; feature 1 body updated
- Settings: drop "manage groups" link
- Router: `/groups` redirects to `/people`
- `InviteFromPeopleModal` source swapped to `useFriends`
- `lib/errors.ts` extended with the 12 new error codes from PR 1

## What does NOT change

- Events flow — `event_participants` still drives event audience
- Schema — all backend work landed in PR 1
- Old GroupsScreen file is still on disk (PR 3 will delete it)

## Test plan

- [x] Frontend tests pass (X / Y)
- [x] Integration tests still pass (no schema changes, no regressions)
- [x] Edge function tests pass
- [x] tsc + lint + build clean
- [x] Manual smoke in incognito on local — full friend-invite + add-me + add-item-with-category flow

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

---

## Self-Review

After completing all tasks, before pushing:

- **Scope check.** No backend changes (no migrations, no SQL). Only `app/src/` + i18n.
- **Visibility default = 'friends'** on every new item creation path.
- **Old circles writes gone.** Search for `item_groups` writes in the frontend: `grep -rn "item_groups" app/src/`. Should return zero or only read-only references (e.g., types).
- **i18n parity.** Every new key present in BOTH `ru.ts` AND `en.ts` (tsc enforces structural conformance via the `Translation` type — if it compiles, you're good).
- **Existing tests still pass.** No regressions in claims-privacy, event flow, santa flow, share-page flow.
- **`/groups` redirect works** (manual: navigate to `/groups`, expect URL to become `/people` and the FriendsScreen to render).
- **Add-me link rotation** invalidates previous URLs — open old link in incognito after rotate, expect "ссылка больше не действительна".
