import { defaultCache } from '@serwist/next/worker';
import type { PrecacheEntry, SerwistGlobalConfig } from 'serwist';
import { NetworkOnly, Serwist } from 'serwist';

// self.__SW_MANIFEST is injected by Serwist at build time. Type it via serwist's declaration
// instead of forcing with `as`/`!` (which the house style bans).
declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}

declare const self: ServiceWorkerGlobalScope;

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: true,
  // Google API traffic carries a bearer token and returns backup contents. defaultCache's catch-all
  // cross-origin NetworkFirst rule would store those responses (keyed by URL alone) in Cache Storage,
  // where they outlive Disconnect. Matched first, so it wins over defaultCache.
  runtimeCaching: [
    {
      matcher: ({ url }) => url.hostname.endsWith('.googleapis.com'),
      handler: new NetworkOnly(),
    },
    ...defaultCache,
  ],
});

serwist.addEventListeners();

// Workers before the NetworkOnly rule above stored Drive responses (backup contents) in defaultCache's
// 'cross-origin' cache. Nothing else writes there now (fonts are self-hosted), so its expiry never runs;
// drop it on activate.
self.addEventListener('activate', (event) => {
  event.waitUntil(caches.delete('cross-origin'));
});
