/* ==========================================================================
   نادي مَتن — طبقة السحابة (Supabase)
   عميل خفيف بلا أي مكتبة خارجية: يستخدم fetch مباشرة على واجهات Supabase
   (GoTrue للمصادقة + PostgREST للقراءة + RPC للكتابة).

   لا يعمل شيء هنا إلا إذا مُلئت cloud-config.js. وإلا يعود الموقع
   تلقائياً إلى الوضع المحلي (localStorage) كما كان.
   ========================================================================== */
window.MatnCloud = (function () {
    'use strict';

    var cfg = window.MATN_CLOUD || {};
    var URL_BASE = (cfg.url || '').replace(/\/+$/, '');
    var ANON = cfg.anonKey || '';
    var SESSION_KEY = cfg.sessionKey || 'gharnata';
    var SKEY = 'matn_cloud_session_v1';

    function configured() {
        return !!(URL_BASE && ANON && typeof window.fetch === 'function');
    }

    /* ---------------- الجلسة ---------------- */
    function savedSession() {
        try { return JSON.parse(localStorage.getItem(SKEY) || 'null'); } catch (e) { return null; }
    }
    function saveSession(s) {
        try { localStorage.setItem(SKEY, JSON.stringify(s)); } catch (e) {}
    }
    function clearSession() {
        try { localStorage.removeItem(SKEY); } catch (e) {}
    }

    function authHeaders(token) {
        return {
            'apikey': ANON,
            'Authorization': 'Bearer ' + (token || ANON),
            'Content-Type': 'application/json'
        };
    }

    function signInAnonymously() {
        return fetch(URL_BASE + '/auth/v1/signup', {
            method: 'POST',
            headers: authHeaders(null),
            body: '{}'
        }).then(function (r) {
            return r.json().then(function (j) {
                if (!r.ok) throw normErr(j, r.status);
                if (!j || !j.access_token) throw { code: 'ANON_DISABLED' };
                return j;
            });
        });
    }

    function refreshSession(refreshToken) {
        return fetch(URL_BASE + '/auth/v1/token?grant_type=refresh_token', {
            method: 'POST',
            headers: authHeaders(null),
            body: JSON.stringify({ refresh_token: refreshToken })
        }).then(function (r) { return r.json().then(function (j) { if (!r.ok) throw normErr(j, r.status); return j; }); });
    }

    var session = null;

    /* يضمن وجود جلسة صالحة (ويعيد تسجيل دخول مجهول عند الحاجة) */
    function bootstrap() {
        if (!configured()) return Promise.reject({ code: 'NOT_CONFIGURED' });
        if (session && session.access_token) return Promise.resolve(session);
        var s = savedSession();
        if (s && s.access_token && s.expires_at && s.expires_at - 60000 > Date.now()) {
            session = s; return Promise.resolve(s);
        }
        if (s && s.refresh_token) {
            return refreshSession(s.refresh_token)
                .then(store).catch(function () { clearSession(); return signInAnonymously().then(store); });
        }
        return signInAnonymously().then(store);
    }

    function store(j) {
        var s = {
            access_token: j.access_token,
            refresh_token: j.refresh_token || (savedSession() || {}).refresh_token,
            uid: (j.user && j.user.id) || (savedSession() || {}).uid,
            expires_at: Date.now() + ((j.expires_in || 3600) * 1000)
        };
        session = s; saveSession(s); return s;
    }

    /* ---------------- REST ---------------- */
    function rest(path, opts, retry) {
        opts = opts || {};
        return bootstrap().then(function (s) {
            var headers = authHeaders(s.access_token);
            if (opts.headers) for (var k in opts.headers) headers[k] = opts.headers[k];
            return fetch(URL_BASE + '/rest/v1' + path, {
                method: opts.method || 'GET',
                headers: headers,
                body: opts.body ? JSON.stringify(opts.body) : undefined
            }).then(function (r) {
                if (r.status === 401 && !retry) {           // جلسة منتهية → جدّد مرة واحدة
                    clearSession(); session = null;
                    return bootstrap().then(function () { return rest(path, opts, true); });
                }
                if (r.status === 204) return null;
                return r.text().then(function (t) {
                    var j = null;
                    try { j = t ? JSON.parse(t) : null; } catch (e) { j = t; }
                    if (!r.ok) throw normErr(j, r.status);
                    return j;
                });
            });
        });
    }

    function normErr(j, status) {
        var e = { code: (j && (j.code || j.error)) || ('HTTP_' + status), message: (j && (j.message || j.error_description || j.msg)) || '' };
        return e;
    }

    function rpc(fn, args) {
        return rest('/rpc/' + fn, { method: 'POST', body: args || {} });
    }

    var AR = {
        AUTH_REQUIRED: 'تعذّر التحقق من هويتك. أعد تحميل الصفحة.',
        SESSION_FULL: 'اكتمل عدد مقاعد الجلسة.',
        SESSION_NOT_FOUND: 'الجلسة غير موجودة.',
        GIFT_NOT_FOUND: 'رمز غير معروف. تأكد من الرمز وحاول مرة أخرى.',
        GIFT_USED: 'هذه القسيمة مستخدمة من قبل.',
        INSUFFICIENT_POINTS: 'رصيدك لا يكفي لهذا الاستبدال.',
        PARTNER_NOT_FOUND: 'هذا الشريك لم يعد متاحاً.',
        FORBIDDEN: 'هذه العملية متاحة للمشرف فقط.',
        BAD_POINTS: 'عدد نقاط غير صحيح.',
        ANON_DISABLED: 'تسجيل الدخول المجهول غير مُفعّل في مشروع Supabase.',
        NOT_CONFIGURED: 'لم تُضبط بيانات Supabase بعد.',
        BAD_EMAIL: 'صيغة البريد الإلكتروني غير صحيحة.',
        NO_EMAIL: 'لا يوجد بريد محفوظ لهذا الحجز.',
        EMAIL_NOT_CONFIGURED: 'خدمة البريد غير مُفعّلة بعد.',
        SEND_FAILED: 'تعذّر إرسال البريد.',
        BOOKING_NOT_FOUND: 'لم يُعثر على الحجز.'
    };
    function ar(e) {
        if (!e) return 'حدث خطأ غير متوقع.';
        return AR[e.code] || e.message || 'تعذّر إكمال العملية.';
    }

    /* ---------------- تحميل الحالة كاملة ---------------- */
    var CAT_DEFAULT = 0;

    function loadAll() {
        return bootstrap().then(function (s) {
            var q = [
                rest('/session_status?key=eq.' + encodeURIComponent(SESSION_KEY) + '&select=*'),
                rest('/members?select=points,is_admin&id=eq.' + s.uid),
                rest('/bookings?select=code,created_at&session_key=eq.' + encodeURIComponent(SESSION_KEY)),
                rest('/ledger?select=reason,points,created_at&order=created_at.desc&limit=20'),
                rest('/vouchers?select=partner_name,code,cost,created_at&order=created_at.desc&limit=50'),
                rest('/partners?select=id,name,tag,description,cost,prefix&order=created_at.asc'),
                rest('/app_settings?select=key,value')
            ];
            return Promise.all(q);
        }).then(function (res) {
            var st = (res[0] || [])[0] || { seats_left: 0, capacity: 6, title: '', happens_at: '', place: '', facilitator: '' };
            var me = (res[1] || [])[0] || { points: 0, is_admin: false };
            var bk = (res[2] || [])[0] || null;
            var settings = {};
            (res[6] || []).forEach(function (r) { settings[r.key] = r.value; });

            var snap = {
                user: { points: me.points, isAdmin: !!me.is_admin },
                seatsLeft: st.seats_left,
                capacity: st.capacity,
                sessionInfo: { title: st.title, when: st.happens_at, place: st.place, facilitator: st.facilitator },
                booking: bk ? { code: bk.code, at: bk.created_at, title: st.title, when: st.happens_at, where: st.place } : null,
                partners: (res[5] || []).map(function (p) {
                    return { id: p.id, name: p.name, tag: p.tag == null ? CAT_DEFAULT : p.tag, desc: p.description, cost: p.cost, prefix: p.prefix };
                }),
                ledger: (res[3] || []).map(function (x) { return { reason: x.reason, points: x.points, at: x.created_at }; }),
                vouchers: (res[4] || []).map(function (v) { return { partner: v.partner_name, code: v.code, cost: v.cost, at: v.created_at }; }),
                recording: { title: settings.recording_title || '', url: settings.recording_url || '' },
                giftCodes: {}
            };
            if (!snap.user.isAdmin) return snap;
            return rest('/gift_codes?select=code,points,used_by,created_at&order=created_at.desc').then(function (rows) {
                (rows || []).forEach(function (g) { snap.giftCodes[g.code] = { points: g.points, used: !!g.used_by }; });
                return snap;
            }).catch(function () { return snap; });
        });
    }

    /* ---------------- الإجراءات ---------------- */
    return {
        configured: configured,
        sessionKey: SESSION_KEY,
        loadAll: loadAll,
        ar: ar,

        bookSeat: function (name, email) { return rpc('book_seat', { p_key: SESSION_KEY, p_name: name || '', p_email: email || '' }); },
        cancelBooking: function () { return rpc('cancel_booking', { p_key: SESSION_KEY }); },
        redeemGift: function (code) { return rpc('redeem_gift', { p_code: code }); },
        redeemPartner: function (id) { return rpc('redeem_partner', { p_id: id }); },
        addPartner: function (p) {
            return rpc('add_partner', { p_name: p.name, p_tag: p.tag, p_description: p.desc, p_cost: p.cost, p_prefix: p.prefix });
        },
        removePartner: function (id) { return rpc('remove_partner', { p_id: id }); },
        generateGiftCode: function (points) { return rpc('generate_gift_code', { p_points: points }); },
        saveRecording: function (title, url) { return rpc('save_recording', { p_title: title, p_url: url }); },

        /* إرسال التذكرة بالبريد عبر دالة Edge */
        emailTickets: !!cfg.emailTickets,
        sendTicket: function (code) {
            return bootstrap().then(function (s) {
                return fetch(URL_BASE + '/functions/v1/send-ticket', {
                    method: 'POST',
                    headers: authHeaders(s.access_token),
                    body: JSON.stringify({ code: code })
                }).then(function (r) {
                    return r.text().then(function (t) {
                        var j = null;
                        try { j = t ? JSON.parse(t) : null; } catch (e) { j = null; }
                        if (!r.ok) throw normErr(j, r.status);
                        return j;
                    });
                });
            });
        },

        /* للاختبار فقط */
        _reset: function () { clearSession(); session = null; }
    };
})();
