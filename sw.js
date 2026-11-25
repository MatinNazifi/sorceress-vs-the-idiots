/* sw.js - beta pages only (registered from beta-b*.html). Caches the art, clips and sounds so every visit after the first one downloads nothing.
   Freshness: sprites-manifest.json (path -> content hash, written by make_sw_manifest.py on every deploy) is fetched first on each page load; any cached file whose hash changed is dropped,
   so a new build never shows old art. Pages themselves (html) are never cached here. */
const CACHE = 'sorceress-assets-v1', MANI = 'sprites-manifest.json', STORED = '/__stored_manifest__';
let manifestReady = null;
function syncManifest() {
  const ac = new AbortController(); setTimeout(() => ac.abort(), 4000);   // never hang on a slow link
  return fetch(MANI, { cache: 'no-cache', signal: ac.signal }).then(r => r.ok ? r.json() : null).then(async m => {
    if (!m) return;
    const c = await caches.open(CACHE), old = await c.match(STORED).then(r => r ? r.json() : {}).catch(() => ({}));
    for (const p in old) if (old[p] !== m[p]) await c.delete(new URL(p, self.registration.scope).href, { ignoreSearch: true });
    await c.put(STORED, new Response(JSON.stringify(m)));
  }).catch(() => {});
}
self.addEventListener('install', e => { self.skipWaiting(); });
self.addEventListener('activate', e => { e.waitUntil(self.clients.claim()); });
self.addEventListener('message', e => { if (e.data === 'sync') manifestReady = syncManifest(); });
self.addEventListener('fetch', e => {
  const req = e.request, u = new URL(req.url);
  if (req.method !== 'GET' || u.origin !== location.origin || !/\/(sprites|audio)\//.test(u.pathname) || req.headers.has('range')) return;
  e.respondWith((async () => { try {
    if (!manifestReady) manifestReady = syncManifest();
    await Promise.race([manifestReady, new Promise(r => setTimeout(r, 1500))]);   // a slow link must not stall the art: after 1.5 s serve what is cached
    const c = await caches.open(CACHE), hit = await c.match(req, { ignoreSearch: true });
    if (hit) return hit;
    const r = await fetch(req);
    if (r.status === 200) c.put(req, r.clone()).catch(() => {});
    return r;
  } catch (err) { return fetch(req); } })());   // any cache problem: just go to the network
});
