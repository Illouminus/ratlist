import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { DndContext } from '@dnd-kit/core';
import { SortableContext } from '@dnd-kit/sortable';
import { SortableItemRow } from '../SortableItemRow';

function renderInDnd(ui: React.ReactNode, ids: string[]) {
  return render(
    <DndContext>
      <SortableContext items={ids}>{ui}</SortableContext>
    </DndContext>,
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

  it('marks the row with role and aria attributes for keyboard a11y', () => {
    renderInDnd(
      <SortableItemRow id="item-1">
        <div>row</div>
      </SortableItemRow>,
      ['item-1'],
    );
    const handle = screen.getByTestId('drag-handle');
    expect(handle.getAttribute('aria-label')).toBeTruthy();
    expect(handle.getAttribute('tabIndex')).not.toBeNull();
  });
});
