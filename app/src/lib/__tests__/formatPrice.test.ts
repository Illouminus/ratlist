import { describe, it, expect } from 'vitest';
import { formatPrice } from '../formatPrice';

describe('formatPrice', () => {
  it('normalizes €NN.NN with dot decimal → €NN,NN', () => {
    expect(formatPrice('€109.00')).toBe('€109,00');
    expect(formatPrice('€22.99')).toBe('€22,99');
  });

  it('keeps €NN,NN with comma decimal as-is (re-normalised)', () => {
    expect(formatPrice('€22,99')).toBe('€22,99');
    expect(formatPrice('€109,00')).toBe('€109,00');
  });

  it('pads bare integers to two decimals', () => {
    expect(formatPrice('€39')).toBe('€39,00');
    expect(formatPrice('EUR 109')).toBe('€109,00');
  });

  it('handles "NN.NN EUR" and "EUR NN.NN" forms', () => {
    expect(formatPrice('109.00 EUR')).toBe('€109,00');
    expect(formatPrice('EUR 22,99')).toBe('€22,99');
  });

  it('passes through non-EUR currencies unchanged', () => {
    expect(formatPrice('$54')).toBe('$54');
    expect(formatPrice('600₽')).toBe('600₽');
    expect(formatPrice('£40.50')).toBe('£40.50');
    expect(formatPrice('50 USD')).toBe('50 USD');
    expect(formatPrice('rub 600')).toBe('rub 600');
  });

  it('treats bare numbers as EUR by default', () => {
    // Most of the app's audience is in the eurozone and friends were
    // typing amounts like "50" expecting them to render as "€50,00".
    expect(formatPrice('54')).toBe('€54,00');
    expect(formatPrice('180')).toBe('€180,00');
    expect(formatPrice('22.99')).toBe('€22,99');
    expect(formatPrice('22,99')).toBe('€22,99');
  });

  it('passes through free-text inputs we can\'t safely interpret', () => {
    expect(formatPrice('approx 60')).toBe('approx 60');
    expect(formatPrice('70 - 80')).toBe('70 - 80');
    expect(formatPrice('5 штук')).toBe('5 штук');
    expect(formatPrice('пиздец дорого')).toBe('пиздец дорого');
  });

  it('returns empty string for null / empty input', () => {
    expect(formatPrice(null)).toBe('');
    expect(formatPrice(undefined)).toBe('');
    expect(formatPrice('')).toBe('');
    expect(formatPrice('   ')).toBe('');
  });

  it('handles whitespace between symbol and number', () => {
    expect(formatPrice('€ 109')).toBe('€109,00');
    expect(formatPrice('  €109.00  ')).toBe('€109,00');
  });
});
