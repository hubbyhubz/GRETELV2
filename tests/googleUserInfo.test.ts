import { describe, expect, it } from 'vitest';
import { fetchGoogleUserInfo, getGoogleEmailStorageKey } from '../lib/googleUserInfo';

describe('googleUserInfo', () => {
  it('builds a stable localStorage key per user', () => {
    expect(getGoogleEmailStorageKey('abc')).toBe('gretel:googleEmail:abc');
  });

  it('returns null fields when access token is empty', async () => {
    const info = await fetchGoogleUserInfo('');
    expect(info).toEqual({ email: null, sub: null });
  });
});

