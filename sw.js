/* Service Worker — مواقيت الصلاة v.29.2
 * الهدف: فتح التطبيق بدون إنترنت. لا يعترض إلا طلبات نفس الموقع (GET)،
 * أما api.aladhan.com وصورة الإعلان من GitHub فتمرّ مباشرة والتطبيق يحفظها في localStorage بنفسه.
 * ✏️ عند نشر نسخة جديدة من index.html غيّر رقم VERSION ليتحدّث الكاش عند المستخدمين. */
var VERSION = 'prayer-v29.2-1';
var CORE = [
  './',
  'index.html',
  'manifest.webmanifest',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/icon-maskable-512.png',
  'icons/apple-touch-icon.png',
  'icons/favicon-32.png'
];

self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(VERSION).then(function (c) { return c.addAll(CORE); }).then(function () { return self.skipWaiting(); }));
});

self.addEventListener('activate', function (e) {
  e.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.filter(function (k) { return k !== VERSION; }).map(function (k) { return caches.delete(k); }));
    }).then(function () { return self.clients.claim(); })
  );
});

function timeout(ms) { return new Promise(function (_, rej) { setTimeout(function () { rej(new Error('timeout')); }, ms); }); }

self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET') return;
  var url = new URL(req.url);
  if (url.origin !== self.location.origin) return;        // المواقيت والصور الخارجية: لا نتدخل

  if (req.mode === 'navigate') {
    // الصفحة: الشبكة أولاً (لالتقاط التحديثات) بمهلة 4 ثوانٍ ثم النسخة المحفوظة
    e.respondWith(
      Promise.race([fetch(req), timeout(4000)]).then(function (res) {
        if (res && res.ok) { var copy = res.clone(); caches.open(VERSION).then(function (c) { c.put('index.html', copy); }); }
        return res;
      }).catch(function () {
        return caches.match('index.html').then(function (r) { return r || caches.match('./'); });
      })
    );
    return;
  }

  // باقي الملفات (أيقونات…): من الكاش فوراً وتُحدَّث في الخلفية
  e.respondWith(
    caches.match(req).then(function (hit) {
      var net = fetch(req).then(function (res) {
        if (res && res.ok) { var copy = res.clone(); caches.open(VERSION).then(function (c) { c.put(req, copy); }); }
        return res;
      }).catch(function () { return hit; });
      return hit || net;
    })
  );
});
