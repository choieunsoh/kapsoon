import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  deleteFile,
  findOrCreateFolder,
  isOwnedFolder,
  listBackups,
  uploadBackup,
} from './drive-api';

const files = (list: { id: string; name: string }[]) =>
  new Response(JSON.stringify({ files: list }), { status: 200 });

// The Drive query (q=) of the n-th fetch call, decoded.
function queryOf(fetchMock: ReturnType<typeof vi.fn>, n: number): string {
  const url = new URL(String(fetchMock.mock.calls[n]?.[0]));
  return url.searchParams.get('q') ?? '';
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('Drive lookups are bound to the signed-in owner', () => {
  it('finds the backup folder only among folders the user owns', async () => {
    const fetchMock = vi.fn().mockResolvedValue(files([{ id: 'mine', name: 'Kapsoon Backups' }]));
    vi.stubGlobal('fetch', fetchMock);

    expect(await findOrCreateFolder('tok', 'Kapsoon Backups')).toBe('mine');
    expect(queryOf(fetchMock, 0)).toContain("'me' in owners");
  });

  it('lists and upserts backups only among owned files', async () => {
    const fetchMock = vi.fn().mockImplementation(async () => files([]));
    vi.stubGlobal('fetch', fetchMock);

    await listBackups('tok', 'folder-1');
    await uploadBackup('tok', 'folder-1', 'backup-2026-10-29.txt', '{}');

    expect(queryOf(fetchMock, 0)).toContain("'me' in owners");
    expect(queryOf(fetchMock, 1)).toContain("'me' in owners");
  });

  it('trusts a stored folder id only while it is a live folder the user owns', async () => {
    const meta = (body: object, status = 200) => new Response(JSON.stringify(body), { status });
    const folder = 'application/vnd.google-apps.folder';
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(meta({ ownedByMe: true, trashed: false, mimeType: folder }))
      .mockResolvedValueOnce(meta({ ownedByMe: false, trashed: false, mimeType: folder }))
      .mockResolvedValueOnce(meta({ ownedByMe: true, trashed: true, mimeType: folder }))
      .mockResolvedValueOnce(meta({ ownedByMe: true, trashed: false, mimeType: 'text/plain' }))
      .mockResolvedValueOnce(meta({ error: 'notFound' }, 404))
      .mockResolvedValueOnce(meta({ error: 'unauthorized' }, 401));
    vi.stubGlobal('fetch', fetchMock);

    expect(await isOwnedFolder('tok', 'mine')).toBe(true);
    expect(await isOwnedFolder('tok', 'shared-in')).toBe(false);
    expect(await isOwnedFolder('tok', 'trashed')).toBe(false);
    expect(await isOwnedFolder('tok', 'a-file')).toBe(false);
    expect(await isOwnedFolder('tok', 'gone')).toBe(false);
    await expect(isOwnedFolder('tok', 'x')).rejects.toThrow('401');
  });

  it('escapes ids in queries and paths', async () => {
    const fetchMock = vi.fn().mockImplementation(async () => files([]));
    vi.stubGlobal('fetch', fetchMock);

    await listBackups('tok', "x' or name contains '");
    await deleteFile('tok', '../about');

    expect(queryOf(fetchMock, 0)).toContain("'x\\' or name contains \\'' in parents");
    expect(String(fetchMock.mock.calls[1]?.[0])).toBe(
      'https://www.googleapis.com/drive/v3/files/..%2Fabout',
    );
  });
});
