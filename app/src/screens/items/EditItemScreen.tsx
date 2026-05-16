/**
 * `EditItemScreen` — `/i/:itemId/edit`. Full-screen edit form for one
 * of the caller's own items. Mirrors AddItemScreen's chrome, only the
 * eyebrow and h1 swap to "edit" copy and ItemForm is seeded from the
 * existing item.
 *
 * Bounces home if the id doesn't resolve to one of the caller's items
 * — we don't currently let people edit items they don't own.
 */
import { Navigate, useNavigate, useParams } from 'react-router-dom';
import { useI18n } from '../../i18n/useI18n';
import { useMyItems } from '../../items/useMyItems';
import { useGroups } from '../../groups/useGroups';
import { useToast } from '../../components/Toast';
import { PaperLayout } from '../../components/PaperLayout';
import { ItemForm } from './ItemForm';

export function EditItemScreen() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const toast = useToast();
  const { itemId = '' } = useParams<{ itemId: string }>();
  const { query, updateItem } = useMyItems();
  const { query: groupsQ } = useGroups();
  const groups = groupsQ.status === 'ready' ? groupsQ.groups : [];

  if (query.status === 'loading') {
    return (
      <PaperLayout>
        <div className="mono-meta" style={{ color: 'var(--ink-3)' }}>
          …
        </div>
      </PaperLayout>
    );
  }
  if (query.status === 'error') {
    return (
      <PaperLayout>
        <p style={{ color: 'var(--accent-deep)' }}>{query.error}</p>
      </PaperLayout>
    );
  }
  if (query.status !== 'ready') return null;

  const item = query.items.find((i) => i.id === itemId);
  // Not in the caller's list — either the item doesn't exist or it
  // belongs to someone else (in which case there's no edit affordance
  // for the caller). Redirect to home rather than render a 404 inside
  // this screen; the user came here via the edit button, not a typed URL.
  if (!item) return <Navigate to="/" replace />;

  return (
    <PaperLayout>
      <header style={{ marginBottom: 'var(--s-5)' }}>
        <div className="mono-meta" style={{ marginBottom: 'var(--s-2)' }}>
          {t('add.editEyebrow')}
        </div>
        <h2
          className="display-italic"
          style={{
            fontSize: 'var(--display-l)',
            margin: 0,
            lineHeight: 1.05,
            letterSpacing: -1,
            whiteSpace: 'pre-line',
          }}
        >
          {t('add.editTitle')}
        </h2>
        <p
          className="marginalia"
          style={{
            marginTop: 'var(--s-2)',
            fontSize: 17,
            color: 'var(--accent)',
            transform: 'rotate(-1.5deg)',
            display: 'inline-block',
          }}
        >
          {t('add.editSub')}
        </p>
      </header>

      <hr style={{ border: 0, borderTop: '1px solid var(--hair)', margin: '0 0 var(--s-5)' }} />

      <ItemForm
        initial={item}
        groups={groups}
        onSubmit={async (input) => {
          const result = await updateItem(item.id, input);
          if ('item' in result) {
            toast.show(t('item.savedToast'));
            navigate(`/i/${item.id}`, { replace: true });
          }
          return result;
        }}
        onCancel={() => navigate(`/i/${item.id}`)}
        submitLabel={t('add.saveChanges')}
      />
    </PaperLayout>
  );
}
