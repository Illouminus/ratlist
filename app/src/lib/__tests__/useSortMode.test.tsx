import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useSortMode } from '../useSortMode';

beforeEach(() => {
  localStorage.clear();
});

describe('useSortMode', () => {
  it("defaults to 'priority' on first run", () => {
    const { result } = renderHook(() => useSortMode());
    expect(result.current[0]).toBe('priority');
  });

  it('returns the persisted value when present', () => {
    localStorage.setItem('kryska.sortMode', 'price');
    const { result } = renderHook(() => useSortMode());
    expect(result.current[0]).toBe('price');
  });

  it('persists updates to localStorage', () => {
    const { result } = renderHook(() => useSortMode());
    act(() => result.current[1]('category'));
    expect(localStorage.getItem('kryska.sortMode')).toBe('category');
    expect(result.current[0]).toBe('category');
  });

  it("falls back to 'priority' for unknown stored values", () => {
    localStorage.setItem('kryska.sortMode', 'random-garbage');
    const { result } = renderHook(() => useSortMode());
    expect(result.current[0]).toBe('priority');
  });
});
