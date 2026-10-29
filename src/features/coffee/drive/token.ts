'use client';

// Google access tokens via the OAuth implicit REDIRECT flow (see oauth-redirect.ts for why not the GIS
// popup). No refresh token exists, so the issued token is CACHED with its expiry (~1h) and reused: a call
// within its life makes zero network calls and never leaves the page, across reloads and app reopens.
//
// Interactive requests navigate the whole page to Google and back; the pending action ("resume") rides
// along in sessionStorage with the CSRF state, and consumeAuthRedirect() picks it up on the next mount.
// Non-interactive requests never navigate — without a cached token they reject, and the caller degrades
// to needsReconnect.

import { GOOGLE_CLIENT_ID } from './client-id';
import { DRIVE_SCOPE } from './sync-decision';
import { authUrl, parseRedirect } from './oauth-redirect';

// Cached access token, in-memory + mirrored to localStorage so a reload / app reopen within the
// token's ~1h life reuses it instead of redirecting to Google again.
// ponytail: an access token in localStorage is a bounded exposure — drive.file scope, ~1h TTL,
// single-user app. Downgrade to sessionStorage for a smaller window (at the cost of a cold-open redirect).
type CachedToken = { token: string; expiresAt: number };
const TOKEN_KEY = 'kapsoon-drive-token';
const PENDING_KEY = 'kapsoon-drive-auth-pending';
const EXPIRY_MARGIN_S = 300; // treat a token as dead 5 min early so a call never starts on a stale one
let tokenMemo: CachedToken | null = null;

// What to finish after Google redirects back. null = just keep the token (the user re-taps).
export type Resume = 'connect' | 'backup' | null;
type Pending = { state: string; resume: Resume };

function loadCachedToken(): CachedToken | null {
  if (tokenMemo !== null) return tokenMemo;
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(TOKEN_KEY);
    if (raw === null) return null;
    const p: unknown = JSON.parse(raw);
    if (
      typeof p === 'object' &&
      p !== null &&
      'token' in p &&
      'expiresAt' in p &&
      typeof p.token === 'string' &&
      typeof p.expiresAt === 'number'
    ) {
      tokenMemo = { token: p.token, expiresAt: p.expiresAt };
      return tokenMemo;
    }
  } catch {
    // corrupt cache → fetch fresh
  }
  return null;
}

function validCachedToken(): string | null {
  const c = loadCachedToken();
  return c !== null && c.expiresAt > Date.now() ? c.token : null;
}

function storeCachedToken(token: string, expiresInS: number): void {
  tokenMemo = { token, expiresAt: Date.now() + Math.max(0, expiresInS - EXPIRY_MARGIN_S) * 1000 };
  try {
    localStorage.setItem(TOKEN_KEY, JSON.stringify(tokenMemo));
  } catch {
    // storage blocked — in-memory cache still serves this page
  }
}

// Drop the cached token — call this from disconnect (alongside clearConnection()).
export function clearToken(): void {
  tokenMemo = null;
  if (typeof window !== 'undefined') localStorage.removeItem(TOKEN_KEY);
}

// A Disconnect in another tab removes the stored token; drop this tab's in-memory copy with it so it
// can't keep using a token the user just revoked. (key === null is localStorage.clear().)
if (typeof window !== 'undefined') {
  window.addEventListener('storage', (e) => {
    if ((e.key === TOKEN_KEY || e.key === null) && e.newValue === null) tokenMemo = null;
  });
}

// Best-effort revocation of the Google grant, for "Disconnect". Revoke whatever token is cached — NOT
// only one validCachedToken() accepts: that check expires tokens EXPIRY_MARGIN_S early, so a token in
// its last minutes is still live at Google and would leave the grant standing. A truly expired token
// just fails the revoke, which is swallowed. With no cached token we skip rather than redirect just to
// fetch one (disconnect must never prompt). The local cache is cleared either way.
export async function revokeAccess(): Promise<void> {
  const token = loadCachedToken()?.token ?? null;
  clearToken();
  if (token === null) return;
  await fetch('https://oauth2.googleapis.com/revoke', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ token }),
  }).catch(() => undefined);
}

function readPending(): Pending | null {
  try {
    const raw = sessionStorage.getItem(PENDING_KEY);
    if (raw === null) return null;
    const p: unknown = JSON.parse(raw);
    if (
      typeof p === 'object' &&
      p !== null &&
      'state' in p &&
      'resume' in p &&
      typeof p.state === 'string' &&
      (p.resume === 'connect' || p.resume === 'backup' || p.resume === null)
    ) {
      return { state: p.state, resume: p.resume };
    }
  } catch {
    // corrupt → treat as no pending request
  }
  return null;
}

// Leaves the page. The returned promise never settles — the document is being replaced.
function redirectToGoogle(resume: Resume): Promise<never> {
  const pending: Pending = { state: crypto.randomUUID(), resume };
  sessionStorage.setItem(PENDING_KEY, JSON.stringify(pending));
  window.location.assign(
    authUrl({
      clientId: GOOGLE_CLIENT_ID,
      redirectUri: window.location.origin, // must be listed under Authorized redirect URIs
      scope: DRIVE_SCOPE,
      state: pending.state,
    }),
  );
  return new Promise<never>(() => undefined);
}

// Call once on app mount. Returns null on a normal load; otherwise caches the token (or reports the
// error) and strips the #fragment so the token never lingers in the address bar or history.
export function consumeAuthRedirect(): { resume: Resume } | { error: string } | null {
  if (typeof window === 'undefined') return null;
  const pending = readPending();
  const result = parseRedirect(window.location.hash, pending?.state ?? null, DRIVE_SCOPE);
  if (result === null) return null;
  sessionStorage.removeItem(PENDING_KEY);
  history.replaceState(null, '', window.location.pathname + window.location.search);
  // This tab never started a sign-in, so the fragment came from someone else's link (or a stale
  // tab). Strip it and ignore it — reporting an error here would let any cross-site link flag the
  // connection needsReconnect and skip an auto-backup.
  if (pending === null) return null;
  if (result.kind === 'error') return { error: result.error };
  storeCachedToken(result.token, result.expiresIn);
  return { resume: pending.resume };
}

export async function requestToken(opts: {
  interactive: boolean;
  resume?: Resume;
}): Promise<string> {
  const cached = validCachedToken();
  if (cached !== null) return cached; // no network, no redirect — the whole point
  if (!opts.interactive) throw new Error('no valid token; interactive sign-in required');
  return redirectToGoogle(opts.resume ?? null);
}
