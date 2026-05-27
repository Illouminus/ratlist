import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useViewMode } from '../useViewMode';

beforeEach(() => {
  localStorage.clear();
});

describe('useViewMode', () => {
  it('returns the persisted value when present', () => {
    localStorage.setItem('kryska.viewMode', 'list');
    const { result } = renderHook(() => useViewMode());
    expect(result.current[0]).toBe('list');
  });

  it('persists updates to localStorage', () => {
    const { result } = renderHook(() => useViewMode());
    act(() => result.current[1]('list'));
    expect(localStorage.getItem('kryska.viewMode')).toBe('list');
    expect(result.current[0]).toBe('list');
  });

  it("defaults to 'grid' on a desktop-sized viewport without a stored value", () => {
    // jsdom default width is 1024, well above the 768 breakpoint.
    expect(window.innerWidth).toBeGreaterThanOrEqual(768);
    const { result } = renderHook(() => useViewMode());
    expect(result.current[0]).toBe('grid');
  });

  it("defaults to 'list' on a mobile-sized viewport without a stored value", () => {
    const original = window.innerWidth;
    Object.defineProperty(window, 'innerWidth', {
      configurable: true,
      value: 375,
    });
    try {
      const { result } = renderHook(() => useViewMode());
      expect(result.current[0]).toBe('list');
    } finally {
      Object.defineProperty(window, 'innerWidth', {
        configurable: true,
        value: original,
      });
    }
  });

  it('ignores corrupted localStorage values and falls back to the viewport default', () => {
    localStorage.setItem('kryska.viewMode', 'garbage');
    const { result } = renderHook(() => useViewMode());
    expect(['grid', 'list']).toContain(result.current[0]);
  });
});
