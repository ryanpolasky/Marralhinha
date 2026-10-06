/* eslint-disable no-restricted-globals */
import { clientsClaim } from 'workbox-core';
import { precacheAndRoute, createHandlerBoundToURL } from 'workbox-precaching';
import { registerRoute } from 'workbox-routing';
import { CacheFirst, StaleWhileRevalidate } from 'workbox-strategies';
import { ExpirationPlugin } from 'workbox-expiration';

clientsClaim();
precacheAndRoute(self.__WB_MANIFEST);

const SERVER_PATHS = /^\/(api|socket\.io|health|terms|privacy|how-to-play|sitemap\.xml|robots\.txt)(\/|$)/;
const HAS_EXTENSION = /[^/?]+\.[^/]+$/;

registerRoute(({ request, url }) => request.mode === 'navigate' && !SERVER_PATHS.test(url.pathname) && !HAS_EXTENSION.test(url.pathname), createHandlerBoundToURL('/index.html'));

registerRoute(
  ({ url }) => url.origin === self.location.origin && /^\/(audio|emotes|screenshots)\//.test(url.pathname),
  new CacheFirst({ cacheName: 'media', plugins: [new ExpirationPlugin({ maxEntries: 120, maxAgeSeconds: 60 * 60 * 24 * 60 })] })
);

registerRoute(
  ({ url }) => url.origin === self.location.origin && /\.(png|svg|ico|webp|jpg)$/.test(url.pathname),
  new StaleWhileRevalidate({ cacheName: 'images', plugins: [new ExpirationPlugin({ maxEntries: 60 })] })
);

self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting();
});
