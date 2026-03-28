// sw.js — StackMatch Service Worker

const CACHE = 'stackmatch-v1';

const PRECACHE = [
  '/',
  '/index.html',
  '/css/style.css',
  '/js/app.js',
  '/js/supabase.js',
  '/js/state.js',
  '/js/swipe.js',
  '/manifest.json',
];

// Install: cache core shell
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(PRECACHE))
  );
  self.skipWaiting();
});

// Activate: clear old caches
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Fetch: shell-first for navigation, network-first for API
self.addEventListener('fetch', e => {
  const { request } = e;
  const url = new URL(request.url);

  // Let Supabase API calls go straight to network
  if (url.hostname.includes('supabase.co') || url.hostname.includes('supabase.io')) {
    return;
  }

  // esm.sh imports - network only
  if (url.hostname === 'esm.sh') return;

  // Navigation: serve shell from cache
  if (request.mode === 'navigate') {
    e.respondWith(
      caches.match('/index.html').then(r => r || fetch(request))
    );
    return;
  }

  // Static assets: cache first
  e.respondWith(
    caches.match(request).then(cached => {
      if (cached) return cached;
      return fetch(request).then(response => {
        if (response.ok && request.method === 'GET') {
          const clone = response.clone();
          caches.open(CACHE).then(c => c.put(request, clone));
        }
        return response;
      }).catch(() => caches.match('/index.html'));
    })
  );
});
