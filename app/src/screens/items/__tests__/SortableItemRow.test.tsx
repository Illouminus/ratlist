import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { DndContext } from '@dnd-kit/core';
import { SortableContext } from '@dnd-kit/sortable';
import { I18nProvider } from '../../../i18n';
import { SortableItemRow } from '../SortableItemRow';

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem('kryska.lang', 'ru');
});

function renderInDnd(ui: React.ReactNode, ids: string[]) {
  return render(
    <I18nProvider>
      <DndContext>
        <SortableContext items={ids}>{ui}</SortableContext>
      </DndContext>
    </I18nProvider>,
  );
}

describe('<SortableItemRow>', () => {
  it('renders its children', () => {
    renderInDnd(
      <SortableItemRow id="item-1">
        <div>hello row</div>
      </SortableItemRow>,
      ['item-1'],
    );
    expect(screen.getByText('hello row')).toBeTruthy();
  });

  it('exposes a drag handle as a data attribute', () => {
    renderInDnd(
      <SortableItemRow id="item-1">
        <div>row body</div>
      </SortableItemRow>,
      ['item-1'],
    );
    expect(screen.getByTestId('drag-handle')).toBeTruthy();
  });

  it('marks the row outer wrapper with role and aria attributes for keyboard a11y', () => {
    renderInDnd(
      <SortableItemRow id="item-1">
        <div>row</div>
      </SortableItemRow>,
      ['item-1'],
    );
    // After the row-activator refactor, the OUTER wrapper holds the
    // sortable listeners + aria-label, not the decorative ⋮⋮ span.
    // The visual span is aria-hidden and pointer-events:none so it doesn't
    // interfere with touches on the row body.
    const row = screen.getByLabelText('Перетащи чтобы изменить приоритет');
    expect(row.getAttribute('tabIndex')).not.toBeNull();
    expect(row.getAttribute('role')).toBe('button');

    // Decorative handle is still rendered but is now aria-hidden and
    // non-interactive (no event handlers, no aria-label).
    const handle = screen.getByTestId('drag-handle');
    expect(handle.getAttribute('aria-hidden')).toBe('true');
    expect(handle.getAttribute('aria-label')).toBeNull();
  });
});
