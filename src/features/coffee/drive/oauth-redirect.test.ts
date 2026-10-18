import { describe, expect, it } from 'vitest';
import { authUrl, parseRedirect } from './oauth-redirect';

const SCOPE = 'https://www.googleapis.com/auth/drive.file';
const ok = (extra = '') =>
  `#state=s1&access_token=tok&token_type=Bearer&expires_in=3599&scope=${encodeURIComponent(SCOPE)}${extra}`;

describe('authUrl', () => {
  it('requests an implicit-flow token for the given client, redirect and state', () => {
    const u = new URL(
      authUrl({ clientId: 'cid', redirectUri: 'https://app.test', scope: SCOPE, state: 's1' }),
    );
    expect(u.origin + u.pathname).toBe('https://accounts.google.com/o/oauth2/v2/auth');
    expect(u.searchParams.get('response_type')).toBe('token');
    expect(u.searchParams.get('client_id')).toBe('cid');
    expect(u.searchParams.get('redirect_uri')).toBe('https://app.test');
    expect(u.searchParams.get('scope')).toBe(SCOPE);
    expect(u.searchParams.get('state')).toBe('s1');
  });
});

describe('parseRedirect', () => {
  it('ignores fragments that are not an OAuth response', () => {
    expect(parseRedirect('', 's1', SCOPE)).toBeNull();
    expect(parseRedirect('#section', 's1', SCOPE)).toBeNull();
  });

  it('returns the token on a matching state with the scope granted', () => {
    expect(parseRedirect(ok(), 's1', SCOPE)).toEqual({
      kind: 'token',
      token: 'tok',
      expiresIn: 3599,
    });
  });

  it('rejects a mismatched or missing state', () => {
    expect(parseRedirect(ok(), 'other', SCOPE)).toEqual({ kind: 'error', error: 'state_mismatch' });
    expect(parseRedirect(ok(), null, SCOPE)).toEqual({ kind: 'error', error: 'state_mismatch' });
  });

  it('surfaces a Google error such as a denied consent', () => {
    expect(parseRedirect('#error=access_denied&state=s1', 's1', SCOPE)).toEqual({
      kind: 'error',
      error: 'access_denied',
    });
  });

  it('rejects a token issued without the Drive scope (unticked on granular consent)', () => {
    const hash = '#state=s1&access_token=tok&expires_in=3599&scope=openid';
    expect(parseRedirect(hash, 's1', SCOPE)).toEqual({ kind: 'error', error: 'scope_not_granted' });
  });

  it('rejects a response without a usable expiry', () => {
    const hash = `#state=s1&access_token=tok&scope=${encodeURIComponent(SCOPE)}`;
    expect(parseRedirect(hash, 's1', SCOPE)).toEqual({
      kind: 'error',
      error: 'malformed_response',
    });
  });
});
