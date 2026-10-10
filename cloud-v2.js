/* ==========================================================================
   matn cloud sync v2 — مزامنة كاملة لمحتوى موقع نادي مَتن عبر Supabase
   --------------------------------------------------------------------------
   المبدأ: app.js يبقى يعمل على localStorage كما هو (بلا إعادة كتابة).
   هذه الطبقة:
     1) تسحب الحالة من السحابة وتكتبها في localStorage **قبل** أول رسم.
     2) تدفع الفروق بعد كل saveDoc (تُستهان 500ms).
     3) تسحب دورياً كل 20 ثانية وعند رجوع الصفحة للمقدمة، ثم تُعيد الرسم.
   إن كانت url/anonKey فارغة → لا تفعل شيئاً والموقع محلي 100%.
   ========================================================================== */
(function () {
    'use strict';

    var CFG = window.MATN_CLOUD || {};
    var KEY = 'matn_state_v2';           // نفس مفتاح app.js
    var SB_KEY = 'matn_sb';              // جلسة Supabase على هذا الجهاز
    var POLL_MS = (CFG.pollMs || 20000);
    var PUSH_DEBOUNCE = 500;

    /* المفاتيح العامة (يراها الجميع) — تُخزَّن في matn_site */
    var SITE_KEYS = ['salons', 'branches', 'book', 'partners', 'headerAd', 'points', 'badWords',
                     'live', 'recording', 'seatsLeft', 'pay'];
    /* المفاتيح الإدارية (المشرف فقط) — matn_admin */
    var ADMIN_KEYS = ['giftCodes'];

    var SES = null;          // جلسة Supabase
    var ME = null;           // {username, uid, isAdmin, super}
    var UID_OF = {};         // username -> uid (من الملفات المسحوبة)
    var PROFILES = [];       // صفوف الملفات كما سُحبت
    var SHADOW = null;       // آخر حالة متزامنة (لكشف الفروق)
    var READY_RESOLVE = null;
    var pushing = false, dirtyDoc = null, pushTimer = null, tickTimer = null;
    var LAST = { state: 'off', at: 0, msg: '' };
    var LAST_ERR = '', ASSEMBLED = 0, PROF_AT_ASSEMBLE = -1, SEED_RUNS = 0;

    /* ------------------------------- أدوات ------------------------------- */
    function configured() { return !!(CFG && CFG.url && CFG.anonKey); }
    function base() { return String(CFG.url || '').replace(/\/+$/, ''); }
    function nowISO() { return new Date().toISOString(); }
    function clone(o) { try { return JSON.parse(JSON.stringify(o)); } catch (e) { return null; } }
    function sameRows(a, b) { try { return JSON.stringify(a) === JSON.stringify(b); } catch (e) { return false; } }
    function pick(o, keys) { var r = {}; keys.forEach(function (k) { if (o && Object.prototype.hasOwnProperty.call(o, k)) r[k] = o[k]; }); return r; }
    function readDoc() { try { return JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (e) { return null; } }
    function writeDoc(d) { try { localStorage.setItem(KEY, JSON.stringify(d)); return true; } catch (e) { return false; } }
    function sha() { /* غير مستخدم */ }
    function uid4() {
        try { if (window.crypto && crypto.randomUUID) return crypto.randomUUID(); } catch (e) {}
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
            var r = Math.random() * 16 | 0; return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
        });
    }
    function appToast(msg, kind) {
        try { if (window.MATN_APP && window.MATN_APP.toast) window.MATN_APP.toast(msg, kind); } catch (e) {}
    }
    function afterSync() {
        try { if (window.MATN_APP && window.MATN_APP.afterSync) { window.MATN_APP.afterSync(); return; } } catch (e) {}
        try { location.reload(); } catch (e) {}
    }
    function setStatus(state, msg) { LAST = { state: state, at: Date.now(), msg: msg || '' }; }

    /* ------------------------------ الجلسة ------------------------------ */
    function loadSes() {
        if (SES) return SES;
        try { SES = JSON.parse(localStorage.getItem(SB_KEY) || 'null'); } catch (e) { SES = null; }
        return SES;
    }
    function saveSes(j) {
        var u = (j && j.user) || {};
        SES = {
            access_token: j.access_token,
            refresh_token: j.refresh_token,
            expires_at: Date.now() + ((j.expires_in || 3600) * 1000),
            uid: u.id || (SES && SES.uid) || null,
            username: (u.user_metadata && u.user_metadata.username) || (SES && SES.username) || null,
            email: u.email || null
        };
        try { localStorage.setItem(SB_KEY, JSON.stringify(SES)); } catch (e) {}
        return SES;
    }
    function clearSes() { SES = null; try { localStorage.removeItem(SB_KEY); } catch (e) {} }
    function needRefresh() { var s = loadSes(); return !s || !s.access_token || (s.expires_at && s.expires_at - Date.now() < 90000); }

    function refreshSession() {
        var s = loadSes();
        if (!s || !s.refresh_token) return Promise.resolve(null);
        return raw('POST', '/auth/v1/token?grant_type=refresh_token', { body: { refresh_token: s.refresh_token }, auth: false })
            .then(function (r) { return r.ok && r.j && r.j.access_token ? saveSes(r.j) : (clearSes(), null); })
            .catch(function () { return null; });
    }
    function ensureSession() {
        var s = loadSes();
        if (!s || !s.access_token) return Promise.resolve(null);
        if (!needRefresh()) return Promise.resolve(s);
        return refreshSession();
    }

    /* ------------------------------ الشبكة ------------------------------ */
    function raw(method, path, opt) {
        opt = opt || {};
        var h = { 'Content-Type': 'application/json', apikey: CFG.anonKey };
        if (opt.prefer) h.Prefer = opt.prefer;
        var s = loadSes();
        if (opt.auth !== false) h.Authorization = 'Bearer ' + ((s && s.access_token) ? s.access_token : CFG.anonKey);
        var init = { method: method, headers: h };
        if (opt.body !== undefined) init.body = JSON.stringify(opt.body);
        return fetch(base() + path, init).then(function (res) {
            return res.text().then(function (t) {
                var j = null; try { j = t ? JSON.parse(t) : null; } catch (e) { j = null; }
                return { ok: res.ok, status: res.status, j: j };
            });
        }, function (e) {
            return { ok: false, status: 0, j: null, netErr: true };
        });
    }
    var REQLOG = [];
    function restGet(table, query) {
        return raw('GET', '/rest/v1/' + table + (query ? '?' + query : '')).then(function (r) {
            var n = Array.isArray(r.j) ? r.j.length : (r.j ? 1 : 0);
            REQLOG.push(table + ':' + r.status + ':' + n);
            if (REQLOG.length > 60) REQLOG.shift();
            if (!r.ok) { if (r.status === 403 || r.status === 401) return []; throw new Error('GET ' + table + ' ' + r.status); }
            return Array.isArray(r.j) ? r.j : (r.j ? [r.j] : []);
        });
    }
    function restWrite(method, table, query, body) {
        var prefer = 'return=representation';
        if (method === 'POST') prefer += ',resolution=merge-duplicates';
        return raw(method, '/rest/v1/' + table + (query ? '?' + query : ''), { method: method, body: body, prefer: prefer });
    }

    /* ============================ تحويلات الصفوف ============================ */
    function rowProfile(u, a, iAmAdmin) {
        var r = { name: a.name || u, avatar: a.avatar || '', thanks1k: !!a.thanks1k };
        if (iAmAdmin) {
            r.points = Number(a.points) || 0;
            r.minutes = Number(a.minutes) || 0;
            r.is_admin = !!a.isAdmin;
            r.super = !!a.super;
            r.suspended = !!a.suspended;
        }
        return r;
    }
    function rowMember(a) { return { bookings: a.bookings || {}, ledger: a.ledger || [], vouchers: a.vouchers || [] }; }
    function rowsDiary(u, a) {
        return ((a && a.diary) || []).map(function (e) {
            return { id: String(e.id), uid: UID_OF[u] || null, username: u, text: e.text || '', at: e.at || nowISO(), is_public: e.public !== false, edited: !!e.edited };
        });
    }
    function rowsComments(u, a) {
        var out = [];
        ((a && a.diary) || []).forEach(function (e) {
            (e.comments || []).forEach(function (c) {
                out.push({
                    id: String(c.id), diary_id: String(e.id), uid: UID_OF[c.user] || null, username: c.user || '',
                    name: c.name || '', text: c.text || '', at: c.at || nowISO(),
                    approved: !!c.approved, reported: Number(c.reported) || 0, hide: !!c.hide
                });
            });
        });
        return out;
    }
    function rowsRatings(u, a) {
        var out = [];
        ((a && a.diary) || []).forEach(function (e) {
            Object.keys(e.ratings || {}).forEach(function (who) {
                var stars = Number(e.ratings[who]) || 0;
                if (!stars) return;
                out.push({ diary_id: String(e.id), uid: UID_OF[who] || null, stars: stars, at: nowISO(), _who: who });
            });
        });
        return out;
    }
    function rowsPosts(d) {
        return (d.posts || []).map(function (p) {
            return { id: String(p.id), topic: p.topic || 'book', uid: UID_OF[p.user] || null, username: p.user || '',
                     name: p.name || '', text: p.text || '', at: p.at || nowISO(), poll_id: p.pollId || null };
        });
    }
    function rowsPolls(d) {
        return (d.polls || []).map(function (p) {
            return { id: String(p.id), question: p.question || '', options: p.options || [], open: p.open !== false,
                     start_at: p.startAt || null, end_at: p.endAt || null, at: p.at || nowISO() };
        });
    }
    function rowsVotes(d) {
        var out = [];
        (d.polls || []).forEach(function (p) {
            Object.keys(p.votes || {}).forEach(function (who) {
                out.push({ poll_id: String(p.id), uid: UID_OF[who] || null, option_id: String(p.votes[who]), at: nowISO(), _who: who });
            });
        });
        return out;
    }
    function rowsMessages(d) {
        return (d.messages || []).map(function (m) {
            return { id: String(m.id), from_uid: UID_OF[m.from] || null, from_user: m.from || '', to_uid: UID_OF[m.to] || null,
                     to_user: m.to || '', text: m.text || '', at: m.at || nowISO(), read: !!m.read, is_system: !!m.system };
        });
    }
    function rowsNotices(d) {
        return (d.notices || []).map(function (n) {
            return { id: String(n.id), to_user: n.to || '', text: n.text || '', kind: n.kind || 'info',
                     from_user: n.from || '', at: n.at || nowISO(), read: !!n.read };
        });
    }
    function rowsOrders(d) {
        return (d.orders || []).map(function (o) {
            return { id: String(o.id), uid: UID_OF[o.user] || null, username: o.user || '', kind: o.kind || '', ref_id: o.refId || '',
                     title: o.title || '', amount: Number(o.amount) || 0, receipt: o.receipt || '', ref: o.ref || '',
                     name: o.name || '', at: o.at || nowISO(), status: o.status || 'pending', reviewed_at: o.reviewedAt || null };
        });
    }
    /* إزالة الحقول المؤقتة (المسبوقة بـ _) قبل الإرسال */
    function clean(r, allowed) {
        var o = {};
        Object.keys(r).forEach(function (k) {
            if (k.charAt(0) === '_') return;
            if (allowed && allowed.indexOf(k) < 0) return;
            o[k] = r[k];
        });
        return o;
    }

    /* ============================== الفروق ============================== */
    /* يقارن مجموعتين بالمفتاح keyField ويعيد {up, del} */
    function diffRows(keyField, oldRows, newRows) {
        var oldMap = {}, newMap = {}, k;
        (oldRows || []).forEach(function (r) { oldMap[String(r[keyField])] = r; });
        (newRows || []).forEach(function (r) { newMap[String(r[keyField])] = r; });
        var up = [], del = [];
        Object.keys(newMap).forEach(function (id) {
            if (!oldMap[id] || !sameRows(oldMap[id], newMap[id])) up.push(newMap[id]);
        });
        Object.keys(oldMap).forEach(function (id) { if (!newMap[id]) del.push(oldMap[id]); });
        return { up: up, del: del };
    }
    /* مفتاح مركّب (للأصوات والتقييمات) */
    function diffComposite(makeKey, oldRows, newRows) {
        var oldMap = {}, newMap = {};
        (oldRows || []).forEach(function (r) { oldMap[makeKey(r)] = r; });
        (newRows || []).forEach(function (r) { newMap[makeKey(r)] = r; });
        var up = [], del = [];
        Object.keys(newMap).forEach(function (k) { if (!oldMap[k] || !sameRows(oldMap[k], newMap[k])) up.push(newMap[k]); });
        Object.keys(oldMap).forEach(function (k) { if (!newMap[k]) del.push(oldMap[k]); });
        return { up: up, del: del };
    }
    function runDiff(table, keyField, pair, allowed) {
        var jobs = [];
        pair.up.forEach(function (r) {
            var body = clean(r, allowed);
            jobs.push(restWrite('POST', table, 'on_conflict=' + keyField, body));
        });
        pair.del.forEach(function (r) {
            jobs.push(restWrite('DELETE', table, keyField + '=eq.' + encodeURIComponent(r[keyField])));
        });
        return jobs;
    }

    /* ============================== السحب ============================== */
    function isAdminMe() { return !!(ME && (ME.isAdmin || ME.super)); }

    function fetchRemote() {
        var R = {};
        return Promise.all([
            restGet('matn_site', 'id=eq.1&select=data,updated_at').then(function (r) { R.site = (r[0] && r[0].data) || {}; R.siteAt = r[0] && r[0].updated_at; }),
            restGet('matn_profiles', 'select=*&order=created_at.asc').then(function (r) { R.profiles = r || []; }),
            restGet('matn_diaries', 'select=*&order=at.desc&limit=500').then(function (r) { R.diaries = r || []; }),
            restGet('matn_diary_comments', 'select=*&order=at.asc&limit=1000').then(function (r) { R.comments = r || []; }),
            restGet('matn_diary_ratings', 'select=*').then(function (r) { R.ratings = r || []; }),
            restGet('matn_posts', 'select=*&order=at.asc&limit=1000').then(function (r) { R.posts = r || []; }),
            restGet('matn_polls', 'select=*&order=at.desc').then(function (r) { R.polls = r || []; }),
            restGet('matn_votes', 'select=*').then(function (r) { R.votes = r || []; }),
            restGet('matn_messages', 'select=*&order=at.asc&limit=1000').then(function (r) { R.messages = r || []; }),
            restGet('matn_notices', 'select=*&order=at.desc&limit=500').then(function (r) { R.notices = r || []; }),
            restGet('matn_orders', 'select=*&order=at.desc&limit=500').then(function (r) { R.orders = r || []; }),
            restGet('matn_member_data', 'select=*').then(function (r) { R.member = r || []; }),
            (isAdminMe() ? restGet('matn_admin', 'id=eq.1&select=data') : Promise.resolve([])).then(function (r) { R.admin = (r[0] && r[0].data) || {}; })
        ]).then(function () { return R; });
    }

    function assemble(R, me) {
        var d = { accounts: {}, salons: [], branches: [], book: { title: '', author: '', cover: '', desc: '', url: '', price: 0 },
                  posts: [], poll: null, polls: [], messages: [], notices: [], orders: [], partners: [],
                  giftCodes: {}, recording: {}, seatsLeft: null, headerAd: { items: [], active: true },
                  points: null, badWords: [], live: { title: '', url: '', when: '', note: '', on: false }, pay: {} };
        /* العام */
        Object.keys(R.site || {}).forEach(function (k) { d[k] = R.site[k]; });
        /* الإداري */
        Object.keys(R.admin || {}).forEach(function (k) { d[k] = R.admin[k]; });
        /* الملفات */
        ASSEMBLED++; PROF_AT_ASSEMBLE = (R.profiles || []).length;
        UID_OF = {}; PROFILES = R.profiles || [];
        PROFILES.forEach(function (p) {
            UID_OF[p.username] = p.uid;
            d.accounts[p.username] = {
                name: p.name || p.username, hash: '', points: Number(p.points) || 0, ledger: [], vouchers: [], bookings: {},
                avatar: p.avatar || '', minutes: Number(p.minutes) || 0,
                isAdmin: !!p.is_admin, super: !!p.super, suspended: !!p.suspended, thanks1k: !!p.thanks1k,
                perms: (p.is_admin || p.super) ? ['*'] : [], createdAt: p.created_at || nowISO(), diary: []
            };
        });
        /* البيانات الخاصة (صاحبي أو كل الأعضاء إن كنت مشرفاً) */
        (R.member || []).forEach(function (m) {
            var u = null;
            Object.keys(UID_OF).forEach(function (k) { if (UID_OF[k] === m.uid) u = k; });
            if (!u || !d.accounts[u]) return;
            d.accounts[u].bookings = m.data && m.data.bookings || {};
            d.accounts[u].ledger = (m.data && m.data.ledger) || [];
            d.accounts[u].vouchers = (m.data && m.data.vouchers) || [];
        });
        /* المذكرات + تعليقاتها + تقييماتها */
        var byDiary = {};
        (R.diaries || []).forEach(function (x) { byDiary[String(x.id)] = x; });
        (R.diaries || []).forEach(function (x) {
            var a = d.accounts[x.username];
            if (!a) return;
            a.diary.push({ id: String(x.id), text: x.text || '', at: x.at || nowISO(), public: x.is_public !== false, edited: !!x.edited, ratings: {}, comments: [] });
        });
        var dIndex = {};
        Object.keys(d.accounts).forEach(function (u) {
            (d.accounts[u].diary || []).forEach(function (e) { dIndex[e.id] = e; });
        });
        (R.ratings || []).forEach(function (r) {
            var who = Object.keys(UID_OF).filter(function (k) { return UID_OF[k] === r.uid; })[0];
            var e = dIndex[String(r.diary_id)];
            if (e && who) e.ratings[who] = Number(r.stars) || 0;
        });
        (R.comments || []).forEach(function (c) {
            var e = dIndex[String(c.diary_id)];
            if (!e) return;
            e.comments.push({ id: String(c.id), user: c.username || '', name: c.name || '', text: c.text || '', at: c.at || nowISO(),
                              approved: !!c.approved, reported: Number(c.reported) || 0, hide: !!c.hide });
        });
        /* المنشورات */
        d.posts = (R.posts || []).map(function (p) {
            var o = { id: String(p.id), topic: p.topic || 'book', user: p.username || '', name: p.name || '', text: p.text || '', at: p.at || nowISO() };
            if (p.poll_id) o.pollId = p.poll_id;
            return o;
        });
        /* التصويتات */
        d.polls = (R.polls || []).map(function (p) {
            var o = { id: String(p.id), question: p.question || '', options: p.options || [], votes: {}, open: p.open !== false, at: p.at || nowISO() };
            if (p.start_at) o.startAt = p.start_at;
            if (p.end_at) o.endAt = p.end_at;
            return o;
        });
        var pollIndex = {}; d.polls.forEach(function (p) { pollIndex[p.id] = p; });
        (R.votes || []).forEach(function (v) {
            var who = Object.keys(UID_OF).filter(function (k) { return UID_OF[k] === v.uid; })[0];
            var p = pollIndex[String(v.poll_id)];
            if (p && who) p.votes[who] = String(v.option_id);
        });
        /* الرسائل والتنبيهات والطلبات */
        d.messages = (R.messages || []).map(function (m) {
            return { id: String(m.id), from: m.from_user || '', to: m.to_user || '', text: m.text || '', at: m.at || nowISO(),
                     read: !!m.read, system: !!m.is_system };
        });
        d.notices = (R.notices || []).map(function (n) {
            return { id: String(n.id), to: n.to_user || '', text: n.text || '', kind: n.kind || 'info', from: n.from_user || '', at: n.at || nowISO(), read: !!n.read };
        });
        d.orders = (R.orders || []).map(function (o) {
            return { id: String(o.id), kind: o.kind || '', refId: o.ref_id || '', title: o.title || '', amount: Number(o.amount) || 0,
                     receipt: o.receipt || '', ref: o.ref || '', user: o.username || '', name: o.name || '', at: o.at || nowISO(),
                     status: o.status || 'pending', reviewedAt: o.reviewed_at || null };
        });
        /* حساب الدعم الفني (نظامي — محلي) */
        if (!d.accounts.support) {
            d.accounts.support = { name: 'الدعم الفني', system: true, hash: '', points: 0, ledger: [], vouchers: [], bookings: {},
                                   avatar: '', minutes: 0, perms: [], diary: [], createdAt: nowISO() };
        }
        if (me && me.username && d.accounts[me.username]) d.authUser = me.username;
        return d;
    }

    /* ============================== الدفع ============================== */
    function meName(d) { return (ME && ME.username) || (d && d.authUser) || null; }
    function isAdminDoc(d) {
        var u = meName(d); var a = u && d.accounts && d.accounts[u];
        if (a) return !!(a.super || a.isAdmin);
        return !!(ME && (ME.isAdmin || ME.super));   // احتياطي: الصلاحية من الخادم
    }

    function computeJobs(doc) {
        var sh = SHADOW || { };
        var jobs = [];
        var me = meName(doc);
        var admin = isAdminDoc(doc);
        var myUid = (loadSes() || {}).uid || null;
        if (!me || !doc.accounts || !doc.accounts[me]) return jobs;   // زائر: لا دفع

        /* 1) العام — للمشرف فقط */
        if (admin) {
            var siteNow = pick(doc, SITE_KEYS), siteOld = pick(sh, SITE_KEYS);
            if (!sameRows(siteNow, siteOld)) jobs.push(restWrite('PATCH', 'matn_site', 'id=eq.1', { data: siteNow, updated_at: nowISO() }));
            var admNow = pick(doc, ADMIN_KEYS), admOld = pick(sh, ADMIN_KEYS);
            if (!sameRows(admNow, admOld)) jobs.push(restWrite('PATCH', 'matn_admin', 'id=eq.1', { data: admNow, updated_at: nowISO() }));
        }

        /* 2) الملفات: ملفي (وأي عضو تغيّر إن كنت مشرفاً) */
        var users = admin ? Object.keys(doc.accounts) : [me];
        users.forEach(function (u) {
            var a = doc.accounts[u];
            if (!a || a.system) return;
            var isMe = (u === me);
            if (!isMe && !admin) return;
            if (!UID_OF[u] && !isMe) return;                       // لا نعرف uid العضو ⇒ لا نكتب
            /* الملف: العضو العادي يكتب {name, avatar, thanks1k} فقط (النقاط عبر matn_award) */
            var rNow = rowProfile(u, a, admin || false);
            var rOld = rowProfile(u, (SHADOW && SHADOW.accounts && SHADOW.accounts[u]) || {}, admin || false);
            if (!sameRows(rNow, rOld)) {
                var body = clean(rNow);
                if (isMe) jobs.push(patchMyProfile(body)); else jobs.push(patchProfileOf(u, body));
            }
            if (isMe && !admin) {
                var oldA = (SHADOW && SHADOW.accounts && SHADOW.accounts[me]) || {};
                var dPts = (Number(a.points) || 0) - (Number(oldA.points) || 0);
                var dMin = (Number(a.minutes) || 0) - (Number(oldA.minutes) || 0);
                if (dPts > 0 || dMin > 0) jobs.push(raw('POST', '/rest/v1/rpc/matn_award', { body: { p_points: Math.max(0, Math.min(dPts, 100)), p_minutes: Math.max(0, Math.min(dMin, 600)), p_reason: 'نشاط عضو' } }));
            }
            /* بياناتي/بيانات الأعضاء الخاصة */
            var mNow = rowMember(a), mOld = rowMember((SHADOW && SHADOW.accounts && SHADOW.accounts[u]) || {});
            if (!sameRows(mNow, mOld)) {
                var mb = clean(mNow);
                if (isMe) jobs.push(restWrite('POST', 'matn_member_data', 'on_conflict=uid', { uid: UID_OF[u] || (loadSes() || {}).uid, data: mb }));
                else if (admin) jobs.push(restWrite('POST', 'matn_member_data', 'on_conflict=uid', { uid: UID_OF[u], data: mb }));
            }
            /* المذكرات (وحذف) */
            var dNew = rowsDiary(u, a);
            var dOld = rowsDiary(u, (SHADOW && SHADOW.accounts && SHADOW.accounts[u]) || {});
            jobs = jobs.concat(runDiff('matn_diaries', 'id', diffRows('id', dOld, dNew)));
            /* التعليقات */
            var cNew = rowsComments(u, a), cOld = rowsComments(u, (SHADOW && SHADOW.accounts && SHADOW.accounts[u]) || {});
            jobs = jobs.concat(runDiff('matn_diary_comments', 'id', diffRows('id', cOld, cNew)));
            /* التقييمات */
            var rNew = rowsRatings(u, a).filter(function (r) { return r.uid && (admin || r.uid === myUid); });
            var rOld = rowsRatings(u, (SHADOW && SHADOW.accounts && SHADOW.accounts[u]) || {}).filter(function (r) { return r.uid && (admin || r.uid === myUid); });
            var pr = diffComposite(function (r) { return r.diary_id + '|' + r.uid; }, rOld, rNew);
            pr.up.forEach(function (r) { jobs.push(restWrite('POST', 'matn_diary_ratings', 'on_conflict=diary_id,uid', clean(r))); });
            pr.del.forEach(function (r) { jobs.push(restWrite('DELETE', 'matn_diary_ratings', 'diary_id=eq.' + encodeURIComponent(r.diary_id) + '&uid=eq.' + encodeURIComponent(r.uid))); });
        });

        /* 3) المنشورات */
        var poNew = rowsPosts(doc).filter(function (r) { return admin || (r.uid && r.uid === myUid); });
        var poOld = rowsPosts(SHADOW || {}).filter(function (r) { return admin || (r.uid && r.uid === myUid); });
        jobs = jobs.concat(runDiff('matn_posts', 'id', diffRows('id', poOld, poNew)));

        /* 4) التصويتات (المشرف) + الأصوات (صاحبي) */
        if (admin) {
            jobs = jobs.concat(runDiff('matn_polls', 'id', diffRows('id', rowsPolls(SHADOW || {}), rowsPolls(doc))));
        }
        var vNew = rowsVotes(doc).filter(function (r) { return r.uid && r.uid === myUid; });
        var vOld = rowsVotes(SHADOW || {}).filter(function (r) { return r.uid && r.uid === myUid; });
        var pv = diffComposite(function (r) { return r.poll_id + '|' + r.uid; }, vOld, vNew);
        pv.up.forEach(function (r) { jobs.push(restWrite('POST', 'matn_votes', 'on_conflict=poll_id,uid', clean(r))); });

        /* 5) الرسائل (التي أرسلتها أو — للمشرف — الكل) */
        var msgKeep = rowsMessages(doc).filter(function (r) { return admin || (r.from_uid && r.from_uid === myUid); });
        var msgOldKeep = rowsMessages(SHADOW || {}).filter(function (r) { return admin || (r.from_uid && r.from_uid === myUid); });
        jobs = jobs.concat(runDiff('matn_messages', 'id', diffRows('id', msgOldKeep, msgKeep)));

        /* 6) التنبيهات (المشرف ينشئ — والعضو يعلّم مقروءاً) */
        var nAll = rowsNotices(doc), nOld = rowsNotices(SHADOW || {});
        if (admin) {
            jobs = jobs.concat(runDiff('matn_notices', 'id', diffRows('id', nOld, nAll)));
        } else {
            var dif = diffRows('id', nOld, nAll);
            dif.up.filter(function (r) { return r.to_user === me; }).forEach(function (r) {
                jobs.push(restWrite('PATCH', 'matn_notices', 'id=eq.' + encodeURIComponent(r.id), { read: !!r.read }));
            });
        }

        /* 7) الطلبات */
        var oAll = rowsOrders(doc), oOld = rowsOrders(SHADOW || {});
        var od = diffRows('id', oOld, oAll);
        var mineOrAdmin = function (r) { return admin || (r.uid && r.uid === myUid); };
        od.up.filter(mineOrAdmin).forEach(function (r) { jobs.push(restWrite('POST', 'matn_orders', 'on_conflict=id', clean(r))); });
        if (admin) od.del.forEach(function (r) { jobs.push(restWrite('DELETE', 'matn_orders', 'id=eq.' + encodeURIComponent(r.id))); });

        return jobs;
    }

    function patchMyProfile(body) {
        var s = loadSes() || {};
        return restWrite('PATCH', 'matn_profiles', 'uid=eq.' + encodeURIComponent(s.uid), body);
    }
    function patchProfileOf(u, body) {
        return restWrite('PATCH', 'matn_profiles', 'username=eq.' + encodeURIComponent(u), body);
    }

    function flushPush() {
        if (!ME) return Promise.resolve();
        var doc = readDoc();
        if (!doc) return Promise.resolve();
        if (!doc.accounts) doc.accounts = {};
        if (!doc.accounts[ME.username]) {
            doc.accounts[ME.username] = { name: ME.name || ME.username, hash: '', points: 0, ledger: [], vouchers: [],
                bookings: {}, avatar: '', minutes: 0, perms: [], diary: [], isAdmin: !!ME.isAdmin, super: !!ME.super };
        }
        setStatus('syncing');
        return Promise.all([Promise.resolve()]).then(function () {
            var jobs;
            try { jobs = computeJobs(doc); } catch (e) { setStatus('error', 'تعذّر تجهيز المزامنة'); return; }
            if (!jobs.length) { SHADOW = clone(doc); setStatus('ok', ''); return; }
            return Promise.all(jobs.map(function (p) { return p.catch(function () { return null; }); })).then(function (res) {
                var failed = (res || []).filter(function (r) { return r && r.ok === false && r.status !== 404; }).length;
                SHADOW = clone(doc);
                setStatus(failed ? 'error' : 'ok', failed ? (failed + ' تغيير لم يُرفع') : '');
            });
        });
    }

    function push(doc) {
        if (!configured() || !ME) return;
        dirtyDoc = doc || readDoc();
        if (pushTimer) return;
        pushTimer = setTimeout(function () {
            pushTimer = null;
            if (pushing) return;
            pushing = true;
            flushPush().then(function () { pushing = false; }, function () { pushing = false; });
        }, PUSH_DEBOUNCE);
    }

    /* ============================== الدمج ============================== */
    var SEED_TRIED = false;
    function mergeLocalOnly(d, local, me) {
        if (!me && local && local.authUser) d.authUser = local.authUser;
        return d;
    }
    function pullMerge(force) {
        return ensureSession().then(function () {
            return fetchRemote();
        }).then(function (R) {
            var local = readDoc() || {};
            /* (1) نبني الحالة من السحابة أولاً — وفيها حسابي إن وُجد */
            var d = mergeLocalOnly(assemble(R, ME), local, ME);
            /* (2) تهيئة أولى: سحابة فارغة + محتوى محلي + أنا مشرف ⇒ المحلي هو المرجع */
            if (!SEED_TRIED && siteEmpty(R.site) && hasContent(local) && isAdminMe()) {
                SEED_TRIED = true; SEED_RUNS++;
                SITE_KEYS.concat(ADMIN_KEYS).forEach(function (k) {
                    if (local[k] !== undefined) d[k] = local[k];
                });
                Object.keys(local.accounts || {}).forEach(function (u) {
                    var a = local.accounts[u];
                    if (!a || a.system || !d.accounts[u]) return;
                    if (a.diary && a.diary.length) d.accounts[u].diary = a.diary;
                    d.accounts[u].bookings = a.bookings || {};
                    d.accounts[u].ledger = a.ledger || [];
                    d.accounts[u].vouchers = a.vouchers || [];
                });
                writeDoc(d);
                SHADOW = {};
                return flushPush().then(function () { return fetchRemote(); }).then(function (R2) {
                    var d2 = mergeLocalOnly(assemble(R2, ME), local, ME);
                    writeDoc(d2); SHADOW = clone(d2);
                    setStatus('ok', '');
                    afterSync();
                    return d2;
                });
            }
            var changed = !sameRows(d, local);
            writeDoc(d);
            SHADOW = clone(d);
            setStatus('ok', '');
            if (changed || force) afterSync();
            return d;
        }).catch(function (e) {
            LAST_ERR = (e && (e.message || e.code)) ? String(e.message || e.code) : 'unknown';
            setStatus('error', LAST_ERR);
        });
    }

    /* ============================== الحساب ============================== */
    function sbEmail(username) { return String(username || '').toLowerCase() + '@matn.club'; }

    function signUp(username, password, name) {
        if (!configured()) return Promise.reject({ code: 'NOT_CONFIGURED' });
        var uname = String(username || '').toLowerCase();
        var pts = 20;
        try { var d0 = readDoc(); if (d0 && d0.points && typeof d0.points.signup === 'number') pts = d0.points.signup; } catch (e) {}
        return raw('POST', '/auth/v1/signup', { auth: false, body: { email: sbEmail(uname), password: String(password), data: { username: uname, name: String(name || '').trim() || uname, signup_points: pts } } })
            .then(function (r) {
                if (r.netErr) throw { code: 'NETWORK' };
                if (!r.ok) {
                    var msg = (r.j && ((r.j.error && r.j.error.message) || r.j.message || r.j.msg)) || '';
                    if (/already|exists|registered/i.test(msg)) throw { code: 'USERNAME_TAKEN' };
                    if (/password/i.test(msg)) throw { code: 'WEAK_PASSWORD' };
                    throw { code: 'CLOUD_FAIL', msg: msg };
                }
                if (!r.j || !r.j.access_token) throw { code: 'CONFIRM_EMAIL' };
                saveSes(r.j);
                return loadMe().then(function () { return pullMerge(true); }).then(function () { return { username: uname, name: name || uname }; });
            });
    }

    function signIn(username, password) {
        if (!configured()) return Promise.reject({ code: 'NOT_CONFIGURED' });
        var uname = String(username || '').toLowerCase();
        return raw('POST', '/auth/v1/token?grant_type=password', { auth: false, body: { email: sbEmail(uname), password: String(password) } })
            .then(function (r) {
                if (r.netErr) throw { code: 'NETWORK' };
                if (!r.ok) {
                    var msg = (r.j && ((r.j.error && r.j.error.message) || r.j.message || r.j.msg)) || '';
                    if (/invalid|credentials/i.test(msg)) throw { code: 'NO_ACCOUNT' };
                    throw { code: 'CLOUD_FAIL', msg: msg };
                }
                saveSes(r.j);
                return loadMe().then(function () {
                    if (!ME) throw { code: 'NO_ACCOUNT' };
                    return pullMerge(true);
                }).then(function () { return { username: uname, name: (ME && ME.name) || uname }; });
            });
    }

    function signOut() {
        try { raw('POST', '/auth/v1/logout', {}); } catch (e) {}
        clearSes(); ME = null; SHADOW = null;
        setStatus('off');
    }

    function loadMe() {
        var s = loadSes();
        if (!s || !s.access_token) { ME = null; return Promise.resolve(null); }
        return restGet('matn_profiles', 'uid=eq.' + encodeURIComponent(s.uid) + '&select=*').then(function (rows) {
            var p = rows[0];
            ME = p ? { username: p.username, uid: p.uid, name: p.name, isAdmin: !!p.is_admin, super: !!p.super, suspended: !!p.suspended } : null;
            if (ME) UID_OF[ME.username] = ME.uid;
            return ME;
        }).catch(function () { ME = null; return null; });
    }

    /* ============================== التشغيل ============================== */
    function hasContent(d) {
        if (!d) return false;
        return !!((d.salons && d.salons.length) || (d.book && (d.book.title || d.book.url)) ||
                  (d.partners && d.partners.length) || (d.branches && d.branches.length) ||
                  (d.posts && d.posts.length) || (d.polls && d.polls.length) ||
                  (d.accounts && Object.keys(d.accounts).filter(function (u) { return !d.accounts[u].system; }).length));
    }
    function siteEmpty(site) { return !site || !Object.keys(site).length || (!(site.salons || []).length && !(site.book || {}).title && !(site.partners || []).length); }

    function start() {
        if (!configured()) { setStatus('off'); return; }
        setStatus('syncing');
        ensureSession().then(function () {
            return loadMe();
        }).then(function () {
            return restGet('matn_site', 'id=eq.1&select=data');
        }).then(function (rows) {
            var remoteSite = (rows[0] && rows[0].data) || {};
            var local = readDoc();
            /* تهيئة أولى: المحتوى المحلي يرفع إلى السحابة إن كانت فارغة وكنت مشرفاً */
            if (siteEmpty(remoteSite) && hasContent(local) && isAdminMe()) {
                SHADOW = {};   // كل شيء يُعتبر جديداً
                return flushPush().then(function () { return pullMerge(true); });
            }
            return pullMerge(false);
        }).then(function () {
            setStatus('ok');
            startTicker();
            READY_RESOLVE && READY_RESOLVE(true);
        }).catch(function (e) {
            setStatus('error', (e && e.message) || 'تعذّر بدء المزامنة');
            /* لا نُعطّل الموقع: نعرض المحلي */
            afterSync(); startTicker();
            READY_RESOLVE && READY_RESOLVE(false);
        });
    }

    function tick() {
        if (!configured()) return;
        if (document.hidden) return;
        if (pushing || pushTimer) return;
        ensureSession().then(function () { return flushPush(); }).then(function () { return pullMerge(false); })['catch'](function () {});
    }
    function startTicker() {
        if (tickTimer) return;
        tickTimer = setInterval(tick, POLL_MS);
        document.addEventListener('visibilitychange', function () { if (!document.hidden) tick(); });
        window.addEventListener('online', function () { tick(); });
        window.addEventListener('focus', function () { tick(); });
    }

    /* ⬆ رفع كامل (تُستخدم من اللوحة: «ارفع محتواي الحالي») */
    function pushAll() {
        if (!configured() || !ME) return Promise.resolve(false);
        SHADOW = {};
        return flushPush().then(function () { return true; });
    }

    window.MATN_SYNC = {
        configured: configured,
        active: function () { return !!(configured() && ME); },
        ready: new Promise(function (res) { READY_RESOLVE = res; }),
        start: start,
        signUp: signUp,
        signIn: signIn,
        signOut: signOut,
        push: push,
        pull: function () { return pullMerge(true); },
        pushAll: pushAll,
        status: function () { return { state: LAST.state, at: LAST.at, msg: LAST.msg, username: ME && ME.username, admin: isAdminMe() }; },
        me: function () { return ME; },
        _debug: function (d) {
            d = d || readDoc() || {};
            var n = -1; try { n = computeJobs(d).length; } catch (e) { n = 'ERR ' + e.message; }
            var keys = Object.keys(d.accounts || {});
            var nonSys = keys.filter(function (k) { return !((d.accounts[k] || {}).system); });
            var sample = nonSys.length ? d.accounts[nonSys[0]] : null;
            return { me: meName(d), admin: isAdminDoc(d), jobs: n,
                     accKeys: keys, nonSys: nonSys, profilesSeen: (PROFILES || []).length,
                     assembled: ASSEMBLED, profAtAssemble: PROF_AT_ASSEMBLE, seedRuns: SEED_RUNS, lastErr: LAST_ERR, statusMsg: LAST.msg, reqlog: REQLOG.slice(-25).join(','),
                     sample: sample ? { name: sample.name, super: !!sample.super, isAdmin: !!sample.isAdmin, points: sample.points } : null,
                     shadowSalons: ((SHADOW || {}).salons || []).length, docSalons: (d.salons || []).length,
                     shadowKeys: Object.keys(SHADOW || {}), sameSite: sameRows(pick(d, SITE_KEYS), pick(SHADOW || {}, SITE_KEYS)) };
        }
    };
})();
