/* Service Worker — مواقيت الصلاة v.29.3
 * الهدف: فتح التطبيق بدون إنترنت. لا يعترض إلا طلبات نفس الموقع (GET)،
 * أما api.aladhan.com وصورة الإعلان من GitHub فتمرّ مباشرة والتطبيق يحفظها في localStorage بنفسه.
 * ✏️ عند نشر نسخة جديدة من index.html غيّر رقم VERSION ليتحدّث الكاش عند المستخدمين. */
var VERSION = 'prayer-5ea6becc';
var WIDGET_CACHE = 'prayer-widget-data';   // بيانات المواقيت التي يحفظها التطبيق لتستخدمها الودجات
var CORE = [
  './',
  'index.html',
  'manifest.webmanifest',
  'widget.html',
  'widgets/next-template.json',
  'widgets/table-template.json',
  'widgets/date-template.json',
  'widgets/dhikr-template.json',
  'widgets/full-template.json',
  'widgets/data-placeholder.json',
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
      return Promise.all(keys.filter(function (k) { return k !== VERSION && k !== WIDGET_CACHE; }).map(function (k) { return caches.delete(k); }));
    }).then(function () { return self.clients.claim(); }).then(function () { return updateAllWidgets(); })
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


/* =====================================================================
 * 🧩 ودجات Windows 11 (PWA Widgets) — لوحة الودجات في ويندوز 11 فقط
 * تُحسب البيانات هنا من نسخة المواقيت التي يحفظها التطبيق في Cache ثم تُمرَّر لقالب Adaptive Card.
 * ✏️ لتعديل ما يظهر: عدّل buildWidgetData() أو ملفات widgets/*-template.json
 * ===================================================================== */
var W_NAMES = { Fajr: 'الفجر', Sunrise: 'الشروق', Dhuhr: 'الظهر', Asr: 'العصر', Maghrib: 'المغرب', Isha: 'العشاء' };
var W_ORDER = ['Fajr', 'Sunrise', 'Dhuhr', 'Asr', 'Maghrib', 'Isha'];
var W_DAYS = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
var W_DHIKR = [
  'سبحان الله وبحمده، سبحان الله العظيم', 'لا إله إلا الله وحده لا شريك له، له الملك وله الحمد وهو على كل شيء قدير',
  'لا حول ولا قوة إلا بالله', 'أستغفر الله وأتوب إليه', 'اللهم صلِّ وسلِّم على نبينا محمد',
  '{أَلَا بِذِكْرِ اللَّهِ تَطْمَئِنُّ الْقُلُوبُ}', '{فَاذْكُرُونِي أَذْكُرْكُمْ}', '{إِنَّ اللَّهَ مَعَ الصَّابِرِينَ}',
  '{وَقُل رَّبِّ زِدْنِي عِلْمًا}', 'الحمد لله حمداً كثيراً طيباً مباركاً فيه'
];

function wPad(n) { return (n < 10 ? '0' : '') + n; }
function wTime(d) { var h = d.getHours(); return wPad(h % 12 || 12) + ':' + wPad(d.getMinutes()) + ' ' + (h >= 12 ? 'م' : 'ص'); }

function readWidgetConfig() {
  return caches.open(WIDGET_CACHE).then(function (c) { return c.match('widget-config.json'); })
    .then(function (r) { return r ? r.json() : null; }).catch(function () { return null; });
}

function buildWidgetData(cfg, now) {
  now = now || new Date();
  var mon = cfg && cfg.data && cfg.data[String(now.getMonth() + 1)];
  var day = mon && mon[now.getDate() - 1];
  if (!day || !day.timings) return null;
  var off = (cfg.adhan) || {}, fri = now.getDay() === 5, ev = [], i;
  for (i = 0; i < W_ORDER.length; i++) {
    var k = W_ORDER[i], m = /^(\d{1,2}):(\d{2})/.exec(String(day.timings[k] || ''));
    if (!m) return null;
    var o = Number(off[k]) || 0;
    ev.push({ k: k, name: (k === 'Dhuhr' && fri) ? 'الجمعة' : W_NAMES[k], at: new Date(now.getFullYear(), now.getMonth(), now.getDate(), +m[1], +m[2] + o, 0) });
  }
  var nx = null;
  for (i = 0; i < ev.length; i++) if (ev[i].at > now) { nx = ev[i]; break; }
  var nextName, nextTime;
  if (nx) { nextName = nx.name; nextTime = wTime(nx.at); }
  else {   // بعد العشاء: الفجر غداً (من بيانات الغد إن توفرت)
    var tm = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
    var mon2 = cfg.data[String(tm.getMonth() + 1)], d2 = mon2 && mon2[tm.getDate() - 1];
    var f = d2 && d2.timings && /^(\d{1,2}):(\d{2})/.exec(String(d2.timings.Fajr || ''));
    nextName = 'الفجر'; nextTime = f ? wTime(new Date(tm.getFullYear(), tm.getMonth(), tm.getDate(), +f[1], +f[2] + (Number(off.Fajr) || 0), 0)) + ' (غداً)' : '—';
  }
  var h = (day.date && day.date.hijri) || {}, hm = (h.month && h.month.ar) || '';
  var dateG; try { dateG = new Intl.DateTimeFormat('ar-SA-u-ca-gregory-nu-latn', { day: 'numeric', month: 'long', year: 'numeric' }).format(now); } catch (e) { dateG = now.toDateString(); }
  var slot = Math.floor(now.getTime() / 3600000) % W_DHIKR.length;
  return {
    city: cfg.cityAr || '', dayName: W_DAYS[now.getDay()], dateG: dateG,
    dateH: h.day + ' ' + hm + ' ' + h.year + ' هـ', dayH: String(h.day), monthH: hm, yearH: h.year + ' هـ',
    nextName: nextName, nextTime: nextTime, dhikr: W_DHIKR[slot],
    rows: ev.map(function (e) { return { name: e.name, time: wTime(e.at), isNext: !!(nx && e.k === nx.k), past: e.at <= now && !(nx && e.k === nx.k) }; })
  };
}

function renderWidget(widget) {
  var def = widget.definition;
  return Promise.all([
    fetch(def.msAcTemplate).then(function (r) { return r.text(); }),
    readWidgetConfig()
  ]).then(function (res) {
    var data = buildWidgetData(res[1]);
    var dataP = data ? Promise.resolve(JSON.stringify(data)) : fetch(def.data).then(function (r) { return r.text(); });   // لا بيانات بعد: قيم تجريبية
    return dataP.then(function (txt) { return self.widgets.updateByTag(def.tag, { template: res[0], data: txt }); });
  });
}
function updateAllWidgets() {
  if (!self.widgets) return Promise.resolve();
  return self.widgets.matchAll().then(function (list) {
    return Promise.all(list.filter(function (w) { return w.installed !== false && w.instances && w.instances.length; }).map(function (w) { return renderWidget(w).catch(function () {}); }));
  }).catch(function () {});
}

self.addEventListener('widgetinstall', function (e) {
  e.waitUntil((function () {
    var def = e.widget.definition, p = renderWidget(e.widget);
    if (self.registration.periodicSync && def.update) {
      p = p.then(function () { return self.registration.periodicSync.register(def.tag, { minInterval: def.update }); }).catch(function () {});
    }
    return p;
  })());
});
self.addEventListener('widgetresume', function (e) { e.waitUntil(renderWidget(e.widget).catch(function () {})); });
self.addEventListener('widgetuninstall', function (e) {
  e.waitUntil((self.registration.periodicSync && e.widget.instances && e.widget.instances.length <= 1)
    ? self.registration.periodicSync.unregister(e.widget.definition.tag).catch(function () {}) : Promise.resolve());
});
self.addEventListener('periodicsync', function (e) {
  if (!self.widgets) return;
  e.waitUntil(self.widgets.getByTag(e.tag).then(function (w) { return w ? renderWidget(w) : null; }).catch(function () {}));
});
self.addEventListener('widgetclick', function (e) {
  if (e.action === 'open') e.waitUntil(self.clients.openWindow('./index.html'));
});
