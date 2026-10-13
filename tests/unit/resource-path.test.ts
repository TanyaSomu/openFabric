import { describe, it, expect } from 'vitest';
import { mapMethodToAction, normalizeResourcePath } from '../../src/utils/resource-path';

describe('Resource Path Normalization & HTTP Method Mapping', () => {
  describe('mapMethodToAction', () => {
    it('maps GET to read', () => {
      expect(mapMethodToAction('GET')).toBe('read');
      expect(mapMethodToAction('get')).toBe('read');
    });

    it('maps POST, PUT, PATCH to write', () => {
      expect(mapMethodToAction('POST')).toBe('write');
      expect(mapMethodToAction('post')).toBe('write');
      expect(mapMethodToAction('PUT')).toBe('write');
      expect(mapMethodToAction('put')).toBe('write');
      expect(mapMethodToAction('PATCH')).toBe('write');
      expect(mapMethodToAction('patch')).toBe('write');
    });

    it('maps DELETE to delete', () => {
      expect(mapMethodToAction('DELETE')).toBe('delete');
      expect(mapMethodToAction('delete')).toBe('delete');
    });

    it('rejects unsupported HTTP methods', () => {
      expect(() => mapMethodToAction('OPTIONS')).toThrow(/Unsupported HTTP method/);
      expect(() => mapMethodToAction('HEAD')).toThrow(/Unsupported HTTP method/);
      expect(() => mapMethodToAction('TRACE')).toThrow(/Unsupported HTTP method/);
      expect(() => mapMethodToAction('CONNECT')).toThrow(/Unsupported HTTP method/);
      expect(() => mapMethodToAction('')).toThrow(/non-empty string/);
    });
  });

  describe('normalizeResourcePath', () => {
    it('normalizes clean paths', () => {
      expect(normalizeResourcePath('transactions')).toBe('transactions');
      expect(normalizeResourcePath('/transactions')).toBe('transactions');
      expect(normalizeResourcePath('/wallets/wallet-789/transactions')).toBe(
        'wallets/wallet-789/transactions',
      );
    });

    it('trims leading and trailing slashes', () => {
      expect(normalizeResourcePath('/wallets/wallet-789/')).toBe('wallets/wallet-789');
      expect(normalizeResourcePath('///wallets///wallet-789///')).toBe('wallets/wallet-789');
    });

    it('collapses repeated consecutive slashes', () => {
      expect(normalizeResourcePath('wallets///wallet-789///transactions')).toBe(
        'wallets/wallet-789/transactions',
      );
    });

    it('strips query parameters and url fragments', () => {
      expect(normalizeResourcePath('/wallets/wallet-789?limit=10&page=2')).toBe(
        'wallets/wallet-789',
      );
      expect(normalizeResourcePath('/wallets/wallet-789#section-1')).toBe('wallets/wallet-789');
      expect(normalizeResourcePath('/wallets/wallet-789?filter=active#hash')).toBe(
        'wallets/wallet-789',
      );
    });

    it('decodes url-encoded path segments safely', () => {
      expect(normalizeResourcePath('/wallets/wallet%2D789')).toBe('wallets/wallet-789');
      expect(normalizeResourcePath('/accounts/john%40example.com')).toBe(
        'accounts/john@example.com',
      );
    });

    it('rejects directory traversal attempts', () => {
      expect(() => normalizeResourcePath('/wallets/../accounts')).toThrow(
        /Directory traversal pattern detected/,
      );
      expect(() => normalizeResourcePath('/wallets/./transactions')).toThrow(
        /Directory traversal pattern detected/,
      );
      expect(() => normalizeResourcePath('/wallets/%2e%2e/accounts')).toThrow(
        /Directory traversal pattern detected/,
      );
    });

    it('rejects null bytes', () => {
      expect(() => normalizeResourcePath('/wallets/wallet\0-789')).toThrow(
        /forbidden null byte characters/,
      );
    });

    it('rejects empty or root-only paths', () => {
      expect(() => normalizeResourcePath('')).toThrow(/cannot be empty/);
      expect(() => normalizeResourcePath('   ')).toThrow(/cannot be empty/);
      expect(() => normalizeResourcePath('/')).toThrow(
        /must contain at least one valid resource identifier/,
      );
      expect(() => normalizeResourcePath('///')).toThrow(
        /must contain at least one valid resource identifier/,
      );
    });

    it('rejects malformed url encodings', () => {
      expect(() => normalizeResourcePath('/wallets/%E0%A4%A')).toThrow(
        /Malformed URL-encoded segment/,
      );
    });
  });
});
