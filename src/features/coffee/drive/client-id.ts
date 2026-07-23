// PORTABLE — copy verbatim. The OAuth client id is public and injected at build time. Empty when
// unset → the whole Drive feature is inert/hidden, so a build without it (e.g. a demo deploy, or CI)
// is unaffected. Set NEXT_PUBLIC_GOOGLE_CLIENT_ID in .env.local (dev) and the Vercel project env
// (prod, then redeploy — it's inlined at build time).
export const GOOGLE_CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID ?? '';

export function isDriveConfigured(): boolean {
  return GOOGLE_CLIENT_ID !== '';
}
