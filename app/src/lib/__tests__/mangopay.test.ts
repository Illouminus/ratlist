import { describe, it, expect, vi, beforeEach } from 'vitest';
import { submitCardToMangopay, MANGOPAY_HOST } from '../mangopay';

describe('mangopay browser helper', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('uses sandbox host by default', () => {
    expect(MANGOPAY_HOST).toContain('sandbox.mangopay.com');
  });

  it('posts card details to the CardRegistrationURL and returns the registration data', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      text: async () => 'data=abc123',
    } as Response);

    const result = await submitCardToMangopay(
      {
        cardRegistrationId: 'reg-1',
        preregistrationData: 'pre-data',
        accessKey: 'ak-1',
        cardRegistrationUrl: 'https://homologation.payline.com/...',
      },
      '4970100000000154',  // sandbox test card
      '1230',
      '123',
    );

    expect(result).toBe('data=abc123');
    expect(global.fetch).toHaveBeenCalledWith(
      'https://homologation.payline.com/...',
      expect.objectContaining({
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      }),
    );
  });

  it('throws when Mangopay returns an error response', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      text: async () => 'errorCode=09101&errorMessage=Invalid card number',
    } as Response);

    await expect(
      submitCardToMangopay(
        {
          cardRegistrationId: 'reg-1',
          preregistrationData: 'pre',
          accessKey: 'ak',
          cardRegistrationUrl: 'https://x',
        },
        'invalid',
        '0000',
        '000',
      ),
    ).rejects.toThrow('mangopay_card_register_failed');
  });
});
