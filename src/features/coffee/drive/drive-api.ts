// PORTABLE — copy verbatim. Thin wrappers over the Drive REST v3 API. Given an access token, do one
// thing each. No app logic — the pure decisions live in sync-decision.ts. JSON responses are narrowed
// via `unknown` + guards (no `as`, no `any`). `uploadBackup` upserts by name so a same-day re-backup
// replaces the day's file.

import type { DriveFile } from './sync-decision';

const API = 'https://www.googleapis.com/drive/v3';
const UPLOAD = 'https://www.googleapis.com/upload/drive/v3';
const FOLDER_MIME = 'application/vnd.google-apps.folder';

async function driveFetch(token: string, url: string, init: RequestInit): Promise<Response> {
  const res = await fetch(url, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, ...init.headers },
  });
  if (!res.ok) throw new Error(`Drive request failed: ${res.status}`);
  return res;
}

// Escape a value for use inside a Drive query string literal (the q= parameter, e.g. name='...').
// Per the Drive API you backslash-escape a backslash and a single quote. Keeps the query injection-safe
// if a name ever becomes user-controlled (a stray ' would break out and alter which files list/delete).
function escapeQuery(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

function readId(body: unknown): string {
  if (typeof body === 'object' && body !== null && 'id' in body && typeof body.id === 'string') {
    return body.id;
  }
  throw new Error('Drive response missing id');
}

function isUnknownArray(value: unknown): value is unknown[] {
  return Array.isArray(value);
}

function readFiles(body: unknown): DriveFile[] {
  if (typeof body !== 'object' || body === null || !('files' in body)) return [];
  const files = body.files;
  if (!isUnknownArray(files)) return [];
  const out: DriveFile[] = [];
  for (const f of files) {
    if (
      typeof f === 'object' &&
      f !== null &&
      'id' in f &&
      'name' in f &&
      typeof f.id === 'string' &&
      typeof f.name === 'string'
    ) {
      out.push({ id: f.id, name: f.name });
    }
  }
  return out;
}

// `'me' in owners` binds every lookup to the signed-in user's own files: a same-named folder (or
// backup) someone else shares in must never become the upload target or a restore/prune candidate.
const OWNED = "'me' in owners and trashed=false";

export async function findOrCreateFolder(token: string, name: string): Promise<string> {
  const q = encodeURIComponent(
    `name='${escapeQuery(name)}' and mimeType='${FOLDER_MIME}' and ${OWNED}`,
  );
  const listed = await driveFetch(token, `${API}/files?q=${q}&spaces=drive&fields=files(id,name)`, {
    method: 'GET',
  });
  const existing = readFiles(await listed.json());
  if (existing.length > 0 && existing[0] !== undefined) return existing[0].id;

  const created = await driveFetch(token, `${API}/files?fields=id`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, mimeType: FOLDER_MIME }),
  });
  return readId(await created.json());
}

export async function listBackups(token: string, folderId: string): Promise<DriveFile[]> {
  const q = encodeURIComponent(`'${escapeQuery(folderId)}' in parents and ${OWNED}`);
  const res = await driveFetch(
    token,
    `${API}/files?q=${q}&orderBy=name desc&fields=files(id,name)`,
    { method: 'GET' },
  );
  return readFiles(await res.json());
}

export async function uploadBackup(
  token: string,
  folderId: string,
  name: string,
  text: string,
): Promise<void> {
  // One file per day: if today's file exists, replace its media; otherwise create a new one.
  const q = encodeURIComponent(
    `name='${escapeQuery(name)}' and '${escapeQuery(folderId)}' in parents and ${OWNED}`,
  );
  const found = await driveFetch(token, `${API}/files?q=${q}&fields=files(id,name)`, {
    method: 'GET',
  });
  const existing = readFiles(await found.json());

  if (existing.length > 0 && existing[0] !== undefined) {
    await driveFetch(
      token,
      `${UPLOAD}/files/${encodeURIComponent(existing[0].id)}?uploadType=media`,
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'text/plain' },
        body: text,
      },
    );
    return;
  }

  const boundary = 'backup-boundary';
  const body =
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n` +
    JSON.stringify({ name, parents: [folderId] }) +
    `\r\n--${boundary}\r\nContent-Type: text/plain\r\n\r\n` +
    text +
    `\r\n--${boundary}--`;
  await driveFetch(token, `${UPLOAD}/files?uploadType=multipart&fields=id`, {
    method: 'POST',
    headers: { 'Content-Type': `multipart/related; boundary=${boundary}` },
    body,
  });
}

export async function downloadFile(token: string, fileId: string): Promise<string> {
  const res = await driveFetch(token, `${API}/files/${encodeURIComponent(fileId)}?alt=media`, {
    method: 'GET',
  });
  return res.text();
}

export async function deleteFile(token: string, fileId: string): Promise<void> {
  await driveFetch(token, `${API}/files/${encodeURIComponent(fileId)}`, { method: 'DELETE' });
}
