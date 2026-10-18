// PORTABLE — pure half of the OAuth 2.0 implicit (redirect) flow: build the authorize URL, parse the
// #fragment Google redirects back with. No DOM, no storage — testable with literals.
//
// Why redirect and not the GIS popup: the app must be cross-origin isolated (COOP: same-origin) for
// SQLocal's OPFS VFS. COOP severs the opener↔popup link, so a GIS popup reports itself closed the moment
// it opens and never delivers the token. A full-page redirect has no opener to sever.

const AUTH_ENDPOINT = 'https://accounts.google.com/o/oauth2/v2/auth';

export function authUrl(p: {
  clientId: string;
  redirectUri: string;
  scope: string;
  state: string;
}): string {
  const q = new URLSearchParams({
    client_id: p.clientId,
    redirect_uri: p.redirectUri,
    response_type: 'token',
    scope: p.scope,
    state: p.state,
    include_granted_scopes: 'true',
  });
  return `${AUTH_ENDPOINT}?${q.toString()}`;
}

export type RedirectResult =
  | { kind: 'token'; token: string; expiresIn: number }
  | { kind: 'error'; error: string };

// null = the fragment isn't an OAuth response at all (normal page load). A response whose state doesn't
// match the one we stored is rejected (CSRF / stale tab), as is one where the user unticked the scope on
// Google's granular-consent screen.
export function parseRedirect(
  hash: string,
  expectedState: string | null,
  scope: string,
): RedirectResult | null {
  const q = new URLSearchParams(hash.startsWith('#') ? hash.slice(1) : hash);
  const token = q.get('access_token');
  const error = q.get('error');
  if (token === null && error === null) return null;
  if (expectedState === null || q.get('state') !== expectedState) {
    return { kind: 'error', error: 'state_mismatch' };
  }
  if (error !== null) return { kind: 'error', error };
  const granted = (q.get('scope') ?? '').split(' ');
  if (!granted.includes(scope)) return { kind: 'error', error: 'scope_not_granted' };
  const expiresIn = Number(q.get('expires_in'));
  if (token === null || token === '' || !Number.isFinite(expiresIn) || expiresIn <= 0) {
    return { kind: 'error', error: 'malformed_response' };
  }
  return { kind: 'token', token, expiresIn };
}
