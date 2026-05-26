import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { I18nProvider } from '../../../i18n';
import { ItemList } from '../ItemList';
import type { MyItem } from '../../../items/useMyItems';

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem('kryska.lang', 'ru');
});

function mkItem(overrides: Partial<MyItem> & { id: string }): MyItem {
  return {
    id: overrides.id,
    owner_id: 'user-1',
    title: overrides.title ?? `Item ${overrides.id}`,
    maker: null,
    url: null,
    price_text: null,
    occasion: 'anytime',
    priority: overrides.priority ?? 2,
    status: 'open',
    note: null,
    cover_url: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    group_ids: [],
    event_ids: [],
    ...overrides,
  } as MyItem;
}

function renderList(node: React.ReactNode) {
  return render(
    <MemoryRouter>
      <I18nProvider>{node}</I18nProvider>
    </MemoryRouter>,
  );
}

describe('<ItemList mode>', () => {
  const items: MyItem[] = [
    mkItem({ id: 'a', priority: 1, title: 'Книга' }),
    mkItem({ id: 'b', priority: 2, title: 'Кружка' }),
    mkItem({ id: 'c', priority: 3, title: 'Носки' }),
  ];

  it('mode="flat" renders items without section headers (current default behavior)', () => {
    renderList(<ItemList items={items} mode="flat" />);
    expect(screen.queryByText('Очень хочу')).toBeNull();
    expect(screen.getByText('Книга')).toBeTruthy();
    expect(screen.getByText('Кружка')).toBeTruthy();
    expect(screen.getByText('Носки')).toBeTruthy();
  });

  it('mode="sectioned" renders three section headers with the items grouped', () => {
    renderList(<ItemList items={items} mode="sectioned" />);
    expect(screen.getByText('Очень хочу')).toBeTruthy();
    expect(screen.getByText('Хочу')).toBeTruthy();
    expect(screen.getByText('Если найдётся')).toBeTruthy();
    expect(screen.getByText('Книга')).toBeTruthy();
  });

  it('mode="sectioned" with read-only data renders zero drag handles', () => {
    renderList(<ItemList items={items} mode="sectioned" />);
    expect(screen.queryAllByTestId('drag-handle')).toHaveLength(0);
  });

  it('mode="sectioned-dnd" renders a drag handle per item', () => {
    renderList(
      <ItemList items={items} mode="sectioned-dnd" onPriorityChange={vi.fn()} />,
    );
    expect(screen.queryAllByTestId('drag-handle')).toHaveLength(3);
  });

  it('mode="sectioned-dnd" hides empty section bodies but still shows headers (drop targets)', () => {
    const onlyMid: MyItem[] = [mkItem({ id: 'b', priority: 2, title: 'Кружка' })];
    renderList(
      <ItemList items={onlyMid} mode="sectioned-dnd" onPriorityChange={vi.fn()} />,
    );
    expect(screen.getByText('Очень хочу')).toBeTruthy();
    expect(screen.getByText('Хочу')).toBeTruthy();
    expect(screen.getByText('Если найдётся')).toBeTruthy();
    expect(screen.queryAllByText('здесь пусто — перетащи сюда что-то')).toHaveLength(2);
  });

  it('mode="sectioned" hides empty sections entirely (read-only)', () => {
    const onlyMid: MyItem[] = [mkItem({ id: 'b', priority: 2 })];
    renderList(<ItemList items={onlyMid} mode="sectioned" />);
    expect(screen.queryByText('Очень хочу')).toBeNull();
    expect(screen.getByText('Хочу')).toBeTruthy();
    expect(screen.queryByText('Если найдётся')).toBeNull();
  });
});
