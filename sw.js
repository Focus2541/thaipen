// เปลี่ยนเลขเวอร์ชันทุกครั้งที่แก้ไฟล์ เพื่อให้มือถือโหลดของใหม่
const CACHE = 'thaipen-v1';
const FILES = ['./', './index.html', './engine.js', './coach.js', './app.js', './manifest.json', './icon-192.png', './icon-512.png', './icon-maskable.png', './apple-touch-icon.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
// มีเน็ตใช้ของใหม่ ไม่มีเน็ตใช้ของในแคช (รวมตัวช่วยหาคน MediaPipe ที่เคยโหลดแล้ว)
// ยกเว้นการถาม AI (Gemini) ไม่แคช
self.addEventListener('fetch', e => {
  const u = e.request.url;
  if (e.request.method !== 'GET' || !u.startsWith('http') || u.includes('generativelanguage.googleapis.com')) return;
  e.respondWith(
    fetch(e.request).then(r => {
      if (r && (r.ok || r.type === 'opaque')) { const copy = r.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)).catch(() => {}); }
      return r;
    }).catch(() => caches.match(e.request).then(r => r || (e.request.mode === 'navigate' ? caches.match('./index.html') : Response.error())))
  );
});
