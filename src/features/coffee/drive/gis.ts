'use client';

// PORTABLE — copy verbatim. Lazy bridge to Google Identity Services. The GIS script is injected on
// first use only — never on the app's critical path. requestToken wraps the callback-based token
// client in a promise.
//
// Silent (interactive: false) uses prompt: '' — succeeds only while the user's Google session is alive
// and consent already granted; otherwise it rejects and the caller degrades to needsReconnect. The
// interactive path (prompt: 'consent') is used from the Connect / Back-up-now taps.
//
// Requires devDependency: @types/google.accounts  (provides the global `google` namespace type)
//
// THE popup fix: the token model opens a fresh auth flow (a popup / account chooser) on EVERY
// requestAccessToken call — no refresh token, and the issued token is never kept. So prompt:'' alone
// does NOT remove the popup (it only changes consent→chooser). Access tokens live ~1h though, so we
// CACHE the token with its expiry and reuse it. A call within the token's life makes ZERO GIS calls
// and shows NO popup, across reloads and app reopens. This is what actually kills "popup every backup".

import { GOOGLE_CLIENT_ID } from './client-id';
import { DRIVE_SCOPE } from './sync-decision';

const GIS_SRC = 'https://accounts.google.com/gsi/client';
let loading: Promise<void> | null = null;

// Cached access token, in-memory + mirrored to localStorage so a reload / app reopen within the
// token's ~1h life reuses it instead of popping the account chooser again.
// ponytail: an access token in localStorage is a bounded exposure — drive.file scope, ~1h TTL,
// single-user app. Downgrade to sessionStorage for a smaller window (at the cost of a cold-open popup).
type CachedToken = { token: string; expiresAt: number };
const TOKEN_KEY = 'kapsoon-drive-token';
const EXPIRY_MARGIN_S = 300; // treat a token as dead 5 min early so a call never starts on a stale one
let tokenMemo: CachedToken | null = null;

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

// expires_in is typed string by @types/google.accounts but arrives as a number; Number() takes both.
function storeCachedToken(token: string, expiresIn: string | number | undefined): void {
  const secs = Number(expiresIn);
  if (!Number.isFinite(secs) || secs <= 0) return;
  tokenMemo = { token, expiresAt: Date.now() + Math.max(0, secs - EXPIRY_MARGIN_S) * 1000 };
  if (typeof window === 'undefined') return;
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

// Best-effort revocation of the Google grant, for "Disconnect". Only a currently-valid access token can
// revoke the grant, so we revoke the cached one when we hold it; if none is valid we skip rather than
// pop a dialog just to fetch a token (disconnect must never prompt). The local cache is cleared either
// way. WITHOUT this, "Disconnect" only forgets the grant locally — the app could still mint tokens
// silently until the user revokes it by hand in their Google account. Wire it into disconnect.
export async function revokeAccess(): Promise<void> {
  const token = validCachedToken();
  clearToken();
  if (token === null) return;
  await loadGis().catch(() => undefined);
  if (typeof google === 'undefined' || google.accounts?.oauth2 === undefined) return;
  await new Promise<void>((resolve) => {
    google.accounts.oauth2.revoke(token, () => resolve());
  });
}

function loadGis(): Promise<void> {
  if (loading !== null) return loading;
  const attempt = new Promise<void>((resolve, reject) => {
    if (typeof document === 'undefined') {
      reject(new Error('no document'));
      return;
    }
    if (document.querySelector(`script[src="${GIS_SRC}"]`) !== null) {
      resolve();
      return;
    }
    const script = document.createElement('script');
    script.src = GIS_SRC;
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('failed to load Google Identity Services'));
    document.head.appendChild(script);
  });
  loading = attempt.catch((err: unknown) => {
    loading = null; // let the next call retry a failed load
    throw err;
  });
  return loading;
}

async function requestTokenRaw(prompt: '' | 'consent'): Promise<string> {
  await loadGis();
  if (typeof google === 'undefined' || google.accounts?.oauth2 === undefined) {
    throw new Error('Google Identity Services unavailable');
  }
  return new Promise<string>((resolve, reject) => {
    const client = google.accounts.oauth2.initTokenClient({
      client_id: GOOGLE_CLIENT_ID,
      scope: DRIVE_SCOPE,
      callback: (resp) => {
        if (resp.access_token !== undefined && resp.access_token !== '') {
          storeCachedToken(resp.access_token, resp.expires_in);
          resolve(resp.access_token);
        } else reject(new Error(resp.error ?? 'no access token'));
      },
      error_callback: (err) => reject(new Error(err.type)),
    });
    client.requestAccessToken({ prompt });
  });
}

// CRITICAL — do NOT pass prompt:'consent' unconditionally on the interactive path. That forces the
// full Google consent screen on EVERY tap ("login every time before backup"). The documented fix:
// try prompt:'' first (reuses an existing grant with NO account chooser or consent dialog), and fall
// back to prompt:'consent' ONLY when silent fails AND the call is user-initiated. The auto/background
// path (interactive:false) stays silent-only — it must never pop a dialog.
// ponytail: assumes GIS surfaces a silent-prompt failure via callback/error_callback (it does — both
// are wired). If a silent request is ever seen to hang, wrap the first await in a timeout.
export async function requestToken(opts: { interactive: boolean }): Promise<string> {
  const cached = validCachedToken();
  if (cached !== null) return cached; // no GIS call, no popup — the whole point
  try {
    return await requestTokenRaw('');
  } catch (err) {
    if (!opts.interactive) throw err;
    return requestTokenRaw('consent');
  }
}
