import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    // แคปซูล read the Thai way — Thai has no syllable-final /l/, so the borrowed L lands as /n/.
    name: 'Kapsoon',
    short_name: 'Kapsoon',
    start_url: '/',
    display: 'standalone',
    // Match --color-bg / the viewport themeColor so the splash screen and status bar don't flash a
    // different dark than the app itself.
    background_color: '#101114',
    theme_color: '#101114',
    icons: [
      { src: '/icon.svg', sizes: 'any', type: 'image/svg+xml' },
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
      // Android crops icons to its own shape; `maskable` tells it the art already has safe padding
      // (the capsule occupies the middle ~54%), so it crops the tile instead of clipping the mark.
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}
