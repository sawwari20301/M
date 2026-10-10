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
    function catCls(i) { return (CATEGORIES[i] || CATEGORIES[0]).cls; }
    function catLabel(i) { return (CATEGORIES[i] || CATEGORIES[0]).label; }

    /* ---------- مخزن الحسابات والحالة ----------
       الوثيقة المخزّنة تحمل: accounts (حساب لكل عضو) + session + عناصر مشتركة
       (المقاعد، الشركاء، قسائم الشحن، التسجيل). و load() تُقدّم «منظراً» للكود
       كما كان، فبقية الملف لا يتغير. */
    function seedDoc() {
        return {
            accounts: {},
            session: null,
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

    var state = null;

    function load() {
        if (state) return state;
        var d = doc();
        var acc = (d.session && d.accounts[d.session]) ? d.accounts[d.session] : null;
        state = {
            signedIn: !!acc,
            user: {
                username: acc ? d.session : null,
                name: acc ? (acc.name || d.session) : '',
                points: acc ? (typeof acc.points === 'number' ? acc.points : 340) : 0,
                isAdmin: !!(acc && acc.isAdmin)
            },
            seatsLeft: typeof d.seatsLeft === 'number' ? d.seatsLeft : SESSION.seats,
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
        d.seatsLeft = state.seatsLeft;
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
        d.session = u || null;
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
            d.accounts[uname] = {
                name: String(name || '').trim() || uname,
                hash: hash,
                points: 340,                       // رصيد ترحيبي
                ledger: [{ reason: 'رصيد ترحيبي عند التسجيل', points: 340, at: new Date().toISOString() }],
                vouchers: [], booking: null,
                isAdmin: Object.keys(d.accounts).length === 0,   // أول حساب = المشرف
                createdAt: new Date().toISOString()
            };
            d.session = uname;
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
            d.session = uname;
            saveDoc(d);
            state = null; load(); render();
            return { username: uname, name: acc.name };
        });
    }

    function signOut() {
        var d = doc();
        d.session = null;
        saveDoc(d);
        state = null; load(); render();
        toast('تم تسجيل الخروج', 'info');
    }

    /* هل هذه العملية تحتاج تسجيل دخول؟ (في الوضع المحلي فقط — الوضع السحابي
       يستخدم الخادم لهوية الزائر حتى نضيف حسابات Supabase) */
    function needsLogin() { return !CLOUD && !load().signedIn; }

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
    function saveGuest(name, email) {
        try { localStorage.setItem('matn_guest_v1', JSON.stringify({ name: name, email: email })); } catch (e) {}
    }

    /* حجز مقعد — يطلب الاسم والبريد ثم ينفّذ */
    function bookSeat() {
        if (needsLogin()) { requireLogin('حجز مقعد في الصالون'); return; }
        var s = load();
        if (s.booking) { cancelBooking(); return; }
        if (s.seatsLeft <= 0) { toast('اكتمل عدد مقاعد الجلسة', 'error'); return; }

        var g = readGuest();
        var needEmail = !!(CLOUD && window.MatnCloud && window.MatnCloud.emailTickets);

        modal({
            title: 'تأكيد حجز المقعد',
            body:
                '<p class="text-xs text-matn-muted leading-relaxed mb-3">' +
                    (needEmail ? 'سنرسل تذكرة الحجز إلى بريدك الإلكتروني.' : 'أدخل اسمك لتأكيد الحجز.') +
                '</p>' +
                '<label class="matn-field"><span>الاسم</span><input class="matn-input" id="bkName" type="text" value="' + esc(g.name || '') + '" placeholder="اسمك"></label>' +
                '<label class="matn-field"><span>البريد الإلكتروني' + (needEmail ? '' : ' (اختياري)') + '</span><input class="matn-input" id="bkEmail" type="email" value="' + esc(g.email || '') + '" placeholder="name@example.com"></label>' +
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
                    if (!name) { msg.textContent = 'اكتب اسمك.'; msg.className = 'text-xs mt-1 text-red-700'; return; }
                    if (needEmail && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
                        msg.textContent = 'أدخل بريداً صحيحاً — التذكرة تُرسل إليه.';
                        msg.className = 'text-xs mt-1 text-red-700';
                        return;
                    }
                    saveGuest(name, email);
                    closeModal();
                    doBook(name, email);
                });
            }
        });
    }

    function doBook(name, email) {
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
        change(function (st) {
            st.seatsLeft = Math.max(0, st.seatsLeft - 1);
            st.booking = { code: code, at: new Date().toISOString(), title: SESSION.title, when: SESSION.when, where: SESSION.where };
        });
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
        change(function (st) {
            st.seatsLeft = Math.min(SESSION.seats, st.seatsLeft + 1);
            st.booking = null;
        });
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
        if (needsLogin()) { requireLogin('لوحة الإشراف'); return; }
        if (!load().user.isAdmin) { toast('هذه العملية متاحة للمشرف فقط.', 'error'); return; }
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
        if (needsLogin()) { requireLogin('لوحة الإشراف'); return; }
        if (!load().user.isAdmin) { toast('هذه العملية متاحة للمشرف فقط.', 'error'); return; }
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
        if (needsLogin()) { requireLogin('لوحة الإشراف'); return; }
        if (!load().user.isAdmin) { toast('هذه العملية متاحة للمشرف فقط.', 'error'); return; }
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
            }
        }

        /* بوابة العضوية (المحفظة + لوحة الإشراف) */
        var gate = document.getElementById('gateBox');
        if (gate) {
            var isAdminPage = !!document.getElementById('adminPartnerList');
            var locked = needsLogin() || (isAdminPage && !s.user.isAdmin);
            gate.classList.toggle('hidden', !locked);
            var gTitle = gate.querySelector('h2');
            if (gTitle) gTitle.textContent = (isAdminPage && s.signedIn) ? 'هذه الصفحة للمشرف' : 'هذه الصفحة للأعضاء';
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
        var spent = document.getElementById('statSpent');
        if (spent) spent.textContent = num(s.vouchers.reduce(function (a, v) { return a + v.cost; }, 0));
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

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', boot);
    } else { boot(); }
})();
