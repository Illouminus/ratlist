/**
 * `AddItemScreen` — `/add`. Full-screen form for creating a new item,
 * matching the v2 mockup "03 · Add item":
 *
 *   eyebrow ("new item · drafting")
 *   italic h1 "что зацепило?" / "what caught your eye?"
 *   Caveat sub  "just the basics — you can fix it later"
 *   hairline
 *   ItemForm
 *
 * On successful save we navigate straight to the detail page of the
 * freshly-created item — feels closer to "you just made a thing" than
 * dumping the user back at the list with no follow-through.
 */
import { useNavigate } from 'react-router-dom';
import { useI18n } from '../../i18n/useI18n';
import { useMyItems } from '../../items/useMyItems';
import { useGroups } from '../../groups/useGroups';
import { useToast } from '../../components/Toast';
import { PaperLayout } from '../../components/PaperLayout';
import { ItemForm } from './ItemForm';

export function AddItemScreen() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const toast = useToast();
  const { createItem } = useMyItems();
  const { query: groupsQ } = useGroups();
  const groups = groupsQ.status === 'ready' ? groupsQ.groups : [];

  return (
    <PaperLayout>
      <header style={{ marginBottom: 'var(--s-5)' }}>
        <div className="mono-meta" style={{ marginBottom: 'var(--s-2)' }}>
          {t('add.eyebrow')}
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
          {t('add.title')}
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
          {t('add.sub')}
        </p>
      </header>

      <hr style={{ border: 0, borderTop: '1px solid var(--hair)', margin: '0 0 var(--s-5)' }} />

      <ItemForm
        groups={groups}
        onSubmit={async (input) => {
          const result = await createItem(input);
          if ('item' in result) {
            toast.show(t('item.createdToast'));
            navigate(`/i/${result.item.id}`, { replace: true });
          }
          return result;
        }}
        onCancel={() => navigate('/')}
      />
    </PaperLayout>
  );
}
