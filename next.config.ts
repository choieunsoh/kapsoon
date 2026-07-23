import type { NextConfig } from 'next';
import withSerwistInit from '@serwist/next';

// SQLocal persists to OPFS, which requires the document to be cross-origin isolated. Serve the
// COOP/COEP header pair on every route so `crossOriginIsolated === true` at runtime. Everything
// this app loads (JS, CSS, self-hosted next/font, sw.js, wasm) is same-origin, so `require-corp`
// doesn't block any subresource; the Serwist SW and offline shell keep working. If a future
// cross-origin embed is added, switch COEP to `credentialless` (or add CORP to that resource).
const config: NextConfig = {
  // @serwist/next attaches a `webpack` config (used only by `next build --webpack` to emit sw.js).
  // Next 16's Turbopack dev server errors on a webpack config unless Turbopack is also configured —
  // an empty object is enough to silence it. Dev runs under Turbopack with Serwist disabled (see
  // below), so there's nothing to configure here.
  turbopack: {},
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'Cross-Origin-Embedder-Policy', value: 'require-corp' },
          { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
        ],
      },
    ];
  },
};

// @serwist/next is a webpack plugin. Next 16 defaults to Turbopack, which does not run it —
// so `npm run build` uses `next build --webpack` to emit public/sw.js, and the plugin is
// disabled in dev (Turbopack) to keep `next dev` clean. See CLAUDE.md for the tradeoff.
//
// `disable` only stops Serwist from EMITTING the worker; it can't stop Next from SERVING one. A
// public/sw.js left behind by an earlier `npm run build` is a static file, so `next dev` hands it
// out at /sw.js and it precaches the dev HTML — the app then hydrates fresh JS against stale cached
// markup and React reports a mismatch on whatever changed since. Hence the `predev` script, which
// deletes the built worker before every `next dev`.
const withSerwist = withSerwistInit({
  swSrc: 'src/app/sw.ts',
  swDest: 'public/sw.js',
  disable: process.env.NODE_ENV !== 'production',
});

export default withSerwist(config);
