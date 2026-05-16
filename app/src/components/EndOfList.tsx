/**
 * `<EndOfList>` — the "that's the lot — for now." marker the design
 * places under every list. A short italic line, a thin rule that fills
 * remaining space, and a tail-doodle on the right. A small but
 * surprisingly satisfying detail.
 */
import { useI18n } from '../i18n/useI18n';
import { TailDoodle } from './rats';

export function EndOfList() {
  const { t } = useI18n();
  return (
    <div
      style={{
        marginTop: 'var(--s-5)',
        paddingTop: 'var(--s-4)',
        paddingBottom: 'var(--s-2)',
        display: 'flex',
        alignItems: 'center',
        gap: 'var(--s-3)',
      }}
    >
      <span
        className="display-italic"
        style={{ fontSize: 14, color: 'var(--ink-3)', whiteSpace: 'nowrap' }}
      >
        {t('list.thatsTheLot')}
      </span>
      <span style={{ flex: 1, height: 1, background: 'var(--hair)' }} />
      <TailDoodle size={22} />
    </div>
  );
}
