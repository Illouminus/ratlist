/**
 * `EventMemberListScreen` — `/events/:eventId/member/:userId`.
 *
 * Discovery surface: from inside an event a guest opens a co-participant's
 * SHARED wishlist (read via `get_coparticipant_list`, gated on
 * `shares_event_with`) and can copy an item they like into their own list.
 * Copy-only — no claim; claiming stays scoped to the honoree's list.
 */
import { Link, useParams } from 'react-router-dom';
import { PaperLayout } from '../../components/PaperLayout';
import { ListSkeleton } from '../../components/Skeleton';
import { useCoparticipantList } from '../../events/useCoparticipantList';
import { useMyItems } from '../../items/useMyItems';
import { useToast } from '../../components/useToast';
import { useI18n } from '../../i18n/useI18n';
import { errorMessage } from '../../lib/errors';
import type { Item } from '../../lib/db';
import { MemberItemTile } from './MemberItemTile';

export function EventMemberListScreen() {
  const { eventId, userId } = useParams<{ eventId: string; userId: string }>();
  const { t } = useI18n();
  const toast = useToast();
  const { query } = useCoparticipantList(userId ?? null);
  const { copyItem } = useMyItems();

  async function onCopy(item: Item): Promise<void> {
    const result = await copyItem(item);
    toast.show('error' in result ? errorMessage(t, result.error) : t('item.copiedToast'));
  }

  return (
    <PaperLayout>
      <Link
        to={`/events/${eventId}`}
        className="mono-meta"
        style={{
          color: 'var(--ink-3)',
          textDecoration: 'none',
          display: 'inline-block',
          marginBottom: 'var(--s-4)',
        }}
      >
        ← {t('member.backToEvent')}
      </Link>

      {query.status === 'loading' && <ListSkeleton rows={4} />}

      {query.status === 'error' && <p style={{ color: 'var(--ink-2)' }}>{t('errors.generic')}</p>}

      {query.status === 'ready' && (
        <>
          <h1 className="display-s" style={{ marginBottom: 'var(--s-5)' }}>
            {t('member.heading', { name: query.profile.display_name ?? '' })}
          </h1>

          {query.items.length === 0 ? (
            <p style={{ color: 'var(--ink-2)' }}>{t('member.empty')}</p>
          ) : (
            <ul
              className="curated-tiles-grid"
              style={{ listStyle: 'none', margin: 0, padding: 0 }}
            >
              {query.items.map((item) => (
                <li key={item.id}>
                  <MemberItemTile item={item} onCopy={() => void onCopy(item)} />
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </PaperLayout>
  );
}
