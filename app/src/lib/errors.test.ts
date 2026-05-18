import { describe, it, expect } from 'vitest';
import { errorCode, errorMessage } from './errors';

describe('errorCode', () => {
  describe('SQLSTATE-driven', () => {
    it('23514 + items_title_check → titleTooLong', () => {
      expect(errorCode({ code: '23514', message: 'violates items_title_check' }))
        .toBe('titleTooLong');
    });
    it('23514 + profiles_handle_format → handleInvalidFormat', () => {
      expect(errorCode({ code: '23514', message: 'violates profiles_handle_format' }))
        .toBe('handleInvalidFormat');
    });
    it('23514 fallthrough → generic', () => {
      expect(errorCode({ code: '23514', message: 'some other check' })).toBe('generic');
    });
    it('23505 + profiles_handle_key → handleTaken', () => {
      expect(errorCode({ code: '23505', message: 'duplicate key value violates unique constraint "profiles_handle_key"' }))
        .toBe('handleTaken');
    });
    it('23505 generic → duplicate', () => {
      expect(errorCode({ code: '23505', message: 'duplicate key' })).toBe('duplicate');
    });
    it('23503 → foreignKey', () => {
      expect(errorCode({ code: '23503', message: 'fk violation' })).toBe('foreignKey');
    });
    it('42501 → permissionDenied', () => {
      expect(errorCode({ code: '42501', message: 'rls denial' })).toBe('permissionDenied');
    });
  });

  describe('RAISE EXCEPTION (P0001)', () => {
    it.each([
      ['invite_not_found',     'inviteNotFound'],
      ['invite_expired',       'inviteExpired'],
      ['invite_already_used',  'inviteUsed'],
      ['last_admin',           'lastAdmin'],
      ['sole_admin_of_groups', 'soleAdminGroups'],
      ['too_few_participants', 'santaTooFew'],
      ['no_valid_assignment',  'santaNoValid'],
      ['wrong_status',         'santaWrongStatus'],
      ['not_organiser',        'santaNotOrganiser'],
      ['not_organizer',        'santaNotOrganiser'],
      ['cannot_reveal',        'santaCannotReveal'],
      ['display_name_required','displayNameRequired'],
    ] as const)('%s → %s', (msg, expected) => {
      expect(errorCode({ code: 'P0001', message: msg })).toBe(expected);
    });
  });

  describe('message-fragment fallback (no SQLSTATE)', () => {
    it.each([
      ['blocked_host',         'urlNotAllowed'],
      ['private_address',      'urlNotAllowed'],
      ['too_many_redirects',   'urlNotAllowed'],
      ['unsupported_protocol', 'urlNotAllowed'],
      ['file_too_large',       'photoTooLarge'],
      ['unsupported_type',     'photoBadType'],
      ['Failed to fetch',      'network'],
      ['NetworkError',         'network'],
      ['not authenticated',    'notAuthenticated'],
      ['row-level security',   'permissionDenied'],
      ['items_title_check',    'titleTooLong'],
      ['profiles_handle_format','handleInvalidFormat'],
    ] as const)('%s → %s', (msg, expected) => {
      expect(errorCode({ message: msg })).toBe(expected);
    });
  });

  describe('fallthrough', () => {
    it('null → generic', () => {
      expect(errorCode(null)).toBe('generic');
    });
    it('undefined → generic', () => {
      expect(errorCode(undefined)).toBe('generic');
    });
    it('empty string → generic', () => {
      expect(errorCode('')).toBe('generic');
    });
    it('unknown SQLSTATE → generic', () => {
      expect(errorCode({ code: '99999', message: 'whatever' })).toBe('generic');
    });
    it('plain string err → matches via matchMessage', () => {
      expect(errorCode('invite_not_found')).toBe('inviteNotFound');
    });
    it('plain unknown string → generic', () => {
      expect(errorCode('random text we do not match')).toBe('generic');
    });
  });
});

describe('errorMessage', () => {
  it('returns localized string via t (using mapped code)', () => {
    const t = (k: string) => `[${k}]`;
    expect(errorMessage(t, { code: '42501' })).toBe('[errors.permissionDenied]');
  });

  it('routes generic for null', () => {
    const t = (k: string) => `[${k}]`;
    expect(errorMessage(t, null)).toBe('[errors.generic]');
  });
});
