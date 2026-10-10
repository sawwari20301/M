/* ==========================================================================
   نادي مَتن — طبقة تشغيل الواجهة
   تعمل بالكامل في المتصفح (بلا خادم) وتحفظ البيانات في هذا الجهاز عبر
   localStorage. لا تُشارَك البيانات بين زوّار مختلفين أو أجهزة مختلفة.
   ========================================================================== */
(function () {
    'use strict';

    var KEY = 'matn_state_v2';
    var CLOUD = !!(window.MatnCloud && window.MatnCloud.configured());
    function cloudAr(e) {
        return (window.MatnCloud && window.MatnCloud.ar) ? window.MatnCloud.ar(e) : 'تعذّر إكمال العملية.';
    }

    /* الجلسة القادمة — مصدر واحد */
    var SESSION = {
        title: 'أمسية نقاش: ثلاثية غرناطة (رضوى عاشور)',
        when: 'السبت القادم • 7:30 مساءً',
        where: 'صالون مَتن - فرع الياسمين / Zoom VIP',
        facilitator: 'د. ياسر السليمان',
        seats: 6
    };

    /* ---------- الصلاحيات ---------- */
    var PERMS = [
        { key: 'salons', label: 'إدارة الصالونات' },
        { key: 'members', label: 'إدارة الأعضاء والصلاحيات' },
        { key: 'bookings', label: 'الحجوزات' },
        { key: 'partners', label: 'الشركاء' },
        { key: 'codes', label: 'قسائم الشحن' },
        { key: 'recording', label: 'التسجيل المرئي' }
    ];
    var ALL_PERMS = PERMS.map(function (p) { return p.key; });
    /* نوع المجلس */
    var MODES = [
        { key: 'in-person', label: 'حضوري في الفرع' },
        { key: 'online', label: 'عن بعد عبر Zoom' },
        { key: 'hybrid', label: 'حضوري وعن بعد' }
    ];
    function modeLabel(k) {
        for (var i = 0; i < MODES.length; i++) if (MODES[i].key === k) return MODES[i].label;
        return MODES[2].label;
    }
    /* رابط آمن: يقبل http/https فقط — أي شيء آخر يُعامَل كنص */
    function safeUrl(u) {
        var t = String(u === null || u === undefined ? '' : u).trim();
        if (!t) return '';
        if (/^https?:\/\//i.test(t)) return t;
        if (/^[a-z][a-z0-9+.\-]*:/i.test(t)) return '';
        return 'https://' + t;
    }

    /* ---------- التذكير بالموعد ---------- */
    var REMIND_OPTS = [15, 30, 60, 120, 180, 1440];
    function remindLabel(m) {
        if (m === 1440) return 'قبل يوم';
        if (m === 60) return 'قبل ساعة';
        if (m === 120) return 'قبل ساعتين';
        if (m === 180) return 'قبل 3 ساعات';
        return 'قبل ' + m + ' دقيقة';
    }
    function whenValue(iso) {
        if (!iso) return '';
        var d = new Date(iso);
        if (isNaN(d.getTime())) return '';
        function p(n) { return (n < 10 ? '0' : '') + n; }
        return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + 'T' + p(d.getHours()) + ':' + p(d.getMinutes());
    }
    function whenISO(v) {
        if (!v) return '';
        var d = new Date(v);
        return isNaN(d.getTime()) ? '' : d.toISOString();
    }
    function countdown(iso) {
        var d = new Date(iso);
        if (!iso || isNaN(d.getTime())) return null;
        var ms = d.getTime() - Date.now();
        if (ms <= 0) return { started: true, soon: true, ms: ms, text: 'بدأت الجلسة — يمكنك الانضمام الآن' };
        var m = Math.floor(ms / 60000);
        var dd = Math.floor(m / 1440), hh = Math.floor((m % 1440) / 60), mm = m % 60;
        var txt = dd > 0 ? (dd + ' يوم و ' + hh + ' ساعة')
                : (hh > 0 ? (hh + ' ساعة و ' + mm + ' دقيقة') : (mm + ' دقيقة'));
        return { started: false, soon: ms <= 3600000, ms: ms, text: 'تبقّى ' + txt };
    }
    /* صياغة العدّاد للبطاقة العامة */
    function cdLabel(cd) {
        if (!cd) return '';
        return cd.started ? '🔴 الجلسة الآن — يمكنك الانضمام' : ('⏳ ' + cd.text + ' على البدء');
    }
    function icsEsc(t) {
        return String(t || '').replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/,/g, '\\,').replace(/;/g, '\\;');
    }
    function icsStamp(d) {
        return d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
    }
    /* ملف تقويم فيه الرابط + تنبيه قبل الموعد — يعمل على آيفون وأندرويد وجوجل */
    function icsFor(salon, link) {
        var start = new Date(salon.startsAt);
        if (isNaN(start.getTime())) return '';
        var end = new Date(start.getTime() + 90 * 60000);
        var mins = salon.reminderMin || 60;
        var desc = (link ? ('رابط المجلس: ' + link + '\n') : '') + 'نادي مَتن — صالون القراءة';
        return [
            'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Matn Club//AR//', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
            'BEGIN:VEVENT',
            'UID:' + salon.id + '-' + start.getTime() + '@matn.club',
            'DTSTAMP:' + icsStamp(new Date()),
            'DTSTART:' + icsStamp(start),
            'DTEND:' + icsStamp(end),
            'SUMMARY:' + icsEsc(salon.title),
            'DESCRIPTION:' + icsEsc(desc),
            'LOCATION:' + icsEsc(link || salon.where || ''),
            (link ? 'URL:' + icsEsc(link) : 'X-NOLINK:1'),
            'BEGIN:VALARM', 'TRIGGER:-PT' + mins + 'M', 'ACTION:DISPLAY',
            'DESCRIPTION:' + icsEsc('تذكير: ' + salon.title), 'END:VALARM',
            'END:VEVENT', 'END:VCALENDAR'
        ].join('\r\n');
    }
    function downloadICS(salon, link) {
        var text = icsFor(salon, link);
        if (!text) { toast('حدّد موعد الجلسة أولاً من اللوحة.', 'error'); return; }
        var name = 'matn-' + String(salon.title || 'salon').replace(/[^\p{L}\p{N}\-]+/gu, '-').slice(0, 40) + '.ics';
        try {
            var blob = new Blob([text], { type: 'text/calendar;charset=utf-8' });
            var url = URL.createObjectURL(blob);
            var a = document.createElement('a');
            a.href = url; a.download = name;
            document.body.appendChild(a); a.click();
            window.setTimeout(function () { URL.revokeObjectURL(url); a.remove(); }, 1500);
            toast('نزّل ملف التذكير — افتحه فيتقوّلك في تقويم جوالك', 'ok');
        } catch (e) { toast('تعذّر إنشاء الملف في هذا المتصفح.', 'error'); }
    }
    function gcalUrl(salon, link) {
        var start = new Date(salon.startsAt);
        if (isNaN(start.getTime())) return '';
        var end = new Date(start.getTime() + 90 * 60000);
        return 'https://calendar.google.com/calendar/render?action=TEMPLATE' +
            '&text=' + encodeURIComponent(salon.title || 'صالون مَتن') +
            '&dates=' + icsStamp(start) + '/' + icsStamp(end) +
            '&details=' + encodeURIComponent((link ? ('رابط المجلس: ' + link + '\n') : '') + 'نادي مَتن') +
            '&location=' + encodeURIComponent(link || salon.where || '');
    }
    function permLabel(k) {
        for (var i = 0; i < PERMS.length; i++) if (PERMS[i].key === k) return PERMS[i].label;
        return k;
    }

    var CATEGORIES = [
        { label: 'عناية ومشاغل نسائية', cls: 'bg-matn-gold/20 text-matn-emerald' },
        { label: 'لياقة وبدنية نسائية', cls: 'bg-blue-50 text-blue-800' },
        { label: 'مقاهي أدبية وثقافة', cls: 'bg-amber-50 text-amber-800' },
        { label: 'دور نشر وكتب', cls: 'bg-emerald-50 text-emerald-800' }
    ];

    var SEED_PARTNERS = [
        { id: 'p-lavender', name: 'مشغل لافندر للعناية النسائية', tag: 0, desc: 'قسيمة خصم 100 ريال لكافة الخدمات التجميلية والمساج الأروماتك.', cost: 120, prefix: 'LAV' },
        { id: 'p-vita', name: 'نادي فيتا للياقة النسائية', tag: 1, desc: 'اشتراك أسبوعي تجريبي كامل شامل الصالة وحصص البيلاتس واليوغا.', cost: 150, prefix: 'VITA' },
        { id: 'p-sofia', name: 'مقهى ومكتبة صوفيا', tag: 2, desc: 'مشروب قهوة مختصة مجاني مع حجز ركن قراءة هادئ لمدة ساعتين.', cost: 50, prefix: 'SOF' }
    ];

    var SEED_CODES = {
        'MATN-2026-50': { points: 50, used: false, at: null },
        'MATN-2026-100': { points: 100, used: false, at: null }
    };

    /* ---------- تخزين آمن (يعمل حتى لو مُنع localStorage) ---------- */
    var mem = {};
    var store = {
        get: function (k) { try { return window.localStorage.getItem(k); } catch (e) { return mem[k] || null; } },
        set: function (k, v) { try { window.localStorage.setItem(k, v); } catch (e) { mem[k] = v; } }
    };

    /* ---------- أدوات عامة ---------- */
    function num(n) {
        try { return Number(n).toLocaleString('en-US'); } catch (e) { return String(n); }
    }
    function rnd(len) {
        var c = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789', o = '', i;
        for (i = 0; i < len; i++) o += c.charAt(Math.floor(Math.random() * c.length));
        return o;
    }
    function esc(s) {
        return String(s === null || s === undefined ? '' : s).replace(/[&<>"']/g, function (m) {
            return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m];
        });
    }
    function fmtDate(iso) {
        try {
            return new Date(iso).toLocaleDateString('ar-SA-u-nu-latn', { year: 'numeric', month: 'long', day: 'numeric' });
        } catch (e) { return ''; }
    }
    function fmtDateTime(iso) {
        try {
            return new Date(iso).toLocaleString('ar-SA-u-nu-latn', { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' });
        } catch (e) { return ''; }
    }
    function catCls(i) { return (CATEGORIES[i] || CATEGORIES[0]).cls; }
    function catLabel(i) { return (CATEGORIES[i] || CATEGORIES[0]).label; }

    /* ---------- مخزن الحسابات والحالة ----------
       الوثيقة المخزّنة تحمل: accounts (حساب لكل عضو) + session + عناصر مشتركة
       (المقاعد، الشركاء، قسائم الشحن، التسجيل). و load() تُقدّم «منظراً» للكود
       كما كان، فبقية الملف لا يتغير. */
    function seedDoc() {
        return {
            accounts: {},
            authUser: null,
            salons: [{
                id: 'salon-1', title: SESSION.title, when: SESSION.when, where: SESSION.where,
                facilitator: SESSION.facilitator, capacity: SESSION.seats, featured: true,
                at: new Date().toISOString()
            }],
            seatsLeft: SESSION.seats,
            partners: SEED_PARTNERS.slice(),
            giftCodes: JSON.parse(JSON.stringify(SEED_CODES)),
            recording: { title: '', url: '' }
        };
    }
    function doc() {
        try {
            var raw = store.get(KEY);
            var d = raw ? JSON.parse(raw) : null;
            if (d && typeof d === 'object' && d.accounts) return d;
        } catch (e) {}
        return seedDoc();
    }
    function saveDoc(d) { try { store.set(KEY, JSON.stringify(d)); } catch (e) {} }

    /* ---------- الصالونات: قائمة واحدة، واحد منها «القادم» ---------- */
    function featuredSalon(d) {
        var l = (d && d.salons) || [];
        if (!l.length) return null;
        for (var i = 0; i < l.length; i++) if (l[i].featured) return l[i];
        l[0].featured = true;
        return l[0];
    }
    function salonById(d, id) {
        var l = (d && d.salons) || [];
        for (var i = 0; i < l.length; i++) if (l[i].id === id) return l[i];
        return null;
    }
    /* المقاعد المشغولة تُحسب من الحجوزات — لا عدّاد منفصل يتعارض معها */
    function takenOf(d, sid) {
        var n = 0;
        Object.keys(d.accounts || {}).forEach(function (u) {
            var b = d.accounts[u].booking;
            if (b && (!b.salonId || b.salonId === sid)) n++;
        });
        return n;
    }
    function seatsLeftOf(d, salon) {
        if (!salon) return 0;
        return Math.max(0, (salon.capacity || 0) - takenOf(d, salon.id));
    }
    function newSalonId(d) {
        var n = 1, id;
        do { id = 'salon-' + n++; } while (salonById(d, id));
        return id;
    }

    /* ---------- ترحيل البيانات القديمة ---------- */
    function migrateAll(d) {
        var dirty = false;
        /* صالون واحد قديم → قائمة صالونات */
        if (!Array.isArray(d.salons) || !d.salons.length) {
            var b = d.salon || { title: SESSION.title, when: SESSION.when, where: SESSION.where, facilitator: SESSION.facilitator, capacity: SESSION.seats };
            d.salons = [{
                id: 'salon-1', title: b.title, when: b.when, where: b.where,
                facilitator: b.facilitator, capacity: b.capacity || SESSION.seats,
                featured: true, at: new Date().toISOString()
            }];
            dirty = true;
        }
        var feat = featuredSalon(d);
        (d.salons || []).forEach(function (x) {
            if (typeof x.mode !== 'string' || !x.mode) { x.mode = 'hybrid'; dirty = true; }
            if (typeof x.link !== 'string') { x.link = ''; dirty = true; }
            if (typeof x.startsAt !== 'string') { x.startsAt = ''; dirty = true; }
            if (!(x.reminderMin > 0)) { x.reminderMin = 60; dirty = true; }
        });
        Object.keys(d.accounts || {}).forEach(function (u) {
            var a = d.accounts[u];
            /* مشرف قديم بلا صلاحيات → كل الصلاحيات */
            if (a.isAdmin && !a.super && !Array.isArray(a.perms)) { a.perms = ALL_PERMS.slice(); dirty = true; }
            if (!Array.isArray(a.perms)) { a.perms = []; dirty = true; }
            /* حجز قديم بلا صالون → يُنسب للصالون القادم */
            if (a.booking && !a.booking.salonId && feat) { a.booking.salonId = feat.id; dirty = true; }
            /* مشرف واحد فقط: أول مشرف = المشرف العام */
        });
        var admins = Object.keys(d.accounts || {}).filter(function (u) { return d.accounts[u].isAdmin; });
        if (admins.length && !admins.some(function (u) { return d.accounts[u].super; })) {
            d.accounts[admins[0]].super = true;
            d.accounts[admins[0]].perms = ALL_PERMS.slice();
            dirty = true;
        }
        if (dirty) saveDoc(d);
        return d;
    }

    var state = null;

    function load() {
        if (state) return state;
        var d = migrateAll(doc());
        var acc = (d.authUser && d.accounts[d.authUser]) ? d.accounts[d.authUser] : null;
        var feat = featuredSalon(d) || {
            id: 'salon-1', title: SESSION.title, when: SESSION.when, where: SESSION.where,
            facilitator: SESSION.facilitator, capacity: SESSION.seats, featured: true
        };
        state = {
            signedIn: !!acc,
            user: {
                username: acc ? d.authUser : null,
                name: acc ? (acc.name || d.authUser) : '',
                points: acc ? (typeof acc.points === 'number' ? acc.points : 340) : 0,
                isAdmin: !!(acc && acc.isAdmin),
                super: !!(acc && acc.super),
                perms: acc ? (acc.super ? ALL_PERMS.slice() : (acc.perms || []).slice()) : []
            },
            salon: feat,
            salons: d.salons || [],
            seatsLeft: seatsLeftOf(d, feat),
            partners: Array.isArray(d.partners) && d.partners.length ? d.partners : SEED_PARTNERS.slice(),
            giftCodes: d.giftCodes && typeof d.giftCodes === 'object' ? d.giftCodes : JSON.parse(JSON.stringify(SEED_CODES)),
            recording: d.recording && typeof d.recording === 'object' ? d.recording : { title: '', url: '' },
            booking: acc ? (acc.booking || null) : null,
            vouchers: acc && Array.isArray(acc.vouchers) ? acc.vouchers : [],
            ledger: acc && Array.isArray(acc.ledger) ? acc.ledger : []
        };
        return state;
    }

    function persist() {
        var d = doc();
        d.salons = state.salons;
        d.partners = state.partners;
        d.giftCodes = state.giftCodes;
        d.recording = state.recording;
        var u = state.user && state.user.username;
        if (u && d.accounts[u]) {
            d.accounts[u].points = state.user.points;
            d.accounts[u].booking = state.booking;
            d.accounts[u].vouchers = state.vouchers;
            d.accounts[u].ledger = state.ledger;
        }
        d.authUser = u || null;
        /* المقاعد مشتقة دائماً من الحجوزات */
        state.seatsLeft = seatsLeftOf(d, state.salon);
        d.seatsLeft = state.seatsLeft;
        saveDoc(d);
    }

    function change(fn) { fn(load()); persist(); render(); }
    function addPoints(delta) { load().user.points = Math.max(0, load().user.points + delta); }
    function record(reason, points) { load().ledger.unshift({ reason: reason, points: points, at: new Date().toISOString() }); }

    /* ---------- الحسابات: تسجيل / دخول / خروج ---------- */
    var AUTH_ERRORS = {
        BAD_USERNAME: 'اسم المستخدم يجب أن يكون 3–24 حرفاً (حروف وأرقام ونقطة أو شرطة فقط).',
        WEAK_PASSWORD: 'كلمة المرور يجب أن تكون 6 أحرف على الأقل.',
        USERNAME_TAKEN: 'اسم المستخدم محجوز — اختر غيره.',
        NO_ACCOUNT: 'لا يوجد حساب بهذا الاسم. أنشئ حساباً جديداً.',
        WRONG_PASSWORD: 'كلمة المرور غير صحيحة.',
        NEED_LOGIN: 'سجّل الدخول أولاً للمتابعة.',
        EMAIL_TAKEN: 'اسم المستخدم محجوز — اختر غيره.'
    };
    function authMsg(e) {
        if (!e) return 'تعذّر إكمال العملية.';
        return AUTH_ERRORS[e.code] || AUTH_ERRORS[e.message] || e.message || 'تعذّر إكمال العملية.';
    }

    function normalizeUser(u) {
        var s = String(u || '').trim().toLowerCase();
        if (!/^[\p{L}\p{N}._-]{3,24}$/u.test(s)) return '';
        return s;
    }

    function sha256(text) {
        try {
            if (window.crypto && window.crypto.subtle && window.TextEncoder) {
                return window.crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)).then(function (buf) {
                    return Array.prototype.map.call(new Uint8Array(buf), function (b) {
                        return ('0' + b.toString(16)).slice(-2);
                    }).join('');
                });
            }
        } catch (e) {}
        var h = 5381, i;
        for (i = 0; i < text.length; i++) h = ((h << 5) + h + text.charCodeAt(i)) >>> 0;
        return Promise.resolve('f' + h.toString(16));
    }

    function createAccount(username, name, pass) {
        var uname = normalizeUser(username);
        if (!uname) return Promise.reject({ code: 'BAD_USERNAME' });
        if (!pass || String(pass).length < 6) return Promise.reject({ code: 'WEAK_PASSWORD' });
        var d = doc();
        if (d.accounts[uname]) return Promise.reject({ code: 'USERNAME_TAKEN' });
        return sha256(String(pass)).then(function (hash) {
            var first = Object.keys(d.accounts).length === 0;
            d.accounts[uname] = {
                name: String(name || '').trim() || uname,
                hash: hash,
                points: 340,                       // رصيد ترحيبي
                ledger: [{ reason: 'رصيد ترحيبي عند التسجيل', points: 340, at: new Date().toISOString() }],
                vouchers: [], booking: null,
                isAdmin: first,                  // أول حساب = المشرف
                super: first,                    // وهو «المشرف العام» دائماً
                perms: first ? ALL_PERMS.slice() : [],
                createdAt: new Date().toISOString()
            };
            d.authUser = uname;
            saveDoc(d);
            state = null; load(); render();
            return { username: uname, name: d.accounts[uname].name };
        });
    }

    function signIn(username, pass) {
        var uname = normalizeUser(username);
        var d = doc();
        var acc = d.accounts[uname];
        if (!acc) return Promise.reject({ code: 'NO_ACCOUNT' });
        return sha256(String(pass)).then(function (hash) {
            if (hash !== acc.hash) throw { code: 'WRONG_PASSWORD' };
            d.authUser = uname;
            saveDoc(d);
            state = null; load(); render();
            return { username: uname, name: acc.name };
        });
    }

    function signOut() {
        var d = doc();
        d.authUser = null;
        saveDoc(d);
        state = null; load(); render();
        toast('تم تسجيل الخروج', 'info');
    }

    /* هل هذه العملية تحتاج تسجيل دخول؟ (في الوضع المحلي فقط — الوضع السحابي
       يستخدم الخادم لهوية الزائر حتى نضيف حسابات Supabase) */
    function needsLogin() { return !CLOUD && !load().signedIn; }

    /* تعديل حساب عضو آخر (للمشرف) */
    function updateAccount(uname, fn) {
        var d = doc();
        if (!d.accounts[uname]) return;
        fn(d.accounts[uname], d);
        saveDoc(d);
        state = null; load(); render();
    }

    /* ---------- المشرف العام والصلاحيات ----------
       أول حساب مسجّل يحمل super=true (كل الصلاحيات دائماً، ولا يُجرَّد ولا يُحذف).
       بقية الأعضاء يأخذون صلاحيات محدّدة في acc.perms. */
    function hasAdmin() {
        var d = doc();
        return Object.keys(d.accounts).some(function (u) { return d.accounts[u].isAdmin; });
    }
    function can(perm) {
        var st = load();
        if (!st.signedIn) return false;
        if (st.user.super) return true;
        if (!perm) return st.user.isAdmin;
        return st.user.perms.indexOf(perm) !== -1;
    }
    function needPerm(perm, what) {
        if (needsLogin()) { requireLogin(what); return false; }
        if (!can(perm)) { toast('لا تملك صلاحية «' + permLabel(perm) + '».', 'error'); return false; }
        return true;
    }

    /* الصالون الذي حجز فيه العضو الحالي */
    function bookedSalon() {
        var s = load();
        if (!s.booking) return null;
        return salonById(migrateAll(doc()), s.booking.salonId) || s.salon;
    }
    /* تفعيل إشعار المتصفح (يحتاج إبقاء الصفحة مفتوحة) */
    function armBrowserReminder() {
        var salon = bookedSalon();
        if (!salon || !salon.startsAt) { toast('لا يوجد موعد محدَّد للتذكير.', 'error'); return; }
        if (!('Notification' in window)) { toast('متصفحك لا يدعم الإشعارات — استخدم زر التقويم.', 'info'); return; }
        var mins = salon.reminderMin || 60;
        var delay = new Date(salon.startsAt).getTime() - mins * 60000 - Date.now();
        if (delay <= 0) { toast('وقت التذكير مضى — أضفه إلى تقويمك ليصلك في الوقت.', 'info'); return; }
        var go = function (perm) {
            if (perm !== 'granted') { toast('لم يُسمح بالإشعارات — استخدم زر التقويم.', 'info'); return; }
            window.setTimeout(function () {
                var link = safeUrl(salon.link);
                try { new Notification('نادي مَتن — حان موعد المجلس', { body: salon.title + (link ? ('\n' + link) : ''), tag: 'matn-' + salon.id }); } catch (e) {}
                toast('حان موعد المجلس — الرابط في الأعلى', 'ok');
            }, delay);
            toast('سأذكّرك ' + remindLabel(mins) + ' — أبقِ الصفحة مفتوحة.', 'ok');
        };
        try {
            var r = Notification.requestPermission(go);
            if (r && r.then) r.then(go);
        } catch (e) { toast('تعذّر تشغيل الإشعارات في هذا المتصفح.', 'info'); }
    }

    /* صف التذكير عبر واتساب داخل بطاقة المحجوز */
    function waRemindRow(salon) {
        var d = migrateAll(doc());
        var s = load();
        var mine = (d.authUser && d.accounts[d.authUser]) ? d.accounts[d.authUser] : null;
        var phone = (mine && mine.phone) || (s.booking && s.booking.phone) || '';
        var link = waLink(phone, reminderText(salon));
        if (link) {
            return '<div class="bg-white/70 border border-emerald-200 rounded-xl p-3 space-y-2">' +
                    '<div class="font-bold text-emerald-800">📱 تذكير واتساب — <span dir="ltr">' + esc(phone) + '</span></div>' +
                    '<a href="' + esc(link) + '" target="_blank" rel="noopener" class="inline-block bg-[#25D366] hover:opacity-90 text-white px-4 py-2.5 rounded-xl text-xs font-bold transition">أرسل التذكير إليّ على واتساب</a>' +
                    '<button type="button" data-action="edit-phone" class="text-matn-muted font-bold text-[11px] hover:underline mr-2">تغيير الرقم</button>' +
                    '<div class="text-[10px] text-matn-muted leading-relaxed">تفتح الرسالة جاهزة — اضغط إرسال في واتساب.</div>' +
                '</div>';
        }
        var g = readGuest();
        return '<div class="bg-white/70 border border-matn-sand rounded-xl p-3 space-y-2">' +
                '<div class="font-bold text-matn-emerald">📱 تذكير واتساب</div>' +
                '<div class="text-[11px] text-matn-muted leading-relaxed">أضف رقم واتساب ليصلك تذكير جاهز بالرابط قبل الموعد بضغطة واحدة.</div>' +
                '<div class="flex flex-wrap gap-2">' +
                    '<input class="matn-input" id="waPhone" style="max-width:14rem" type="tel" inputmode="tel" value="' + esc(g.phone || '') + '" placeholder="0555555555">' +
                    '<button type="button" data-action="save-phone" class="bg-[#25D366] hover:opacity-90 text-white px-4 py-2.5 rounded-xl text-xs font-bold transition">حفظ الرقم</button>' +
                '</div>' +
            '</div>';
    }
    /* حفظ رقم الواتساب (للعضو نفسه) */
    function saveMyPhone() {
        var el = document.getElementById('waPhone');
        var p = el ? el.value.trim() : '';
        if (!waNumber(p)) { toast('أدخل رقماً صحيحاً — مثال: 0555555555', 'error'); return; }
        var d = migrateAll(doc());
        var u = d.authUser;
        if (u && d.accounts[u]) d.accounts[u].phone = p;
        if (u && d.accounts[u] && d.accounts[u].booking) d.accounts[u].booking.phone = p;
        var g = readGuest(); saveGuest(g.name || '', g.email || '', p);
        saveDoc(d); refresh();
        toast('حُفظ رقم الواتساب', 'ok');
    }

    /* نسخ نص التذكير للصقه في واتساب */
    function copyReminder() {
        if (!needPerm('bookings', 'الحجوزات')) return;
        var text = reminderText(load().salon);
        var done = function () { toast('نُسخ نص التذكير — الصقه في واتساب أو أرسله للمجموعة', 'ok'); };
        var fb = function () {
            var ta = document.createElement('textarea');
            ta.value = text; ta.style.position = 'fixed'; ta.style.left = '-9999px';
            document.body.appendChild(ta); ta.select();
            try { document.execCommand('copy'); } catch (e) {}
            ta.remove();
        };
        try {
            if (navigator.clipboard && navigator.clipboard.writeText) {
                navigator.clipboard.writeText(text).then(done).catch(function () { fb(); done(); });
            } else { fb(); done(); }
        } catch (e) { fb(); done(); }
    }

    /* صياغة موعد مقروء بالعربية من تاريخ حقيقي */
    var AR_DAYS = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
    var AR_MONTHS = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'];
    function arabicWhen(iso) {
        var d = new Date(iso);
        if (isNaN(d.getTime())) return '';
        var h = d.getHours(), mm = d.getMinutes(), h12 = h % 12;
        if (h12 === 0) h12 = 12;
        return AR_DAYS[d.getDay()] + ' ' + d.getDate() + ' ' + AR_MONTHS[d.getMonth()] +
               ' • ' + h12 + ':' + (mm < 10 ? '0' + mm : mm) + ' ' + (h < 12 ? 'صباحاً' : 'مساءً');
    }

    /* نافذة تأكيد */
    function confirmBox(title, text, onYes, label) {
        var id = 'cf' + Math.random().toString(36).slice(2, 8);
        modal({
            title: title,
            body: '<p class="text-xs text-matn-muted leading-relaxed">' + esc(text) + '</p>',
            footer: '<button type="button" id="' + id + '" class="bg-red-700 hover:bg-red-800 text-white px-4 py-2.5 rounded-xl text-xs font-bold transition">' + esc(label || 'تأكيد') + '</button>' + okBtn('إلغاء'),
            ready: function (w) {
                w.querySelector('#' + id).addEventListener('click', function () { closeModal(); onYes(); });
            }
        });
    }

    /* حذف عضو (وإلغاء حجزه) */
    function removeMember(uname) {
        if (!needPerm('members', 'إدارة الأعضاء')) return;
        var d = doc();
        var a = d.accounts[uname];
        if (!a) return;
        if (a.super) { toast('لا يمكن حذف المشرف العام.', 'error'); return; }
        var booked = !!a.booking;
        confirmBox('حذف العضو', 'سيُحذف حساب «' + a.name + '» نهائياً' + (booked ? '، ويُلغى حجزه ويُفرغ مقعده' : '') + '. لا يمكن التراجع.', function () {
            delete d.accounts[uname];
            if (d.authUser === uname) d.authUser = null;
            saveDoc(d); state = null; load(); render();
            toast('حُذف العضو', 'ok');
        }, 'حذف نهائي');
    }

    /* إلغاء حجز عضو من اللوحة */
    function cancelBookingFor(uname) {
        if (!needPerm('bookings', 'الحجوزات')) return;
        var d = doc();
        var a = d.accounts[uname];
        if (!a || !a.booking) return;
        confirmBox('إلغاء الحجز', 'سيُلغى حجز «' + a.name + '» (تذكرة ' + a.booking.code + ') ويُفرغ المقعد.', function () {
            a.booking = null;
            saveDoc(d); refresh();
            toast('أُلغي الحجز وأُفرغ المقعد', 'ok');
        }, 'إلغاء الحجز');
    }

    /* تعيين كلمة مرور جديدة لعضو */
    function resetPassword(uname) {
        if (!needPerm('members', 'إدارة الأعضاء')) return;
        var d = doc();
        var a = d.accounts[uname];
        if (!a) return;
        modal({
            title: 'كلمة مرور جديدة',
            body: '<p class="text-xs text-matn-muted leading-relaxed mb-3">للعضو <strong class="text-matn-charcoal">' + esc(a.name) + '</strong> (@' + esc(uname) + ').</p>' +
                  '<label class="matn-field"><span>كلمة المرور الجديدة</span><input class="matn-input" id="rpVal" type="text" placeholder="6 أحرف على الأقل"></label>' +
                  '<p id="rpMsg" class="text-xs"></p>',
            footer: '<button type="button" id="rpGo" class="bg-matn-emerald hover:bg-matn-emeraldLight text-white px-4 py-2.5 rounded-xl text-xs font-bold transition">تعيين</button>' + okBtn('إلغاء'),
            ready: function (w) {
                w.querySelector('#rpGo').addEventListener('click', function () {
                    var v = w.querySelector('#rpVal').value;
                    var m = w.querySelector('#rpMsg');
                    if (!v || String(v).length < 6) { m.textContent = 'كلمة المرور 6 أحرف على الأقل.'; m.className = 'text-xs text-red-700'; return; }
                    sha256(String(v)).then(function (h) {
                        updateAccount(uname, function (acc) { acc.hash = h; });
                        closeModal();
                        toast('عُيّنت كلمة مرور جديدة للعضو', 'ok');
                    });
                });
            }
        });
    }

    /* استعادة الإشراف العام (يظهر فقط إذا لم يوجد أي مشرف على المتصفح) */
    function claimSuperAdmin() {
        if (CLOUD) { toast('هذه الميزة في الوضع المحلي فقط.', 'info'); return; }
        if (needsLogin()) { requireLogin('تعيين مشرف عام'); return; }
        if (hasAdmin()) { toast('يوجد مشرف عام بالفعل على هذا المتصفح.', 'error'); return; }
        var d = doc();
        var u = d.authUser;
        if (!u || !d.accounts[u]) return;
        d.accounts[u].isAdmin = true;
        d.accounts[u].super = true;
        d.accounts[u].perms = ALL_PERMS.slice();
        saveDoc(d); state = null; load(); render();
        toast('أصبحت المشرف العام — كل مزايا اللوحة متاحة لك', 'ok');
    }

    /* ---------- إجراءات لوحة التحكم ---------- */
    function adminOnly(what) {
        if (needsLogin()) { requireLogin(what); return false; }
        if (!can(null)) { toast('هذه العملية متاحة للمشرف فقط.', 'error'); return false; }
        return true;
    }

    /* ---------- إدارة الصالونات (إضافة / تعديل / حذف / تعيين القادم) ---------- */
    function salonForm(id) {
        if (!needPerm('salons', 'إدارة الصالونات')) return;
        var d = doc();
        var s = id ? salonById(d, id) : null;
        var isNew = !s;
        var v = s || { title: '', when: '', where: '', facilitator: '', capacity: SESSION.seats };
        modal({
            title: isNew ? 'إضافة صالون جديد' : 'تعديل الصالون',
            body: '<div class="grid grid-cols-1 sm:grid-cols-2 gap-3">' +
                    '<label class="matn-field sm:col-span-2"><span>عنوان الجلسة</span><input class="matn-input" id="sfTitle" type="text" value="' + esc(v.title) + '"></label>' +
                    '<div class="sm:col-span-2 bg-matn-cream border border-matn-sand rounded-xl p-3">' +
                        '<label class="matn-field"><span>📅 اليوم والساعة (لظهور العدّاد والتذكير)</span><input class="matn-input" id="sfStart" type="datetime-local" value="' + whenValue(v.startsAt) + '"></label>' +
                        '<div class="flex flex-wrap gap-1.5 mt-1">' +
                            '<button type="button" class="matn-preset" data-preset="0">اليوم 7:30 م</button>' +
                            '<button type="button" class="matn-preset" data-preset="1">غداً 7:30 م</button>' +
                            '<button type="button" class="matn-preset" data-preset="7">بعد أسبوع 7:30 م</button>' +
                            '<button type="button" class="matn-preset" data-preset="14">بعد أسبوعين 7:30 م</button>' +
                        '</div>' +
                        '<p class="text-[10px] text-matn-muted mt-2 leading-relaxed">بدون هذا الحقل لا يظهر العدّ التنازلي في الرئيسية ولا يُرسل أي تذكير.</p>' +
                    '</div>' +
                    '<label class="matn-field"><span>⏰ التذكير قبل الموعد</span><select class="matn-input" id="sfRemind">' +
                        REMIND_OPTS.map(function (m) {
                            return '<option value="' + m + '"' + ((v.reminderMin || 60) === m ? ' selected' : '') + '>' + remindLabel(m) + '</option>';
                        }).join('') +
                    '</select></label>' +
                    '<label class="matn-field"><span>الموعد المعروض للزوار (اتركه فارغاً ليُكتب من اليوم والساعة)</span><input class="matn-input" id="sfWhen" type="text" value="' + esc(v.when) + '" placeholder="يُكتب تلقائياً"></label>' +
                    '<label class="matn-field"><span>نوع المجلس</span><select class="matn-input" id="sfMode">' +
                        MODES.map(function (m) {
                            return '<option value="' + m.key + '"' + ((v.mode || 'hybrid') === m.key ? ' selected' : '') + '>' + m.label + '</option>';
                        }).join('') +
                    '</select></label>' +
                    '<label class="matn-field"><span>الميسّر</span><input class="matn-input" id="sfFac" type="text" value="' + esc(v.facilitator) + '"></label>' +
                    '<label class="matn-field sm:col-span-2"><span>رابط الاجتماع — يظهر للمحجوزين فقط (Zoom أو أي رابط)</span><input class="matn-input" id="sfLink" type="url" value="' + esc(v.link || '') + '" placeholder="https://zoom.us/j/123456789"></label>' +
                    '<label class="matn-field sm:col-span-2"><span>المكان</span><input class="matn-input" id="sfWhere" type="text" value="' + esc(v.where) + '"></label>' +
                    '<label class="matn-field"><span>عدد المقاعد</span><input class="matn-input" id="sfCap" type="number" min="1" step="1" value="' + (v.capacity || 6) + '"></label>' +
                  '</div><p id="sfMsg" class="text-xs"></p>',
            footer: '<button type="button" id="sfGo" class="bg-matn-emerald hover:bg-matn-emeraldLight text-white px-4 py-2.5 rounded-xl text-xs font-bold transition">حفظ</button>' + okBtn('إلغاء'),
            ready: function (w) {
                w.querySelectorAll('[data-preset]').forEach(function (b) {
                    b.addEventListener('click', function () {
                        var days = parseInt(b.getAttribute('data-preset'), 10) || 0;
                        var d = new Date();
                        d.setDate(d.getDate() + days);
                        d.setHours(19, 30, 0, 0);
                        w.querySelector('#sfStart').value = whenValue(d.toISOString());
                        var wt = w.querySelector('#sfWhen');
                        if (!wt.value.trim()) wt.value = arabicWhen(d.toISOString());
                    });
                });
                var st = w.querySelector('#sfStart');
                st.addEventListener('change', function () {
                    var wt = w.querySelector('#sfWhen');
                    var iso = whenISO(st.value);
                    if (iso && !wt.value.trim()) wt.value = arabicWhen(iso);
                });
                w.querySelector('#sfGo').addEventListener('click', function () {
                    var t = w.querySelector('#sfTitle').value.trim();
                    var cap = parseInt(w.querySelector('#sfCap').value, 10);
                    var m = w.querySelector('#sfMsg');
                    if (!t) { m.textContent = 'اكتب عنوان الجلسة.'; m.className = 'text-xs text-red-700'; return; }
                    if (!(cap > 0)) { m.textContent = 'أدخل عدد مقاعد صحيحاً.'; m.className = 'text-xs text-red-700'; return; }
                    var doc2 = migrateAll(doc());
                    var startISO = whenISO(w.querySelector('#sfStart').value);
                    var whenTxt = w.querySelector('#sfWhen').value.trim();
                    if (!whenTxt && startISO) whenTxt = arabicWhen(startISO);
                    var data = {
                        title: t,
                        when: whenTxt,
                        facilitator: w.querySelector('#sfFac').value.trim(),
                        where: w.querySelector('#sfWhere').value.trim(),
                        capacity: cap,
                        mode: w.querySelector('#sfMode').value,
                        link: safeUrl(w.querySelector('#sfLink').value),
                        startsAt: startISO,
                        reminderMin: parseInt(w.querySelector('#sfRemind').value, 10) || 60
                    };
                    if (isNew) {
                        data.id = newSalonId(doc2);
                        data.featured = doc2.salons.length === 0;
                        data.at = new Date().toISOString();
                        doc2.salons.push(data);
                    } else {
                        var t2 = salonById(doc2, id);
                        if (t2) { t2.title = data.title; t2.when = data.when; t2.facilitator = data.facilitator; t2.where = data.where; t2.capacity = data.capacity; t2.mode = data.mode; t2.link = data.link; t2.startsAt = data.startsAt; t2.reminderMin = data.reminderMin; }
                    }
                    saveDoc(doc2);
                    closeModal(); refresh();
                    toast(isNew ? 'أُضيف الصالون' : 'حُفظت تعديلات الصالون', 'ok');
                });
            }
        });
    }

    function setFeaturedSalon(id) {
        if (!needPerm('salons', 'إدارة الصالونات')) return;
        var d = migrateAll(doc());
        d.salons.forEach(function (s) { s.featured = (s.id === id); });
        saveDoc(d); refresh();
        toast('صار هذا الصالون هو القادم — يظهر في الرئيسية والحجز', 'ok');
    }

    function deleteSalon(id) {
        if (!needPerm('salons', 'إدارة الصالونات')) return;
        var d = migrateAll(doc());
        if (d.salons.length <= 1) { toast('لا يمكن حذف الصالون الأخير — الموقع يحتاج صالوناً واحداً على الأقل.', 'error'); return; }
        var s = salonById(d, id);
        if (!s) return;
        var booked = 0;
        Object.keys(d.accounts).forEach(function (u) { var b = d.accounts[u].booking; if (b && b.salonId === id) booked++; });
        confirmBox('حذف الصالون', 'سيُحذف «' + s.title + '»' +
            (booked ? ' — وله ' + num(booked) + ' حجز قائم سيُلغى وتُفرَّغ مقاعده' : '') + '. لا يمكن التراجع.', function () {
            var d2 = migrateAll(doc());
            if (s.featured) {
                var other = d2.salons.filter(function (x) { return x.id !== id; })[0];
                if (other) other.featured = true;
            }
            Object.keys(d2.accounts).forEach(function (u) {
                var b = d2.accounts[u].booking;
                if (b && b.salonId === id) d2.accounts[u].booking = null;
            });
            d2.salons = d2.salons.filter(function (x) { return x.id !== id; });
            saveDoc(d2); refresh();
            toast('حُذف الصالون' + (booked ? ' وأُلغيت حجوزاته' : ''), 'ok');
        }, 'حذف');
    }

    /* ---------- إدارة الأعضاء والصلاحيات ---------- */
    function addMemberForm() {
        if (!needPerm('members', 'إدارة الأعضاء')) return;
        modal({
            title: 'إضافة عضو جديد',
            body: '<div class="grid grid-cols-1 sm:grid-cols-2 gap-3">' +
                    '<label class="matn-field"><span>الاسم</span><input class="matn-input" id="amName" type="text" placeholder="الاسم الكامل"></label>' +
                    '<label class="matn-field"><span>اسم المستخدم</span><input class="matn-input" id="amUser" type="text" placeholder="حروف وأرقام، 3–24"></label>' +
                    '<label class="matn-field"><span>كلمة المرور</span><input class="matn-input" id="amPass" type="text" placeholder="6 أحرف على الأقل"></label>' +
                    '<label class="matn-field"><span>الرصيد الابتدائي</span><input class="matn-input" id="amPoints" type="number" step="1" value="0"></label>' +
                    '<label class="matn-field sm:col-span-2"><span>الصلاحية المبدئية</span><select class="matn-input" id="amRole"><option value="member">عضو (بلا صلاحيات إدارية)</option><option value="manager">مدير (كل الصلاحيات)</option><option value="custom">تخصيص لاحقاً</option></select></label>' +
                  '</div><p class="text-[11px] text-matn-muted mt-2 leading-relaxed">يمكنك تغيير الصلاحيات بعد الإنشاء من قائمة الأعضاء.</p><p id="amMsg" class="text-xs"></p>',
            footer: '<button type="button" id="amGo" class="bg-matn-emerald hover:bg-matn-emeraldLight text-white px-4 py-2.5 rounded-xl text-xs font-bold transition">إنشاء الحساب</button>' + okBtn('إلغاء'),
            ready: function (w) {
                w.querySelector('#amGo').addEventListener('click', function () {
                    var m = w.querySelector('#amMsg');
                    var uname = normalizeUser(w.querySelector('#amUser').value);
                    var name = w.querySelector('#amName').value.trim();
                    var pass = w.querySelector('#amPass').value;
                    var role = w.querySelector('#amRole').value;
                    var pts = parseInt(w.querySelector('#amPoints').value, 10) || 0;
                    if (!uname) { m.textContent = 'اسم المستخدم يجب أن يكون 3–24 حرفاً (حروف وأرقام ونقطة أو شرطة).'; m.className = 'text-xs text-red-700'; return; }
                    if (!pass || String(pass).length < 6) { m.textContent = 'كلمة المرور 6 أحرف على الأقل.'; m.className = 'text-xs text-red-700'; return; }
                    var d = migrateAll(doc());
                    if (d.accounts[uname]) { m.textContent = 'اسم المستخدم محجوز — اختر غيره.'; m.className = 'text-xs text-red-700'; return; }
                    sha256(String(pass)).then(function (hash) {
                        var perms = role === 'manager' ? ALL_PERMS.slice() : [];
                        d.accounts[uname] = {
                            name: name || uname, hash: hash,
                            points: Math.max(0, pts),
                            ledger: [{ reason: 'حساب أُنشئ من لوحة التحكم', points: Math.max(0, pts), at: new Date().toISOString() }],
                            vouchers: [], booking: null,
                            isAdmin: perms.length > 0, super: false, perms: perms,
                            createdAt: new Date().toISOString()
                        };
                        saveDoc(d); closeModal(); refresh();
                        toast('أُنشئ حساب «' + (name || uname) + '»', 'ok');
                    });
                });
            }
        });
    }

    function togglePerm(uname, perm) {
        if (!needPerm('members', 'إدارة الصلاحيات')) return;
        var d = migrateAll(doc());
        var a = d.accounts[uname];
        if (!a) return;
        if (a.super) { toast('المشرف العام يملك كل الصلاحيات دائماً.', 'error'); return; }
        var i = a.perms.indexOf(perm);
        if (i === -1) a.perms.push(perm); else a.perms.splice(i, 1);
        a.isAdmin = a.perms.length > 0;
        saveDoc(d); refresh();
        toast((i === -1 ? 'مُنحت صلاحية «' : 'سُحبت صلاحية «') + permLabel(perm) + '»', 'ok');
    }

    function setAllPerms(uname, on) {
        if (!needPerm('members', 'إدارة الصلاحيات')) return;
        var d = migrateAll(doc());
        var a = d.accounts[uname];
        if (!a) return;
        if (a.super) { toast('المشرف العام يملك كل الصلاحيات دائماً.', 'error'); return; }
        a.perms = on ? ALL_PERMS.slice() : [];
        a.isAdmin = a.perms.length > 0;
        saveDoc(d); refresh();
        toast(on ? 'صار مديراً بكل الصلاحيات' : 'سُحبت كل الصلاحيات', 'ok');
    }

    function grantPoints(uname) {
        if (!needPerm('members', 'إدارة الأعضاء')) return;
        var d = doc();
        var a = d.accounts[uname];
        if (!a) return;
        modal({
            title: 'منح نقاط',
            body: '<p class="text-xs text-matn-muted leading-relaxed mb-3">العضو: <strong class="text-matn-charcoal">' + esc(a.name) + '</strong> — رصيده الحالي ' + num(a.points) + ' نقطة.</p>' +
                  '<label class="matn-field"><span>عدد النقاط (استخدم رقماً سالباً للخصم)</span><input class="matn-input" id="gpVal" type="number" step="1" value="50"></label>' +
                  '<label class="matn-field"><span>السبب</span><input class="matn-input" id="gpWhy" type="text" value="مكافأة من المشرف"></label>' +
                  '<p id="gpMsg" class="text-xs"></p>',
            footer: '<button type="button" id="gpGo" class="bg-matn-emerald hover:bg-matn-emeraldLight text-white px-4 py-2.5 rounded-xl text-xs font-bold transition">تنفيذ</button>' + okBtn('إلغاء'),
            ready: function (w) {
                w.querySelector('#gpGo').addEventListener('click', function () {
                    var v = parseInt(w.querySelector('#gpVal').value, 10);
                    var why = w.querySelector('#gpWhy').value.trim() || 'تعديل من المشرف';
                    var m = w.querySelector('#gpMsg');
                    if (!v) { m.textContent = 'أدخل رقماً غير صفري.'; m.className = 'text-xs text-red-700'; return; }
                    updateAccount(uname, function (acc) {
                        acc.points = Math.max(0, acc.points + v);
                        acc.ledger.unshift({ reason: why, points: v, at: new Date().toISOString() });
                    });
                    closeModal();
                    toast((v > 0 ? 'أُضيفت ' : 'خُصمت ') + num(Math.abs(v)) + ' نقطة', 'ok');
                });
            }
        });
    }

    function toggleAdmin(uname) {
        if (!needPerm('members', 'إدارة الأعضاء')) return;
        var d = doc();
        var a = d.accounts[uname];
        if (!a) return;
        var admins = Object.keys(d.accounts).filter(function (u) { return d.accounts[u].isAdmin; });
        if (a.super) { toast('المشرف العام لا يمكن تجريده من الإشراف.', 'error'); return; }
        if (a.isAdmin && admins.length === 1) { toast('لا يمكن إزالة الإشراف عن المشرف الوحيد.', 'error'); return; }
        updateAccount(uname, function (acc) { acc.isAdmin = !acc.isAdmin; });
        toast(a.isAdmin ? 'أُزيل الإشراف' : 'تمت الترقية لمشرف', 'ok');
    }

    function requireLogin(what) {
        modal({
            title: 'يلزم تسجيل الدخول',
            body: '<p class="text-xs text-matn-muted leading-relaxed">' + esc(what || 'هذه الميزة') +
                  ' متاحة للأعضاء المسجّلين. التسجيل مفتوح ومجاني.</p>',
            footer: '<a href="account.html" class="bg-matn-emerald hover:bg-matn-emeraldLight text-white px-4 py-2.5 rounded-xl text-xs font-bold transition">تسجيل الدخول / حساب جديد</a>' + okBtn('لاحقاً')
        });
    }

    /* ---------- تنبيه عائم ---------- */
    function toast(msg, kind) {
        var wrap = document.querySelector('.matn-toast-wrap');
        if (!wrap) { wrap = document.createElement('div'); wrap.className = 'matn-toast-wrap'; document.body.appendChild(wrap); }
        var t = document.createElement('div');
        t.className = 'matn-toast';
        t.setAttribute('data-kind', kind || 'ok');
        t.textContent = msg;
        wrap.appendChild(t);
        window.setTimeout(function () {
            t.style.opacity = '0'; t.style.transform = 'translateY(6px)';
            window.setTimeout(function () { t.remove(); }, 260);
        }, 3400);
    }

    /* ---------- نافذة منبثقة ---------- */
    function closeModal() {
        var m = document.querySelector('.matn-modal-backdrop');
        if (m) m.remove();
        document.removeEventListener('keydown', onEsc);
    }
    function onEsc(e) { if (e.key === 'Escape') closeModal(); }
    function modal(opts) {
        closeModal();
        var wrap = document.createElement('div');
        wrap.className = 'matn-modal-backdrop';
        wrap.innerHTML =
            '<div class="matn-modal" role="dialog" aria-modal="true" aria-label="' + esc(opts.title) + '">' +
                '<div class="matn-modal-head">' +
                    '<h3 class="font-bold font-amiri text-matn-emerald text-lg">' + esc(opts.title) + '</h3>' +
                    '<button type="button" class="matn-x" aria-label="إغلاق">✕</button>' +
                '</div>' +
                '<div class="matn-modal-body">' + (opts.body || '') + '</div>' +
                (opts.footer ? '<div class="matn-modal-foot">' + opts.footer + '</div>' : '') +
            '</div>';
        document.body.appendChild(wrap);
        wrap.addEventListener('click', function (e) { if (e.target === wrap) closeModal(); });
        wrap.querySelector('.matn-x').addEventListener('click', closeModal);
        wrap.querySelectorAll('[data-close]').forEach(function (b) { b.addEventListener('click', closeModal); });
        document.addEventListener('keydown', onEsc);
        if (typeof opts.ready === 'function') opts.ready(wrap);
        return wrap;
    }
    function okBtn(label) {
        return '<button type="button" data-close class="bg-matn-emerald hover:bg-matn-emeraldLight text-white px-4 py-2.5 rounded-xl text-xs font-bold transition">' + esc(label || 'تم') + '</button>';
    }

    /* ======================================================================
       الإجراءات
       ====================================================================== */

    /* بيانات الحاجز — تُحفظ للتعبئة التلقائية في المرة القادمة */
    function readGuest() {
        try { return JSON.parse(localStorage.getItem('matn_guest_v1') || '{}'); } catch (e) { return {}; }
    }
    function saveGuest(name, email, phone) {
        try { localStorage.setItem('matn_guest_v1', JSON.stringify({ name: name, email: email, phone: phone || '' })); } catch (e) {}
    }

    /* ---------- واتساب ---------- */
    var CC = '966';   /* مفتاح الدولة الافتراضي (السعودية) */
    function waNumber(p) {
        var n = String(p === null || p === undefined ? '' : p).replace(/[^0-9+]/g, '').replace(/\+/g, '');
        if (!n) return '';
        if (n.indexOf('00') === 0) n = n.slice(2);
        if (n.charAt(0) === '0') n = CC + n.slice(1);
        return n.length >= 9 ? n : '';
    }
    function waLink(p, text) {
        var n = waNumber(p);
        if (!n) return '';
        return 'https://wa.me/' + n + '?text=' + encodeURIComponent(text || '');
    }
    /* نص التذكير الجاهز للإرسال */
    function reminderText(salon) {
        var out = ['⏰ تذكير بمجلس نادي مَتن'];
        if (salon.title) out.push('📖 ' + salon.title);
        if (salon.startsAt) out.push('📅 ' + fmtDateTime(salon.startsAt));
        else if (salon.when) out.push('📅 ' + salon.when);
        var link = safeUrl(salon.link);
        if (link) out.push('🔗 رابط المجلس: ' + link);
        if (salon.where) out.push('📍 ' + salon.where);
        out.push('— نادي مَتن');
        return out.join('\n');
    }

    /* حجز مقعد — يطلب الاسم والبريد ثم ينفّذ */
    function bookSeat() {
        if (needsLogin()) { requireLogin('حجز مقعد في الصالون'); return; }
        var s = load();
        if (s.booking) { cancelBooking(); return; }
        if (s.seatsLeft <= 0) { toast('اكتمل عدد مقاعد الجلسة', 'error'); return; }

        var g = readGuest();
        var needEmail = !!(CLOUD && window.MatnCloud && window.MatnCloud.emailTickets);

        var g0 = readGuest();
        var d0 = migrateAll(doc());
        var acc0 = d0.authUser ? d0.accounts[d0.authUser] : null;
        var phone = (acc0 && acc0.phone) || g0.phone || '';
        modal({
            title: 'تأكيد حجز المقعد',
            body:
                '<p class="text-xs text-matn-muted leading-relaxed mb-3">' +
                    (needEmail ? 'سنرسل تذكرة الحجز إلى بريدك الإلكتروني.' : 'أدخل اسمك لتأكيد الحجز.') +
                '</p>' +
                '<label class="matn-field"><span>الاسم</span><input class="matn-input" id="bkName" type="text" value="' + esc(g.name || '') + '" placeholder="اسمك"></label>' +
                '<label class="matn-field"><span>البريد الإلكتروني' + (needEmail ? '' : ' (اختياري)') + '</span><input class="matn-input" id="bkEmail" type="email" value="' + esc(g.email || '') + '" placeholder="name@example.com"></label>' +
                '<label class="matn-field"><span>رقم واتساب (للتذكير قبل الموعد)</span><input class="matn-input" id="bkPhone" type="tel" inputmode="tel" value="' + esc(phone) + '" placeholder="0555555555"></label>' +
                '<p id="bkMsg" class="text-xs mt-1"></p>',
            footer: '<button type="button" id="bkGo" class="bg-matn-emerald hover:bg-matn-emeraldLight text-white px-4 py-2.5 rounded-xl text-xs font-bold transition">تأكيد الحجز</button>' + okBtn('إلغاء'),
            ready: function (w) {
                var nameEl = w.querySelector('#bkName');
                var mailEl = w.querySelector('#bkEmail');
                var msg = w.querySelector('#bkMsg');
                nameEl.focus();
                w.querySelector('#bkGo').addEventListener('click', function () {
                    var name = nameEl.value.trim();
                    var email = mailEl.value.trim();
                    var phoneEl = w.querySelector('#bkPhone');
                    var phone = phoneEl ? phoneEl.value.trim() : '';
                    if (!name) { msg.textContent = 'اكتب اسمك.'; msg.className = 'text-xs mt-1 text-red-700'; return; }
                    if (phone && !waNumber(phone)) { msg.textContent = 'رقم الواتساب غير صحيح — مثال: 0555555555'; msg.className = 'text-xs mt-1 text-red-700'; return; }
                    if (needEmail && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
                        msg.textContent = 'أدخل بريداً صحيحاً — التذكرة تُرسل إليه.';
                        msg.className = 'text-xs mt-1 text-red-700';
                        return;
                    }
                    saveGuest(name, email, phone);
                    closeModal();
                    doBook(name, email, phone);
                });
            }
        });
    }

    function doBook(name, email, phone) {
        if (CLOUD) {
            return window.MatnCloud.bookSeat(name, email).then(function (code) {
                return refresh().then(function () {
                    toast('تم تأكيد حجزك — رقم التذكرة ' + code, 'ok');
                    if (window.MatnCloud.emailTickets && email) {
                        toast('جارٍ إرسال التذكرة إلى بريدك…', 'info');
                        window.MatnCloud.sendTicket(code).then(function () {
                            toast('أُرسلت التذكرة إلى ' + email, 'ok');
                        }).catch(function (e) { toast('لم تُرسل التذكرة: ' + cloudAr(e), 'error'); });
                    }
                });
            }).catch(function (e) { toast(cloudAr(e), 'error'); });
        }
        var code = 'MA-' + rnd(6);
        var salon = load().salon || {};
        var ph = phone || '';
        change(function (st) {
            st.booking = {
                code: code, at: new Date().toISOString(), salonId: salon.id,
                title: salon.title, when: salon.when, where: salon.where, phone: ph
            };
        });
        if (ph) {
            var dd = migrateAll(doc());
            if (dd.authUser && dd.accounts[dd.authUser]) { dd.accounts[dd.authUser].phone = ph; saveDoc(dd); }
        }
        toast('تم تأكيد حجزك — رقم التذكرة ' + code, 'ok');
    }
    function cancelBooking() {
        if (CLOUD) {
            return window.MatnCloud.cancelBooking().then(function () {
                return refresh().then(function () { toast('تم إلغاء الحجز وإعادة المقعد', 'info'); });
            }).catch(function (e) { toast(cloudAr(e), 'error'); });
        }
        var s = load();
        if (!s.booking) return;
        change(function (st) { st.booking = null; });
        toast('تم إلغاء الحجز وإعادة المقعد', 'info');
    }

    /* شحن قسيمة هدية */
    function openGift() {
        if (needsLogin()) { requireLogin('شحن قسيمة الهدية'); return; }
        modal({
            title: 'شحن قسيمة هدية',
            body:
                '<p class="text-xs text-matn-muted leading-relaxed mb-3">أدخل رمز قسيمة الولاء لشحن النقاط إلى محفظتك.</p>' +
                '<label class="matn-field"><span>رمز القسيمة</span><input class="matn-input" id="giftInput" type="text" placeholder="MATN-2026-50" autocomplete="off"></label>' +
                '<p id="giftMsg" class="text-xs mt-1"></p>',
            footer: '<button type="button" class="bg-matn-emerald hover:bg-matn-emeraldLight text-white px-4 py-2.5 rounded-xl text-xs font-bold transition" id="giftGo">شحن الرصيد</button>' + okBtn('إغلاق'),
            ready: function (w) {
                var input = w.querySelector('#giftInput');
                input.focus();
                var go = function () { redeemGift(input.value, w); };
                w.querySelector('#giftGo').addEventListener('click', go);
                input.addEventListener('keydown', function (e) { if (e.key === 'Enter') go(); });
            }
        });
    }
    function redeemGift(raw, w) {
        var code = String(raw || '').trim().toUpperCase();
        var msg = w ? w.querySelector('#giftMsg') : null;
        function fail(t) { if (msg) { msg.textContent = t; msg.className = 'text-xs mt-1 text-red-700'; } else { toast(t, 'error'); } }
        if (!code) { fail('أدخل رمز القسيمة أولاً.'); return; }
        if (CLOUD) {
            window.MatnCloud.redeemGift(code).then(function (pts) {
                return refresh().then(function () { closeModal(); toast('تم شحن ' + num(pts) + ' نقطة إلى محفظتك', 'ok'); });
            }).catch(function (e) { fail(cloudAr(e)); });
            return;
        }
        var s = load();
        var entry = s.giftCodes[code];
        if (!entry) { fail('رمز غير معروف. تأكد من الرمز وحاول مرة أخرى.'); return; }
        if (entry.used) { fail('هذه القسيمة مستخدمة من قبل.'); return; }
        change(function (st) {
            st.giftCodes[code].used = true;
            st.giftCodes[code].at = new Date().toISOString();
            st.user.points += entry.points;
            st.ledger.unshift({ reason: 'شحن قسيمة ' + code, points: entry.points, at: new Date().toISOString() });
        });
        closeModal();
        toast('تم شحن ' + num(entry.points) + ' نقطة إلى محفظتك', 'ok');
    }

    function insufficientModal(p, points) {
        modal({
            title: 'الرصيد لا يكفي',
            body: '<p class="text-xs text-matn-muted leading-relaxed">تحتاج <strong class="text-matn-charcoal">' + num(p.cost - points) + ' نقطة</strong> إضافية للحصول على «' + esc(p.name) + '». رصيدك الحالي <strong class="text-matn-charcoal">' + num(points) + ' نقطة</strong>.</p>',
            footer: okBtn('حسناً')
        });
    }

    function voucherModal(name, code, cost, balance) {
        modal({
            title: 'تم إصدار القسيمة',
            body:
                '<p class="text-xs text-matn-muted leading-relaxed mb-3">احتفظ بالكود وأظهره لدى «' + esc(name) + '».</p>' +
                '<div class="text-center py-2"><span class="matn-code text-xl font-bold">' + esc(code) + '</span></div>' +
                (balance === undefined ? '' : '<p class="text-[11px] text-matn-muted mt-3">خُصم ' + num(cost) + ' نقطة • رصيدك الآن ' + num(balance) + ' نقطة</p>'),
            footer: okBtn('تم')
        });
    }

    /* استبدال نقاط لدى شريك */
    function redeemPartner(id) {
        if (needsLogin()) { requireLogin('استبدال النقاط لدى الشركاء'); return; }
        var s = load();
        var p = null, i;
        for (i = 0; i < s.partners.length; i++) if (s.partners[i].id === id) p = s.partners[i];
        if (!p) return;

        if (CLOUD) {
            if (s.user.points < p.cost) { insufficientModal(p, s.user.points); return; }
            window.MatnCloud.redeemPartner(id).then(function (code) {
                return refresh().then(function () { voucherModal(p.name, code, p.cost, load().user.points); });
            }).catch(function (e) { toast(cloudAr(e), 'error'); });
            return;
        }

        if (s.user.points < p.cost) { insufficientModal(p, s.user.points); return; }
        var code = p.prefix + '-' + rnd(4);
        change(function (st) {
            st.user.points -= p.cost;
            st.vouchers.unshift({ code: code, partner: p.name, cost: p.cost, at: new Date().toISOString() });
            st.ledger.unshift({ reason: 'استبدال لدى ' + p.name, points: -p.cost, at: new Date().toISOString() });
        });
        voucherModal(p.name, code, p.cost, load().user.points);
    }

    /* لوحة الإشراف — إضافة شريك */
    function openAddPartner() {
        if (!needPerm('partners', 'إدارة الشركاء')) return;
        var opts = CATEGORIES.map(function (c, i) { return '<option value="' + i + '">' + esc(c.label) + '</option>'; }).join('');
        modal({
            title: 'إضافة شريك',
            body:
                '<label class="matn-field"><span>اسم الشريك</span><input class="matn-input" id="pName" type="text" placeholder="مثال: مكتبة المدى"></label>' +
                '<label class="matn-field"><span>التصنيف</span><select class="matn-input" id="pCat">' + opts + '</select></label>' +
                '<label class="matn-field"><span>وصف العرض</span><input class="matn-input" id="pDesc" type="text" placeholder="قسيمة خصم 50 ريالاً..."></label>' +
                '<label class="matn-field"><span>تكلفة الاستبدال (نقاط)</span><input class="matn-input" id="pCost" type="number" min="1" step="1" value="100"></label>' +
                '<p id="pMsg" class="text-xs mt-1"></p>',
            footer: '<button type="button" id="pGo" class="bg-matn-emerald hover:bg-matn-emeraldLight text-white px-4 py-2.5 rounded-xl text-xs font-bold transition">إضافة الشريك</button>' + okBtn('إلغاء'),
            ready: function (w) {
                w.querySelector('#pName').focus();
                w.querySelector('#pGo').addEventListener('click', function () {
                    var name = w.querySelector('#pName').value.trim();
                    var cat = parseInt(w.querySelector('#pCat').value, 10) || 0;
                    var desc = w.querySelector('#pDesc').value.trim();
                    var cost = parseInt(w.querySelector('#pCost').value, 10);
                    var msg = w.querySelector('#pMsg');
                    if (!name) { msg.textContent = 'اكتب اسم الشريك.'; msg.className = 'text-xs mt-1 text-red-700'; return; }
                    if (!(cost > 0)) { msg.textContent = 'أدخل تكلفة صحيحة بالنقاط.'; msg.className = 'text-xs mt-1 text-red-700'; return; }
                    var prefix = (name.replace(/[^A-Za-z\u0600-\u06FF]/g, '').slice(0, 3) || 'MAT').toUpperCase();
                    if (/[\u0600-\u06FF]/.test(prefix)) prefix = 'SHK';
                    if (CLOUD) {
                        window.MatnCloud.addPartner({ name: name, tag: cat, desc: desc || 'عرض خاص لأعضاء نادي مَتن.', cost: cost, prefix: prefix })
                            .then(function () { return refresh(); })
                            .then(function () { closeModal(); toast('أُضيف «' + name + '» إلى دليل الشركاء', 'ok'); })
                            .catch(function (e) { msg.textContent = cloudAr(e); msg.className = 'text-xs mt-1 text-red-700'; });
                        return;
                    }
                    change(function (st) {
                        st.partners.push({ id: 'p-' + rnd(6).toLowerCase(), name: name, tag: cat, desc: desc || 'عرض خاص لأعضاء نادي مَتن.', cost: cost, prefix: prefix });
                    });
                    closeModal();
                    toast('أُضيف «' + name + '» إلى دليل الشركاء', 'ok');
                });
            }
        });
    }

    /* لوحة الإشراف — توليد قسيمة شحن */
    function openGenCode() {
        if (!needPerm('codes', 'قسائم الشحن')) return;
        modal({
            title: 'توليد قسيمة شحن',
            body:
                '<label class="matn-field"><span>عدد النقاط</span><input class="matn-input" id="gPoints" type="number" min="1" step="1" value="50"></label>' +
                '<div id="gOut"></div>',
            footer: '<button type="button" id="gGo" class="bg-matn-emerald hover:bg-matn-emeraldLight text-white px-4 py-2.5 rounded-xl text-xs font-bold transition">توليد</button>' + okBtn('إغلاق'),
            ready: function (w) {
                w.querySelector('#gGo').addEventListener('click', function () {
                    var pts = parseInt(w.querySelector('#gPoints').value, 10);
                    if (!(pts > 0)) { return; }
                    if (CLOUD) {
                        window.MatnCloud.generateGiftCode(pts).then(function (code) {
                            return refresh().then(function () {
                                w.querySelector('#gOut').innerHTML =
                                    '<p class="text-xs text-matn-muted mb-2">أُنشئت القسيمة (' + num(pts) + ' نقطة). تُشحن من صفحة محفظة الولاء:</p>' +
                                    '<div class="text-center"><span class="matn-code text-lg font-bold">' + esc(code) + '</span></div>';
                                toast('أُنشئت قسيمة ' + code, 'ok');
                            });
                        }).catch(function (e) { toast(cloudAr(e), 'error'); });
                        return;
                    }
                    var code = 'MATN-2026-' + rnd(4);
                    change(function (st) { st.giftCodes[code] = { points: pts, used: false, at: null }; });
                    w.querySelector('#gOut').innerHTML =
                        '<p class="text-xs text-matn-muted mb-2">أُنشئت القسيمة (' + num(pts) + ' نقطة). تُشحن من صفحة محفظة الولاء:</p>' +
                        '<div class="text-center"><span class="matn-code text-lg font-bold">' + esc(code) + '</span></div>';
                    toast('أُنشئت قسيمة ' + code, 'ok');
                });
            }
        });
    }

    /* لوحة الإشراف — حفظ التسجيل المرئي */
    function saveRecording() {
        if (!needPerm('recording', 'التسجيل المرئي')) return;
        var t = document.getElementById('recTitle');
        var u = document.getElementById('recUrl');
        var msg = document.getElementById('recMsg');
        var url = (u ? u.value : '').trim();
        var title = (t ? t.value : '').trim();
        if (url && !/^(https?:)?\/\//.test(url)) {
            if (msg) { msg.textContent = 'الرابط يجب أن يبدأ بـ http أو https.'; msg.className = 'text-xs mt-1 text-red-700'; }
            return;
        }
        if (CLOUD) {
            return window.MatnCloud.saveRecording(title, url).then(function () {
                return refresh().then(function () {
                    if (msg) { msg.textContent = url ? 'تم الحفظ — افتح صفحة التسجيلات لتشغيله.' : 'تم الحفظ بلا رابط (لا يوجد تسجيل بعد).'; msg.className = 'text-xs mt-1 text-emerald-700'; }
                    toast('تم حفظ بيانات التسجيل', 'ok');
                });
            }).catch(function (e) {
                if (msg) { msg.textContent = cloudAr(e); msg.className = 'text-xs mt-1 text-red-700'; }
            });
        }
        change(function (st) { st.recording = { title: title, url: url }; });
        if (msg) { msg.textContent = url ? 'تم الحفظ — افتح صفحة التسجيلات لتشغيله.' : 'تم الحفظ بلا رابط (لا يوجد تسجيل بعد).'; msg.className = 'text-xs mt-1 text-emerald-700'; }
        toast('تم حفظ بيانات التسجيل', 'ok');
    }

    function playRecording() {
        var s = load();
        var v = document.getElementById('matnVideo');
        if (!s.recording || !s.recording.url) {
            modal({
                title: 'التسجيل المرئي',
                body: '<p class="text-xs text-matn-muted leading-relaxed">لم يُرفَع ملف التسجيل بعد. أضف رابط ملف فيديو مباشر (‎.mp4‎ أو ‎.webm‎) من <a href="admin.html" class="text-matn-emerald font-bold underline">لوحة الإشراف</a> ليعمل المشغّل هنا.</p>',
                footer: okBtn('حسناً')
            });
            return;
        }
        if (v) {
            var ov = document.getElementById('recOverlay');
            if (ov) ov.classList.add('hidden');
            v.classList.remove('hidden');
            v.play();
        }
    }

    /* ======================================================================
       الرسم
       ====================================================================== */
    /* تحديث الحالة: من السحابة إن كانت مضبوطة، وإلا من التخزين المحلي */
    function refresh() {
        if (!CLOUD) { state = null; load(); render(); return Promise.resolve(); }
        return window.MatnCloud.loadAll().then(function (snap) {
            state = snap; persist(); render();
        }).catch(function (e) {
            state = null; load(); render();
            toast(cloudAr(e), 'error');
        });
    }

    function render() {
        var s = load();

        document.querySelectorAll('[data-matn-points]').forEach(function (el) {
            el.textContent = s.signedIn ? (num(s.user.points) + ' نقطة') : 'دخول';
        });
        document.querySelectorAll('[data-matn-points-only]').forEach(function (el) {
            el.textContent = s.signedIn ? num(s.user.points) : '—';
        });
        var acctChip = document.getElementById('acctChip');
        if (acctChip) acctChip.title = s.signedIn ? ('حسابي — ' + (s.user.name || s.user.username)) : 'تسجيل الدخول';

        /* صفحة الحساب */
        var siBox = document.getElementById('acctSignedIn');
        var authBox = document.getElementById('acctAuth');
        if (siBox && authBox) {
            siBox.classList.toggle('hidden', !s.signedIn);
            authBox.classList.toggle('hidden', !!s.signedIn);
            if (s.signedIn) {
                var nEl = siBox.querySelector('[data-acct-name]'); if (nEl) nEl.textContent = s.user.name || '—';
                var uEl = siBox.querySelector('[data-acct-user]'); if (uEl) uEl.textContent = s.user.username || '—';
                var rEl = siBox.querySelector('[data-acct-role]');
                if (rEl) rEl.textContent = s.user.super ? 'المشرف العام' : (s.user.isAdmin ? 'مشرف' : 'عضو');
            }
            var admLink = document.getElementById('acctAdminLink');
            if (admLink) admLink.classList.toggle('hidden', !(s.signedIn && s.user.isAdmin));
        }

        /* بوابة العضوية (المحفظة + لوحة الإشراف) */
        var gate = document.getElementById('gateBox');
        if (gate) {
            var isAdminPage = !!document.getElementById('adminPartnerList');
            var locked = needsLogin() || (isAdminPage && !s.user.isAdmin);
            gate.classList.toggle('hidden', !locked);
            var gTitle = gate.querySelector('h2');
            if (gTitle) gTitle.textContent = (isAdminPage && s.signedIn) ? 'هذه الصفحة للمشرف' : 'هذه الصفحة للأعضاء';
            var claimBox = document.getElementById('gateClaim');
            if (claimBox) {
                var canClaim = !CLOUD && !!isAdminPage && s.signedIn && !s.user.isAdmin && !hasAdmin();
                claimBox.classList.toggle('hidden', !canClaim);
            }
            Array.prototype.forEach.call(gate.parentElement.children, function (ch) {
                if (ch !== gate) ch.classList.toggle('hidden', locked);
            });
        }

        /* الجلسة والحجز */
        document.querySelectorAll('[data-matn-seats]').forEach(function (el) {
            el.textContent = s.seatsLeft > 0 ? ('متبقي ' + num(s.seatsLeft) + ' مقاعد فقط') : 'اكتمل العدد';
        });
        var seatsLine = document.getElementById('seatsLine');
        if (seatsLine) seatsLine.textContent = s.seatsLeft > 0 ? (num(s.seatsLeft) + ' مقاعد فقط') : 'اكتمل العدد';

        var btn = document.getElementById('bookBtn');
        if (btn) {
            if (s.booking) {
                btn.textContent = '✓ مقعدك محجوز — إلغاء الحجز';
                btn.className = 'w-full bg-white hover:bg-matn-cream border border-matn-sand text-matn-charcoal py-3.5 rounded-xl font-bold text-sm shadow-sm transition';
            } else if (s.seatsLeft <= 0) {
                btn.textContent = 'اكتمل عدد المقاعد';
                btn.className = 'w-full bg-matn-muted/40 text-white py-3.5 rounded-xl font-bold text-sm cursor-not-allowed';
            } else {
                btn.textContent = 'تأكيد حجز مقعدي بالصالون مجاناً (مشترك)';
                btn.className = 'w-full bg-matn-emerald hover:bg-matn-emeraldDark text-white py-3.5 rounded-xl font-bold text-sm shadow transition';
            }
        }
        var ticket = document.getElementById('bookingTicket');
        if (ticket) {
            if (s.booking) {
                ticket.classList.remove('hidden');
                ticket.innerHTML =
                    '<div class="p-4 rounded-2xl border border-matn-gold/50 bg-matn-creamDark/60 text-xs space-y-2">' +
                        '<div class="font-bold text-matn-emerald text-sm">✓ مقعدك محجوز</div>' +
                        '<div class="flex justify-between"><span class="text-matn-muted">رقم التذكرة</span><span class="matn-code font-bold">' + esc(s.booking.code) + '</span></div>' +
                        '<div class="flex justify-between"><span class="text-matn-muted">الجلسة</span><strong>' + esc(s.booking.title) + '</strong></div>' +
                        '<div class="flex justify-between"><span class="text-matn-muted">الموعد</span><strong>' + esc(s.booking.when) + '</strong></div>' +
                        '<div class="flex justify-between"><span class="text-matn-muted">المكان</span><strong>' + esc(s.booking.where) + '</strong></div>' +
                        '<div class="flex justify-between"><span class="text-matn-muted">تاريخ الحجز</span><span>' + esc(fmtDate(s.booking.at)) + '</span></div>' +
                    '</div>';
            } else { ticket.classList.add('hidden'); ticket.innerHTML = ''; }
        }
        var idxCta = document.getElementById('indexCardCta');
        if (idxCta) idxCta.textContent = s.booking ? '✓ مقعدك محجوز — عرض التذكرة' : 'تأكيد حجز مقعدك ←';

        /* المحفظة */
        var bal = document.getElementById('walletBalance');
        if (bal) bal.textContent = num(s.user.points) + ' نقطة';
        var led = document.getElementById('ledgerList');
        if (led) {
            led.innerHTML = s.ledger.length
                ? s.ledger.slice(0, 15).map(function (x) {
                    var pos = x.points >= 0;
                    return '<li class="flex justify-between items-center gap-2 py-2 border-b border-matn-sand/60 text-xs">' +
                        '<span>' + esc(x.reason) + '</span>' +
                        '<span class="' + (pos ? 'text-emerald-700' : 'text-red-700') + ' font-bold whitespace-nowrap">' + (pos ? '+' : '') + num(x.points) + ' نقطة</span>' +
                        '</li>';
                }).join('')
                : '<li class="text-xs text-matn-muted py-2">لا توجد عمليات بعد.</li>';
        }
        var vlist = document.getElementById('voucherList');
        if (vlist) {
            vlist.innerHTML = s.vouchers.length
                ? s.vouchers.map(function (v) {
                    return '<li class="flex flex-wrap justify-between items-center gap-2 py-2 border-b border-matn-sand/60 text-xs">' +
                        '<span>' + esc(v.partner) + '</span>' +
                        '<span class="matn-code">' + esc(v.code) + '</span>' +
                        '</li>';
                }).join('')
                : '<li class="text-xs text-matn-muted py-2">لم تستبدل أي قسيمة بعد.</li>';
        }

        /* الشركاء */
        var grid = document.getElementById('partnersGrid');
        if (grid) {
            grid.innerHTML = s.partners.map(function (p) {
                var can = s.user.points >= p.cost;
                return '<div class="bg-white p-5 rounded-2xl border border-matn-sand shadow-sm space-y-3 flex flex-col">' +
                    '<span class="self-start text-[11px] font-bold px-2 py-0.5 rounded ' + catCls(p.tag) + '">' + esc(catLabel(p.tag)) + '</span>' +
                    '<h2 class="font-bold text-base text-matn-charcoal">' + esc(p.name) + '</h2>' +
                    '<p class="text-xs text-matn-muted flex-1">' + esc(p.desc) + '</p>' +
                    '<div class="pt-2 flex justify-between items-center text-xs gap-2">' +
                        '<span class="font-bold text-matn-gold">' + num(p.cost) + ' نقطة</span>' +
                        '<button type="button" data-redeem="' + esc(p.id) + '" class="bg-matn-emerald hover:bg-matn-emeraldLight text-white px-4 py-2.5 rounded-lg font-bold transition' + (can ? '' : ' opacity-60') + '">' + (can ? 'استبدال فوراً' : 'الرصيد لا يكفي') + '</button>' +
                    '</div></div>';
            }).join('');
            grid.querySelectorAll('[data-redeem]').forEach(function (b) {
                b.addEventListener('click', function () { redeemPartner(b.getAttribute('data-redeem')); });
            });
        }

        /* لوحة الإشراف */
        var notice = document.getElementById('adminNotice');
        if (notice) {
            var notAdmin = CLOUD && s.user && s.user.isAdmin === false;
            notice.classList.toggle('hidden', !notAdmin);
            if (notAdmin) {
                notice.innerHTML = 'أنت في الوضع السحابي ولست مشرفتً: الخادم سيرفض إضافة الشركاء وتوليد القسائم وحفظ التسجيل. ' +
                    'لترقية نفسك، نفّذ في Supabase → SQL Editor:<br>' +
                    '<span class="matn-code mt-2">update public.members set is_admin = true<br>where id = (select id from auth.users order by created_at desc limit 1);</span>';
            }
        }
        /* الجلسة القادمة — حقول التعديل وملء الصفحات */
        var salon = s.salon || { title: SESSION.title, when: SESSION.when, where: SESSION.where, facilitator: SESSION.facilitator, capacity: SESSION.seats };
        var seTitle = document.getElementById('seTitle');
        if (seTitle && document.activeElement !== seTitle) {
            seTitle.value = salon.title || '';
            document.getElementById('seWhen').value = salon.when || '';
            document.getElementById('seFac').value = salon.facilitator || '';
            document.getElementById('seWhere').value = salon.where || '';
            document.getElementById('seCap').value = salon.capacity || 6;
        }
        document.querySelectorAll('[data-session-title]').forEach(function (el) { if (salon.title) el.textContent = salon.title; });
        document.querySelectorAll('[data-session-when]').forEach(function (el) { if (salon.when) el.textContent = salon.when; });
        document.querySelectorAll('[data-session-where]').forEach(function (el) { if (salon.where) el.textContent = salon.where; });
        document.querySelectorAll('[data-session-facilitator]').forEach(function (el) { if (salon.facilitator) el.textContent = salon.facilitator; });
        document.querySelectorAll('[data-session-mode]').forEach(function (el) { el.textContent = modeLabel(salon.mode); });

        /* عدّاد تنازلي عام على بطاقة الصالون — يراه الجميع */
        document.querySelectorAll('[data-session-countdown]').forEach(function (el) {
            var cd = countdown(salon.startsAt);
            if (!cd) { el.classList.add('hidden'); el.removeAttribute('data-at'); return; }
            el.classList.remove('hidden');
            el.setAttribute('data-at', salon.startsAt);
            el.textContent = cdLabel(cd);
        });

        /* تذكير الموعد — للمحجوزين في هذا الصالون فقط */
        var rb = document.getElementById('remindBox');
        if (rb) {
            var bs = bookedSalon();
            var cd = bs ? countdown(bs.startsAt) : null;
            var isMine = !!s.booking && !!bs && s.booking.salonId === bs.id;
            var slink = bs ? safeUrl(bs.link) : '';
            if (s.signedIn && isMine && cd) {
                rb.classList.remove('hidden');
                var tone = cd.started ? 'border-matn-emerald bg-emerald-50' : (cd.soon ? 'border-amber-300 bg-amber-50' : 'border-matn-sand bg-matn-cream');
                rb.innerHTML = '<div class="p-4 rounded-2xl border text-xs space-y-3 ' + tone + '">' +
                        '<div class="flex flex-wrap items-center justify-between gap-2">' +
                            '<div class="font-bold text-matn-emerald text-sm">⏰ تذكير بموعد المجلس</div>' +
                            '<div class="font-bold" data-countdown data-at="' + esc(bs.startsAt) + '"><span data-countdown-text>' + esc(cd.text) + '</span></div>' +
                        '</div>' +
                        '<div class="text-matn-muted leading-relaxed">' + esc(bs.title) + ' — ' + esc(fmtDateTime(bs.startsAt)) +
                            ' · يصلك التنبيه ' + remindLabel(bs.reminderMin || 60) + '.' + (slink ? ' ورابط المجلس جاهز بالأسفل ↓' : '') + '</div>' +
                        waRemindRow(bs)
                        '<div class="flex flex-wrap gap-2">' +
                            '<button type="button" data-action="remind-ics" class="bg-matn-emerald hover:bg-matn-emeraldLight text-white px-4 py-2.5 rounded-xl text-xs font-bold transition">أضف التذكير إلى تقويمي (‎.ics‎)</button>' +
                            '<a href="' + esc(gcalUrl(bs, slink)) + '" target="_blank" rel="noopener" class="bg-white border border-matn-sand hover:border-matn-gold px-4 py-2.5 rounded-xl text-xs font-bold transition">أضف إلى Google Calendar</a>' +
                            '<button type="button" data-action="remind-notify" class="bg-white border border-matn-sand hover:border-matn-gold px-4 py-2.5 rounded-xl text-xs font-bold transition">نشّطني في المتصفح</button>' +
                        '</div>' +
                        '<div class="text-[10px] text-matn-muted leading-relaxed">التذكير في التقويم يعمل من جوالك حتى بدون فتح الموقع. «نشّطني في المتصفح» يحتاج إبقاء الصفحة مفتوحة.</div>' +
                    '</div>';
            } else {
                rb.classList.add('hidden');
                rb.innerHTML = '';
            }
        }

        /* رابط المجلس — للمحجوزين في هذا الصالون فقط */
        var meet = document.getElementById('meetBox');
        if (meet) {
            var link = safeUrl(salon.link);
            var mine = !!s.booking && s.booking.salonId === salon.id;
            var showLink = s.signedIn && mine && !!link && salon.mode !== 'in-person';
            if (showLink) {
                meet.classList.remove('hidden');
                meet.innerHTML = '<div class="p-4 rounded-2xl border border-matn-emerald/40 bg-emerald-50 text-xs space-y-2">' +
                        '<div class="font-bold text-matn-emerald text-sm">🔗 رابط المجلس عن بعد</div>' +
                        '<p class="text-matn-muted leading-relaxed">هذا الرابط خاص بالمحجوزين في هذا الصالون فقط — لا تشاركه.</p>' +
                        '<a href="' + esc(link) + '" target="_blank" rel="noopener" class="inline-block bg-matn-emerald hover:bg-matn-emeraldLight text-white px-4 py-2.5 rounded-xl text-xs font-bold transition">افتح رابط الاجتماع ↗</a>' +
                        '<div class="matn-code text-[10px] break-all">' + esc(link) + '</div>' +
                    '</div>';
            } else {
                meet.classList.add('hidden');
                meet.innerHTML = '';
            }
        }

        /* لوحة الإشراف — أرقام حيّة وقوائم */
        var statMembers = document.getElementById('statMembers');
        if (statMembers) {
            var D = doc();
            var users = Object.keys(D.accounts);
            var bookedUsers = users.filter(function (u) { return D.accounts[u].booking; });
            var spentTotal = 0;
            users.forEach(function (u) {
                (D.accounts[u].vouchers || []).forEach(function (v) { spentTotal += v.cost; });
            });
            statMembers.textContent = num(users.length);
            var sb = document.getElementById('statBookings'); if (sb) sb.textContent = num(bookedUsers.length);
            var spp = document.getElementById('statPartners'); if (spp) spp.textContent = num(s.partners.length);
            var ss = document.getElementById('statSpent'); if (ss) ss.textContent = num(spentTotal);
            var sc = document.getElementById('statCapacity'); if (sc) sc.textContent = num(salon.capacity || 6);

            var ml = document.getElementById('adminMemberList');
            if (ml) {
                ml.innerHTML = users.length ? users.map(function (u) {
                    var a = D.accounts[u];
                    var role = a.super ? 'المشرف العام' : ((a.perms && a.perms.length) ? 'مدير' : 'عضو');
                    var roleCls = a.super ? 'bg-matn-gold/25 text-matn-emerald' : ((a.perms && a.perms.length) ? 'bg-emerald-100 text-emerald-800' : 'bg-matn-creamDark text-matn-muted');
                    return '<li class="flex flex-wrap justify-between items-center gap-2 py-3 border-b border-matn-sand/60">' +
                        '<span><strong>' + esc(a.name) + '</strong> <span class="text-matn-muted">@' + esc(u) + '</span>' +
                        ' <span class="text-[10px] font-bold px-1.5 py-0.5 rounded ' + roleCls + '">' + role + '</span></span>' +
                        '<span class="flex flex-wrap items-center gap-3">' +
                            '<span class="font-bold text-matn-emerald">' + num(a.points) + ' نقطة</span>' +
                            '<button type="button" data-grant="' + esc(u) + '" class="text-matn-emerald font-bold hover:underline">منح / خصم</button>' +
                            (a.booking ? '<button type="button" data-cxl="' + esc(u) + '" class="text-matn-muted font-bold hover:underline">إلغاء الحجز</button>' : '') +
                            '<button type="button" data-rp="' + esc(u) + '" class="text-matn-muted font-bold hover:underline">كلمة مرور</button>' +
                            (a.phone ? '<a href="' + esc(waLink(a.phone, reminderText(salon))) + '" target="_blank" rel="noopener" class="text-[#128C7E] font-bold hover:underline">واتساب</a>' : '<span class="text-matn-muted text-[10px]">بلا رقم</span>') +
                            (a.super ? '' : '<button type="button" data-del="' + esc(u) + '" class="text-red-700 font-bold hover:underline">حذف</button>') +
                        '</span>' +
                        '<div class="w-full flex flex-wrap items-center gap-2 mt-2">' +
                            (a.super
                                ? '<span class="text-[11px] text-matn-muted">كل الصلاحيات — لا تُسحب من المشرف العام.</span>'
                                : PERMS.map(function (p) {
                                    var on = (a.perms || []).indexOf(p.key) !== -1;
                                    return '<button type="button" data-perm="' + esc(p.key) + '" data-uname="' + esc(u) + '" class="px-2 py-1 rounded-lg border text-[11px] font-bold transition ' +
                                        (on ? 'bg-matn-emerald text-white border-matn-emerald' : 'bg-white text-matn-muted border-matn-sand hover:border-matn-gold') + '">' +
                                        (on ? '✓ ' : '+ ') + p.label + '</button>';
                                }).join('') +
                                ' <button type="button" data-allperm="1" data-uname="' + esc(u) + '" class="px-2 py-1 rounded-lg border border-matn-gold text-matn-emerald text-[11px] font-bold transition">جعله مديراً</button>' +
                                '<button type="button" data-allperm="0" data-uname="' + esc(u) + '" class="px-2 py-1 rounded-lg border border-matn-sand text-red-700 text-[11px] font-bold transition">سحب الكل</button>') +
                        '</div></li>';
                }).join('') : '<li class="text-matn-muted py-2">لا يوجد أعضاء مسجّلون بعد.</li>';
                ml.querySelectorAll('[data-perm]').forEach(function (b) {
                    b.addEventListener('click', function () { togglePerm(b.getAttribute('data-uname'), b.getAttribute('data-perm')); });
                });
                ml.querySelectorAll('[data-allperm]').forEach(function (b) {
                    b.addEventListener('click', function () { setAllPerms(b.getAttribute('data-uname'), b.getAttribute('data-allperm') === '1'); });
                });
                ml.querySelectorAll('[data-grant]').forEach(function (b) {
                    b.addEventListener('click', function () { grantPoints(b.getAttribute('data-grant')); });
                });
                ml.querySelectorAll('[data-tgadmin]').forEach(function (b) {
                    b.addEventListener('click', function () { toggleAdmin(b.getAttribute('data-tgadmin')); });
                });
                ml.querySelectorAll('[data-cxl]').forEach(function (b) {
                    b.addEventListener('click', function () { cancelBookingFor(b.getAttribute('data-cxl')); });
                });
                ml.querySelectorAll('[data-rp]').forEach(function (b) {
                    b.addEventListener('click', function () { resetPassword(b.getAttribute('data-rp')); });
                });
                ml.querySelectorAll('[data-del]').forEach(function (b) {
                    b.addEventListener('click', function () { removeMember(b.getAttribute('data-del')); });
                });
            }

            var bl = document.getElementById('adminBookingList');
            if (bl) {
                var rows = bookedUsers.map(function (u) {
                    var a = D.accounts[u], b = a.booking;
                    var wl = waLink(a.phone, reminderText(salonById(D, b.salonId) || salon));
                    return '<li class="flex flex-wrap justify-between items-center gap-2 py-3 border-b border-matn-sand/60">' +
                        '<span><strong>' + esc(a.name) + '</strong> <span class="text-matn-muted">@' + esc(u) + '</span>' +
                            (a.phone ? ' <span class="text-[10px] text-matn-muted" dir="ltr">' + esc(a.phone) + '</span>' : ' <span class="text-[10px] text-red-700">بلا رقم</span>') + '</span>' +
                        '<span class="flex flex-wrap items-center gap-3">' +
                            '<span class="matn-code">' + esc(b.code) + '</span>' +
                            '<span class="text-matn-muted">' + esc(fmtDate(b.at)) + '</span>' +
                            (wl ? '<a href="' + esc(wl) + '" target="_blank" rel="noopener" class="bg-[#25D366] text-white px-2.5 py-1.5 rounded-lg font-bold">تذكير واتساب</a>' : '') +
                        '</span></li>';
                });
                bl.innerHTML = rows.length ? rows.join('') : '<li class="text-matn-muted py-2">لا توجد حجوزات بعد.</li>';
            }

            /* بطاقة المشرف العام */
            var ident = document.getElementById('adminIdentity');
            if (ident) {
                var supU = users.filter(function (u) { return D.accounts[u].super; })[0] ||
                           users.filter(function (u) { return D.accounts[u].isAdmin; })[0];
                var supA = supU ? D.accounts[supU] : null;
                var adminsCount = users.filter(function (u) { return D.accounts[u].isAdmin; }).length;
                ident.innerHTML =
                    '<div class="flex flex-wrap items-center justify-between gap-4">' +
                        '<div>' +
                            '<div class="text-[11px] text-matn-goldLight font-bold tracking-widest">المشرف العام</div>' +
                            '<div class="font-amiri text-2xl font-bold mt-1">' + esc(supA ? supA.name : 'لا يوجد بعد') + '</div>' +
                            '<div class="text-xs text-white/70 mt-1">' + (supU ? ('@' + esc(supU) + ' · صلاحية كاملة على كل مزايا اللوحة') : 'أنشئ حساباً لتثبيت المشرف العام') + '</div>' +
                        '</div>' +
                        '<div class="text-center">' +
                            '<div class="text-[11px] text-white/70">المشرفون</div>' +
                            '<div class="font-amiri text-3xl font-bold">' + num(adminsCount) + '</div>' +
                        '</div>' +
                    '</div>' +
                    (s.signedIn && s.user.isAdmin
                        ? '<div class="mt-4 text-xs bg-white/10 rounded-2xl px-4 py-3 leading-relaxed">تدير الموقع الآن بحساب المشرف العام — <strong>' + esc(s.user.name || s.user.username) + '</strong>. كل عمليات اللوحة متاحة لك.</div>'
                        : '');
            }

            /* شبكة كل المزايا */
            var feats = document.getElementById('adminFeatures');
            if (feats) {
                var list = [
                    ['الصالونات', 'إضافة صالون · تعديله · حذفه · تعيين الجلسة القادمة', 'sec-salons', 'salons'],
                    ['الأعضاء', 'إضافة عضو · منح وسحب الصلاحيات · نقاط · كلمة مرور · حذف', 'sec-members', 'members'],
                    ['الحجوزات', 'كل حجز باسم صاحبه ورقم تذكرته وتاريخه', 'sec-bookings', 'bookings'],
                    ['الشركاء', 'إضافة شريك أو حذفه من دليل الشركاء', 'sec-partners', 'partners'],
                    ['قسائم الشحن', 'توليد قسيمة شحن ونشرها للأعضاء', 'sec-codes', 'codes'],
                    ['التسجيل المرئي', 'عنوان التسجيل ورابط ملف الفيديو', 'sec-recording', 'recording']
                ];
                feats.innerHTML = list.filter(function (f) { return can(f[3]); }).map(function (f) {
                    return '<a href="#' + f[2] + '" class="block bg-matn-cream border border-matn-sand rounded-2xl p-4 hover:border-matn-gold transition">' +
                        '<div class="font-bold text-sm text-matn-emerald">' + f[0] +
                            ' <span class="text-[10px] font-bold bg-emerald-100 text-emerald-800 px-1.5 py-0.5 rounded">متاح ✓</span></div>' +
                        '<div class="text-[11px] text-matn-muted mt-1 leading-relaxed">' + f[1] + '</div></a>';
                }).join('') || '<p class="text-xs text-matn-muted">لا تملك أي صلاحيات إدارية — اطلبها من المشرف العام.</p>';
            }
        }

        var spent = document.getElementById('statSpent');
        if (spent && !statMembers) spent.textContent = num(s.vouchers.reduce(function (a, v) { return a + v.cost; }, 0));
        var ap = document.getElementById('adminPartnerList');
        if (ap) {
            ap.innerHTML = s.partners.map(function (p) {
                return '<li class="flex flex-wrap justify-between items-center gap-2 py-2 border-b border-matn-sand/60 text-xs">' +
                    '<span>' + esc(p.name) + ' <span class="text-matn-muted">(' + num(p.cost) + ' نقطة)</span></span>' +
                    '<button type="button" data-delpartner="' + esc(p.id) + '" class="text-red-700 font-bold hover:underline">حذف</button>' +
                    '</li>';
            }).join('');
            ap.querySelectorAll('[data-delpartner]').forEach(function (b) {
                b.addEventListener('click', function () { removePartner(b.getAttribute('data-delpartner')); });
            });
        }
        var ac = document.getElementById('adminCodeList');
        if (ac) {
            var keys = Object.keys(s.giftCodes);
            ac.innerHTML = keys.length ? keys.map(function (k) {
                var g = s.giftCodes[k];
                return '<li class="flex flex-wrap justify-between items-center gap-2 py-2 border-b border-matn-sand/60 text-xs">' +
                    '<span class="matn-code">' + esc(k) + '</span>' +
                    '<span>' + num(g.points) + ' نقطة — ' + (g.used ? '<span class="text-red-700 font-bold">مستخدمة</span>' : '<span class="text-emerald-700 font-bold">متاحة</span>') + '</span>' +
                    '</li>';
            }).join('') : '<li class="text-xs text-matn-muted py-2">لا توجد قسائم.</li>';
        }
        var rt = document.getElementById('recTitle');
        var ru = document.getElementById('recUrl');
        if (rt && document.activeElement !== rt) rt.value = (s.recording && s.recording.title) || '';
        if (ru && document.activeElement !== ru) ru.value = (s.recording && s.recording.url) || '';

        /* التسجيلات */
        var v = document.getElementById('matnVideo');
        if (v) {
            var has = !!(s.recording && s.recording.url);
            if (has) { v.setAttribute('src', s.recording.url); }
            var note = document.getElementById('recNote');
            if (note) note.hidden = has;
            var h1 = document.getElementById('recHeading');
            if (h1 && s.recording.title) h1.textContent = s.recording.title;
        }

        /* الصالونات */
        renderSalons(s);

        /* إظهار الأقسام حسب صلاحيات المستخدم — بعد منطق البوابة ليكون هو الفصل */
        document.querySelectorAll('[data-need-perm]').forEach(function (el) {
            el.classList.toggle('hidden', !can(el.getAttribute('data-need-perm')));
        });
    }

    /* قائمة الصالونات في اللوحة */
    function renderSalons(s) {
        var sl = document.getElementById('adminSalonList');
        if (!sl) return;
        var d = doc();
        var list = s.salons || [];
        sl.innerHTML = list.length ? list.map(function (x) {
            var tk = takenOf(d, x.id);
            return '<li class="border border-matn-sand rounded-2xl p-4 ' + (x.featured ? 'bg-matn-creamDark' : 'bg-white') + '">' +
                '<div class="flex flex-wrap items-start justify-between gap-3">' +
                    '<div class="min-w-0">' +
                        '<div class="font-bold text-sm">' + esc(x.title) +
                            (x.featured ? ' <span class="text-[10px] font-bold bg-matn-gold/25 text-matn-emerald px-1.5 py-0.5 rounded">الجلسة القادمة</span>' : '') + '</div>' +
                        '<div class="text-[11px] text-matn-muted mt-1">' + esc(x.when || '—') + ' • ' + esc(x.where || '—') + '</div>' +
                        '<div class="text-[11px] text-matn-muted mt-0.5">الميسّر: ' + esc(x.facilitator || '—') + ' · المحجوز: ' + num(tk) + ' من ' + num(x.capacity || 0) + '</div>' +
                        '<div class="text-[11px] mt-0.5"><span class="font-bold text-matn-emerald">' + modeLabel(x.mode) + '</span>' +
                            (safeUrl(x.link) ? ' · <span class="text-matn-muted">رابط الاجتماع محفوظ (يراه المحجوزون فقط)</span>' : ' · <span class="text-matn-muted">لا يوجد رابط اجتماع</span>') + '</div>' +
                        '<div class="text-[11px] mt-0.5 text-matn-muted">' + (x.startsAt
                            ? ('⏰ ' + esc(fmtDateTime(x.startsAt)) + ' · يصلك التنبيه ' + remindLabel(x.reminderMin || 60))
                            : '<span class="text-amber-700 font-bold">⚠ لم تُحدَّد اليوم والساعة — لا عدّاد ولا تذكير</span>') + '</div>' +
                    '</div>' +
                    '<div class="flex flex-wrap items-center gap-3 text-xs">' +
                        '<button type="button" data-salon-edit="' + esc(x.id) + '" class="text-matn-emerald font-bold hover:underline">تعديل</button>' +
                        (x.featured ? '' : '<button type="button" data-salon-feature="' + esc(x.id) + '" class="text-matn-muted font-bold hover:underline">تعيين كقادم</button>') +
                        '<button type="button" data-salon-del="' + esc(x.id) + '" class="text-red-700 font-bold hover:underline">حذف</button>' +
                    '</div>' +
                '</div></li>';
        }).join('') : '<li class="text-matn-muted py-2">لا توجد صالونات.</li>';
        sl.querySelectorAll('[data-salon-edit]').forEach(function (b) {
            b.addEventListener('click', function () { salonForm(b.getAttribute('data-salon-edit')); });
        });
        sl.querySelectorAll('[data-salon-feature]').forEach(function (b) {
            b.addEventListener('click', function () { setFeaturedSalon(b.getAttribute('data-salon-feature')); });
        });
        sl.querySelectorAll('[data-salon-del]').forEach(function (b) {
            b.addEventListener('click', function () { deleteSalon(b.getAttribute('data-salon-del')); });
        });
    }

    function removePartner(id) {
        var s = load();
        var p = null, i;
        for (i = 0; i < s.partners.length; i++) if (s.partners[i].id === id) p = s.partners[i];
        if (!p) return;
        modal({
            title: 'حذف شريك',
            body: '<p class="text-xs text-matn-muted leading-relaxed">سيُحذف «' + esc(p.name) + '» من دليل الشركاء. القسائم التي استُبدلت سابقاً تبقى محفوظة.</p>',
            footer: '<button type="button" id="delGo" class="bg-red-700 hover:bg-red-800 text-white px-4 py-2.5 rounded-xl text-xs font-bold transition">حذف</button>' + okBtn('إلغاء'),
            ready: function (w) {
                w.querySelector('#delGo').addEventListener('click', function () {
                    if (CLOUD) {
                        window.MatnCloud.removePartner(id).then(function () { return refresh(); })
                            .then(function () { closeModal(); toast('حُذف «' + p.name + '»', 'info'); })
                            .catch(function (e) { toast(cloudAr(e), 'error'); });
                        return;
                    }
                    change(function (st) { st.partners = st.partners.filter(function (x) { return x.id !== id; }); });
                    closeModal();
                    toast('حُذف «' + p.name + '»', 'info');
                });
            }
        });
    }

    /* ======================================================================
       الربط
       ====================================================================== */
    document.addEventListener('click', function (e) {
        var el = e.target.closest('[data-action]');
        if (!el) return;
        var a = el.getAttribute('data-action');
        if (a === 'book') { load().booking ? cancelBooking() : bookSeat(); }
        else if (a === 'gift') openGift();
        else if (a === 'add-partner') openAddPartner();
        else if (a === 'generate-code') openGenCode();
        else if (a === 'play-recording') playRecording();
        else if (a === 'save-recording') saveRecording();
        else if (a === 'add-salon') salonForm(null);
        else if (a === 'add-member') addMemberForm();
        else if (a === 'remind-ics') { var bs1 = bookedSalon(); if (bs1) downloadICS(bs1, safeUrl(bs1.link)); }
        else if (a === 'remind-notify') armBrowserReminder();
        else if (a === 'save-phone') saveMyPhone();
        else if (a === 'edit-phone') {
            var d0 = migrateAll(doc()); var u0 = d0.authUser;
            if (u0 && d0.accounts[u0]) { d0.accounts[u0].phone = ''; saveDoc(d0); refresh(); }
        }
        else if (a === 'copy-reminder') copyReminder();
        else if (a === 'claim-admin') claimSuperAdmin();
        else if (a === 'signout') standaloneSignOut();
    });

    /* ---------- ربط صفحة الحساب ---------- */
    function standaloneSignOut() {
        signOut();
        window.setTimeout(function () { window.location.href = 'index.html'; }, 500);
    }

    function wireAccountPage() {
        var li = document.getElementById('loginForm');
        if (li) li.addEventListener('submit', function (e) {
            e.preventDefault();
            var msg = document.getElementById('liMsg');
            msg.textContent = 'جارٍ التحقق…'; msg.className = 'text-xs text-matn-muted';
            signIn(document.getElementById('liUser').value, document.getElementById('liPass').value)
                .then(function (acc) {
                    toast('مرحباً ' + acc.name, 'ok');
                    window.setTimeout(function () { window.location.href = 'index.html'; }, 700);
                })
                .catch(function (err) { msg.textContent = authMsg(err); msg.className = 'text-xs text-red-700'; });
        });

        var rg = document.getElementById('regForm');
        if (rg) rg.addEventListener('submit', function (e) {
            e.preventDefault();
            var msg = document.getElementById('rgMsg');
            var p = document.getElementById('rgPass').value;
            if (p !== document.getElementById('rgPass2').value) {
                msg.textContent = 'كلمتا المرور غير متطابقتين.'; msg.className = 'text-xs text-red-700'; return;
            }
            msg.textContent = 'جارٍ إنشاء الحساب…'; msg.className = 'text-xs text-matn-muted';
            createAccount(document.getElementById('rgUser').value, document.getElementById('rgName').value, p)
                .then(function (acc) {
                    toast('أُنشئ حسابك — مرحباً ' + acc.name, 'ok');
                    window.setTimeout(function () { window.location.href = 'wallet.html'; }, 700);
                })
                .catch(function (err) { msg.textContent = authMsg(err); msg.className = 'text-xs text-red-700'; });
        });
    }

    function boot() { wireAccountPage(); refresh(); }

    /* تحديث العدّ التنازلي حيّاً بلا إعادة رسم (كي لا يُفسد ما يكتبه المستخدم) */
    window.setInterval(function () {
            var els = document.querySelectorAll('[data-countdown], [data-session-countdown]');
        for (var i = 0; i < els.length; i++) {
            var at = els[i].getAttribute('data-at');
            if (!at) continue;
            var cd = countdown(at);
            if (!cd) continue;
            if (els[i].hasAttribute('data-session-countdown')) { els[i].textContent = cdLabel(cd); continue; }
            var t = els[i].querySelector('[data-countdown-text]');
            if (t) t.textContent = cd.text; else els[i].textContent = cd.text;
        }
    }, 30000);

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', boot);
    } else { boot(); }
})();
