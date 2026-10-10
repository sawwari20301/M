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
        { key: 'branches', label: 'فروعنا' },
        { key: 'book', label: 'كتاب الأسبوع' },
        { key: 'engage', label: 'النقاش والتصويت' },
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

    /* روابط داخلية أو خارجية آمنة (تسمح بصفحات الموقع) */
    function safeLink(u) {
        var t = String(u === null || u === undefined ? '' : u).trim();
        if (!t) return '';
        if (/^https?:\/\//i.test(t)) return t;
        if (/^[a-z][a-z0-9+.\-]*:/i.test(t)) return '';        /* يمنع javascript: و data: */
        if (/^[\w.\-\/]+(\.html)?(#[-\w]*)?(\?[\w=&%.\-]*)?$/i.test(t)) return t;   /* صفحة داخلية */
        return 'https://' + t;
    }
    function safeImg(u) {
        var t = String(u === null || u === undefined ? '' : u).trim();
        if (!t) return '';
        if (/^data:image\/(png|jpe?g|webp|gif);base64,[A-Za-z0-9+/=]+$/i.test(t)) return t;
        if (/^data:/i.test(t)) return '';
        return safeUrl(t);
    }
    /* ضغط الصورة في المتصفح قبل حفظها (كي لا تتجاوز مساحة التخزين) */
    function compressImage(file, maxDim, quality) {
        return new Promise(function (resolve, reject) {
            try {
                var fr = new FileReader();
                fr.onload = function () {
                    var img = new Image();
                    img.onload = function () {
                        try {
                            var sc = Math.min(1, maxDim / Math.max(img.width || 1, img.height || 1));
                            var cw = Math.max(1, Math.round((img.width || 1) * sc));
                            var ch = Math.max(1, Math.round((img.height || 1) * sc));
                            var c = document.createElement('canvas');
                            c.width = cw; c.height = ch;
                            var ctx = c.getContext('2d');
                            ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, cw, ch);
                            ctx.drawImage(img, 0, 0, cw, ch);
                            var out = c.toDataURL('image/jpeg', quality);
                            if (out.length > 800000) out = c.toDataURL('image/jpeg', 0.6);
                            if (out.length > 1100000) out = c.toDataURL('image/jpeg', 0.45);
                            resolve(out);
                        } catch (e) { reject(e); }
                    };
                    img.onerror = function () { reject(new Error('BAD_IMAGE')); };
                    img.src = String(fr.result);
                };
                fr.onerror = function () { reject(new Error('READ_FAIL')); };
                fr.readAsDataURL(file);
            } catch (e) { reject(e); }
        });
    }
    /* تكبير الصورة بالضغط المطوّل */
    function showZoom(src) {
        if (!src) return;
        var ov = document.getElementById('matnZoom');
        if (!ov) {
            ov = document.createElement('div');
            ov.id = 'matnZoom';
            ov.className = 'matn-zoom';
            ov.innerHTML = '<img alt="صورة مكبّرة"><div class="matn-zoom-hint">أفلت إصبعك للرجوع</div>';
            document.body.appendChild(ov);
        }
        ov.querySelector('img').src = src;
        ov.classList.add('is-on');
    }
    function hideZoom() {
        var ov = document.getElementById('matnZoom');
        if (ov) ov.classList.remove('is-on');
    }

    var VENUE_KINDS = [
        { key: 'cafe', label: 'كوفي', icon: '☕' },
        { key: 'hall', label: 'صالة', icon: '🏛' },
        { key: 'library', label: 'مكتبة', icon: '📚' },
        { key: 'other', label: 'مكان آخر', icon: '📍' }
    ];
    function venueKind(k) {
        for (var i = 0; i < VENUE_KINDS.length; i++) if (VENUE_KINDS[i].key === k) return VENUE_KINDS[i];
        return VENUE_KINDS[0];
    }
    function venueText(s) {
        if (!s || !s.venue) return '';
        return venueKind(s.venueKind).icon + ' ' + s.venue + (s.city ? (' — ' + s.city) : '');
    }

    /* ---------- فروعنا: كل مدن المملكة ---------- */
    var SA_CITIES = ('الرياض,الخرج,الدرعية,المزاحمية,ضرما,حريملاء,ثادق,الغاط,شقراء,المجمعة,الزلفي,الدوادمي,الأفلاج,وادي الدواسر,' +
        'حوطة بني تميم,السليل,الدلم,رماح,القويعية,الحريق,حوطة سدير,روضة سدير,تمير,جلاجل,' +
        'جدة,مكة المكرمة,الطائف,رابغ,الليث,القنفذة,بحرة,خليص,الجموم,الخرمة,تربة,رنية,' +
        'المدينة المنورة,ينبع,العلا,بدر,خيبر,الحناكية,المهد,' +
        'الدمام,الخبر,الظهران,الأحساء,الهفوف,المبرز,الجبيل,القطيف,سيهات,صفوى,رأس تنورة,بقيق,الخفجي,حفر الباطن,النعيرية,قرية العليا,' +
        'بريدة,عنيزة,الرس,البكيرية,المذنب,البدائع,رياض الخبراء,عيون الجواء,الشماسية,' +
        'حائل,بقعاء,الشنان,الغزالة,موقق,السليمي,الحائط,سميراء,' +
        'تبوك,ضباء,الوجه,أملج,حقل,تيماء,البدع,' +
        'أبها,خميس مشيط,بيشة,محايل عسير,رجال ألمع,النماص,تنومة,ظهران الجنوب,سراة عبيدة,أحد رفيدة,بلقرن,تثليث,' +
        'جازان,صبيا,أبو عريش,صامطة,فرسان,بيش,الدرب,العارضة,' +
        'نجران,شرورة,حبونا,بدر الجنوب,يدمة,ثار,' +
        'الباحة,بلجرشي,المندق,المخواة,العقيق,القرى,' +
        'سكاكا,عرعر,القريات,طريف,دومة الجندل').split(',');
    var BRANCH_MODES = [
        { key: 'in-person', label: 'حضوري' },
        { key: 'online', label: 'عن بعد' },
        { key: 'hybrid', label: 'حضوري وعن بعد' }
    ];
    function brModeLabel(k) {
        for (var i = 0; i < BRANCH_MODES.length; i++) if (BRANCH_MODES[i].key === k) return BRANCH_MODES[i].label;
        return BRANCH_MODES[0].label;
    }

    /* ---------- التذكير بالموعد ---------- */
    var REMIND_OPTS = [15, 30, 60, 120, 180, 1440];
    var DUR_OPTS = [45, 60, 75, 90, 120, 180, 240];
    function durLabel(m) {
        m = m || 90;
        var h = Math.floor(m / 60), r = m % 60;
        if (h && r) return h + ' ساعة و ' + r + ' دقيقة';
        if (h === 1) return 'ساعة';
        if (h === 2) return 'ساعتان';
        if (h > 2) return h + ' ساعات';
        return m + ' دقيقة';
    }
    function timeLabel(iso) {
        var d = new Date(iso);
        if (isNaN(d.getTime())) return '';
        var h = d.getHours(), mm = d.getMinutes(), h12 = h % 12;
        if (h12 === 0) h12 = 12;
        return h12 + ':' + (mm < 10 ? '0' + mm : mm) + ' ' + (h < 12 ? 'صباحاً' : 'مساءً');
    }
    function salonEndISO(s) {
        var st = new Date((s && s.startsAt) || '');
        if (isNaN(st.getTime())) return '';
        return new Date(st.getTime() + ((s.durationMin || 90) * 60000)).toISOString();
    }
    function salonTimeRange(s) {
        var e = salonEndISO(s);
        if (!e) return '';
        return 'من ' + timeLabel(s.startsAt) + ' إلى ' + timeLabel(e);
    }
    /* فرع الصالون (إن حُدّد) */
    /* ============ بوابة الدفع: اشتراك الجلسة (تحويل بنكي + إيصال) ============ */
    function salonPrice(salon) {
        var n = Number((salon || {}).price);
        return (isFinite(n) && n > 0) ? Math.round(n) : 0;
    }
    function arPrice(n) { return num(n) + ' ر.س'; }
    function payInfo(d) {
        var p = (d && d.pay) || {};
        return {
            bank: p.bank || '', holder: p.holder || '', iban: p.iban || '',
            account: p.account || '', note: p.note || '', whatsapp: p.whatsapp || ''
        };
    }
    function payReady(d) { var p = payInfo(d); return !!(p.iban || p.account); }
    function copyToClipboard(txt) {
        txt = String(txt || '');
        if (!txt) return;
        try {
            if (navigator.clipboard && navigator.clipboard.writeText) {
                navigator.clipboard.writeText(txt).then(function () { toast('نُسخ: ' + txt, 'ok'); },
                    function () { toast('لم يُنسخ تلقائياً — انسخه يدوياً.', 'error'); });
                return;
            }
        } catch (e) {}
        toast('انسخه يدوياً: ' + txt, 'info');
    }
    function payStatusLabel(st) {
        if (st === 'confirmed') return '<span class="text-emerald-700 font-bold">✓ مدفوع ومؤكَّد</span>';
        if (st === 'rejected') return '<span class="text-red-700 font-bold">✗ رُفض الإيصال</span>';
        return '<span class="text-amber-700 font-bold">⏳ بانتظار مراجعة الإيصال</span>';
    }
    function savePaySettings() {
        if (!needPerm('bookings', 'الحجوزات')) return;
        var q = function (id) { var e = document.getElementById(id); return e ? e.value.trim() : ''; };
        var d = fullDoc();
        d.pay = {
            bank: q('payBank'), holder: q('payHolder'), iban: q('payIban'),
            account: q('payAccount'), note: q('payNote'), whatsapp: q('payWhats')
        };
        saveDoc(d); state = null; render();
        toast('حُفظت بيانات التحويل البنكي', 'ok');
    }
    function saveBadWords() {
        if (!needPerm('engage', 'النقاش والتصويت')) return;
        var el = document.getElementById('badWordsList');
        if (!el) return;
        var d = fullDoc();
        d.badWords = el.value.split(/[,\n،]+/).map(function (w) { return w.trim(); }).filter(Boolean);
        saveDoc(d); state = null; render();
        toast('حُفظت قائمة الكلمات الممنوعة (' + num(d.badWords.length) + ')', 'ok');
    }
    function renderBadWords(s) {
        var el = document.getElementById('badWordsList');
        if (!el) return;
        if (document.activeElement === el) return;
        el.value = badWords(fullDoc()).join('، ');
        var c = document.getElementById('badWordsCount');
        if (c) c.textContent = num(badWords(fullDoc()).length) + ' كلمة ممنوعة';
    }
    function renderAdminPay(s) {
        var box = document.getElementById('paySettings');
        if (!box) return;
        var d = fullDoc();
        var p = payInfo(d);
        box.querySelector('#payBank').value = p.bank;
        box.querySelector('#payHolder').value = p.holder;
        box.querySelector('#payIban').value = p.iban;
        box.querySelector('#payAccount').value = p.account;
        box.querySelector('#payNote').value = p.note;
        box.querySelector('#payWhats').value = p.whatsapp;
        var warn = box.querySelector('#payWarn');
        if (warn) {
            var ok = payReady(d);
            warn.textContent = ok ? '✓ بيانات التحويل جاهزة — الجلسات المدفوعة تعمل.' : '⚠ لا يمكن للأعضاء الدفع قبل إدخال الآيبان أو رقم الحساب.';
            warn.className = 'text-[11px] ' + (ok ? 'text-emerald-700' : 'text-amber-700');
        }
    }
    /* نافذة الدفع والاشتراك */
    function payModal(salon, guest, existing) {
        var d = fullDoc();
        var p = payInfo(d);
        var price = salonPrice(salon);
        if (!payReady(d)) { toast('لم تُضف الإدارة بيانات التحويل البنكي بعد — تواصل معنا.', 'error'); return; }
        var pic = (existing && existing.receipt) || '';
        var rows =
            '<div class="bg-matn-cream border border-matn-sand rounded-2xl p-3 space-y-2 text-xs">' +
                '<div class="font-bold text-matn-emerald text-sm">💳 المطلوب: ' + arPrice(price) + '</div>' +
                (p.bank ? '<div>البنك: <strong>' + esc(p.bank) + '</strong></div>' : '') +
                (p.holder ? '<div>المستفيد: <strong>' + esc(p.holder) + '</strong></div>' : '') +
                (p.iban ? '<div class="flex flex-wrap items-center gap-2">الآيبان: <strong class="matn-code" dir="ltr">' + esc(p.iban) + '</strong>' +
                    '<button type="button" data-action="copy" data-copy="' + esc(p.iban) + '" class="text-[10px] font-bold text-matn-emerald border border-matn-sand rounded-lg px-2 py-0.5">نسخ</button></div>' : '') +
                (p.account ? '<div class="flex flex-wrap items-center gap-2">رقم الحساب: <strong class="matn-code" dir="ltr">' + esc(p.account) + '</strong>' +
                    '<button type="button" data-action="copy" data-copy="' + esc(p.account) + '" class="text-[10px] font-bold text-matn-emerald border border-matn-sand rounded-lg px-2 py-0.5">نسخ</button></div>' : '') +
                (p.note ? '<div class="text-[11px] text-matn-muted whitespace-pre-line">' + esc(p.note) + '</div>' : '') +
                '<div class="text-[10px] text-matn-muted">حوّل المبلغ ثم ارفع صورة الإيصال — يتفعّل اشتراكك بعد تأكيد الإدارة.</div>' +
            '</div>';
        modal({
            title: 'الاشتراك في الجلسة — تحويل بنكي',
            body: rows +
                '<label class="matn-field"><span>رقم العملية / اسم المُحوِّل (اختياري)</span><input class="matn-input" id="pyRef" type="text" value="' + esc((existing && existing.ref) || '') + '" placeholder="مثال: 123456789"></label>' +
                '<label class="matn-field"><span>صورة الإيصال (مطلوبة)</span></label>' +
                '<input type="file" id="pyFile" accept="image/*" class="hidden">' +
                '<div class="flex flex-wrap items-center gap-3">' +
                    '<button type="button" id="pyPick" class="matn-preset">📎 اختر صورة الإيصال</button>' +
                    '<img id="pyPrev" alt="" class="' + (pic ? '' : 'hidden') + ' w-20 h-20 rounded-xl object-cover border border-matn-sand" src="' + esc(pic) + '">' +
                '</div>' +
                '<p id="pyMsg" class="text-xs mt-1 ' + (existing && existing.payStatus === 'pending' ? 'text-amber-700' : '') + '">' +
                    (existing && existing.payStatus === 'pending' ? 'إيصالك السابق قيد المراجعة — يمكنك رفع إيصال أحدث.' : '') + '</p>',
            footer: '<button type="button" id="pyGo" class="bg-matn-emerald hover:bg-matn-emeraldLight text-white px-4 py-2.5 rounded-xl text-xs font-bold transition">أرسل الإيصال وفعّل الاشتراك</button>' + okBtn('إلغاء'),
            ready: function (w) {
                var msg = w.querySelector('#pyMsg');
                var prev = w.querySelector('#pyPrev');
                w.querySelector('#pyPick').addEventListener('click', function () { w.querySelector('#pyFile').click(); });
                w.querySelector('#pyFile').addEventListener('change', function (ev) {
                    var f = ev.target.files && ev.target.files[0];
                    if (!f) return;
                    msg.textContent = 'جارٍ تجهيز الإيصال…'; msg.className = 'text-xs mt-1 text-matn-muted';
                    compressImage(f, 900, 0.7).then(function (url) {
                        pic = url; prev.src = url; prev.classList.remove('hidden');
                        msg.textContent = 'جهّزنا الإيصال — اضغط الإرسال.'; msg.className = 'text-xs mt-1 text-emerald-700';
                    }).catch(function () { msg.textContent = 'تعذّر قراءة الصورة.'; msg.className = 'text-xs mt-1 text-red-700'; });
                });
                w.querySelectorAll('[data-action="copy"]').forEach(function (b) {
                    b.addEventListener('click', function () { copyToClipboard(b.getAttribute('data-copy')); });
                });
                w.querySelector('#pyGo').addEventListener('click', function () {
                    if (!pic) { msg.textContent = 'ارفع صورة الإيصال أولاً.'; msg.className = 'text-xs mt-1 text-red-700'; return; }
                    var ref = w.querySelector('#pyRef').value.trim();
                    closeModal();
                    if (existing) {
                        change(function (st) {
                            var b = (st.myBookings || {})[salon.id];
                            if (!b) return;
                            b.receipt = pic; b.ref = ref; b.payStatus = 'pending';
                            b.amount = price; b.paidAt = new Date().toISOString();
                            st.booking = b;
                        });
                        toast('حُدِّث الإيصال — بانتظار تأكيد الإدارة', 'ok');
                        return;
                    }
                    var g = guest || { name: '', email: '', phone: '' };
                    doBook(g.name, g.email, g.phone, { amount: price, receipt: pic, ref: ref, payStatus: 'pending' });
                    var ds = fullDoc();
                    var admins = adminsOf(ds, ds.authUser);
                    var txt = '💳 اشتراك جديد بانتظار التأكيد' +
                        '\nالجلسة: ' + (salon.title || '') +
                        '\nالمبلغ: ' + arPrice(price) +
                        '\nالعضو: ' + ((ds.accounts[ds.authUser] || {}).name || ds.authUser) +
                        (ref ? ('\nرقم العملية: ' + ref) : '') +
                        '\nراجع الإيصال من: لوحة الإدارة ← الحجوزات';
                    var at = new Date().toISOString();
                    if (admins.length) {
                        ds.notices = ds.notices || [];
                        admins.forEach(function (t) {
                            ds.notices.unshift({ id: 'nt-' + rnd(6), to: t, text: txt, kind: 'pay', from: ds.authUser, at: at, read: false });
                        });
                        saveDoc(ds); state = null; load(); render();
                    }
                });
            }
        });
    }
    /* 🛒 شراء الكتاب — تحويل بنكي + إيصال (طلب يُراجعه المشرف) */
    function bookPrice() { return Math.max(0, parseInt((fullDoc().book || {}).price, 10) || 0); }
    function orderModal(kind, refId, title, price) {
        var d = fullDoc();
        var p = payInfo(d);
        if (!payReady(d)) { toast('لم تُضف الإدارة بيانات التحويل البنكي بعد.', 'error'); return; }
        var pic = '';
        modal({
            title: 'شراء: ' + title,
            body: '<div class="bg-matn-cream border border-matn-sand rounded-2xl p-3 space-y-2 text-xs">' +
                    '<div class="font-bold text-matn-emerald text-sm">💳 المطلوب: ' + arPrice(price) + '</div>' +
                    (p.bank ? '<div>البنك: <strong>' + esc(p.bank) + '</strong></div>' : '') +
                    (p.holder ? '<div>المستفيد: <strong>' + esc(p.holder) + '</strong></div>' : '') +
                    (p.iban ? '<div class="flex flex-wrap items-center gap-2">الآيبان: <strong class="matn-code" dir="ltr">' + esc(p.iban) + '</strong><button type="button" data-action="copy" data-copy="' + esc(p.iban) + '" class="text-[10px] font-bold text-matn-emerald border border-matn-sand rounded-lg px-2 py-0.5">نسخ</button></div>' : '') +
                    (p.account ? '<div class="flex flex-wrap items-center gap-2">رقم الحساب: <strong class="matn-code" dir="ltr">' + esc(p.account) + '</strong><button type="button" data-action="copy" data-copy="' + esc(p.account) + '" class="text-[10px] font-bold text-matn-emerald border border-matn-sand rounded-lg px-2 py-0.5">نسخ</button></div>' : '') +
                    (p.note ? '<div class="text-[11px] text-matn-muted whitespace-pre-line">' + esc(p.note) + '</div>' : '') +
                    '<div class="text-[10px] text-matn-muted">حوّل المبلغ ثم ارفع صورة الإيصال — يتأكد الطلب بعد مراجعة الإدارة.</div>' +
                '</div>' +
                '<label class="matn-field"><span>رقم العملية / اسم المُحوِّل (اختياري)</span><input class="matn-input" id="orRef" type="text" placeholder="مثال: 123456789"></label>' +
                '<input type="file" id="orFile" accept="image/*" class="hidden">' +
                '<div class="flex flex-wrap items-center gap-3">' +
                    '<button type="button" id="orPick" class="matn-preset">📎 اختر صورة الإيصال</button>' +
                    '<img id="orPrev" alt="" class="hidden w-20 h-20 rounded-xl object-cover border border-matn-sand">' +
                '</div><p id="orMsg" class="text-xs mt-1"></p>',
            footer: '<button type="button" id="orGo" class="bg-matn-emerald hover:bg-matn-emeraldLight text-white px-4 py-2.5 rounded-xl text-xs font-bold transition">أرسل الطلب</button>' + okBtn('إلغاء'),
            ready: function (w) {
                var msg = w.querySelector('#orMsg');
                var prev = w.querySelector('#orPrev');
                w.querySelector('#orPick').addEventListener('click', function () { w.querySelector('#orFile').click(); });
                w.querySelector('#orFile').addEventListener('change', function (ev) {
                    var f = ev.target.files && ev.target.files[0];
                    if (!f) return;
                    msg.textContent = 'جارٍ تجهيز الإيصال…'; msg.className = 'text-xs mt-1 text-matn-muted';
                    compressImage(f, 900, 0.7).then(function (url) {
                        pic = url; prev.src = url; prev.classList.remove('hidden');
                        msg.textContent = 'جهّزنا الإيصال.'; msg.className = 'text-xs mt-1 text-emerald-700';
                    }).catch(function () { msg.textContent = 'تعذّر قراءة الصورة.'; msg.className = 'text-xs mt-1 text-red-700'; });
                });
                w.querySelectorAll('[data-action="copy"]').forEach(function (b) {
                    b.addEventListener('click', function () { copyToClipboard(b.getAttribute('data-copy')); });
                });
                w.querySelector('#orGo').addEventListener('click', function () {
                    if (!pic) { msg.textContent = 'ارفع صورة الإيصال أولاً.'; msg.className = 'text-xs mt-1 text-red-700'; return; }
                    var ref = w.querySelector('#orRef').value.trim();
                    var d2 = fullDoc();
                    d2.orders = d2.orders || [];
                    d2.orders.unshift({
                        id: 'or-' + rnd(6), kind: kind, refId: refId, title: title, amount: price,
                        receipt: pic, ref: ref, user: d2.authUser,
                        name: (d2.accounts[d2.authUser] || {}).name || d2.authUser,
                        at: new Date().toISOString(), status: 'pending'
                    });
                    var targets = adminsOf(d2, d2.authUser);
                    var txt = '🛒 طلب شراء جديد\n' + title + '\nالمبلغ: ' + arPrice(price) +
                        '\nالطالب: ' + ((d2.accounts[d2.authUser] || {}).name || d2.authUser) +
                        (ref ? ('\nرقم العملية: ' + ref) : '') + '\nراجعه من: لوحة الإدارة ← بوابة الدفع';
                    var at = new Date().toISOString();
                    targets.forEach(function (t) {
                        d2.notices.unshift({ id: 'nt-' + rnd(6), to: t, text: txt, kind: 'order', from: d2.authUser, at: at, read: false });
                        d2.messages.unshift({ id: 'ms-' + rnd(6), from: d2.authUser, to: t, text: txt, at: at, read: false, system: true });
                    });
                    saveDoc(d2); state = null; closeModal(); load(); render();
                    toast('أُرسل طلبك — بانتظار تأكيد الإدارة', 'ok');
                });
            }
        });
    }
    /* قائمة التصويتات في اللوحة */
    function renderAdminPolls(s) {
        var box = document.getElementById('adminPollList');
        if (!box) return;
        var list = pollsOf(fullDoc());
        box.innerHTML = list.length ? list.map(function (p) {
            var total = Object.keys(p.votes || {}).length;
            return '<li class="flex flex-wrap items-center justify-between gap-2 py-2 border-b border-matn-sand/60 text-xs">' +
                '<span class="min-w-0"><strong>' + esc(clip(p.question, 55)) + '</strong>' +
                    '<span class="block text-[10px] text-matn-muted">' + pollStateLabel(p) +
                    (pollWhenLabel(p) ? (' · ' + esc(pollWhenLabel(p))) : '') + ' · ' + num(total) + ' صوت</span></span>' +
                '<span class="flex items-center gap-3 shrink-0">' +
                    '<button type="button" data-action="edit-poll-id" data-pid="' + esc(p.id) + '" class="text-matn-emerald font-bold hover:underline">✏️ تعديل</button>' +
                    '<button type="button" data-action="del-poll" data-pid="' + esc(p.id) + '" class="text-red-700 font-bold hover:underline">حذف</button>' +
                '</span></li>';
        }).join('') : '<li class="text-xs text-matn-muted py-2">لا تصويتات بعد — اضغط «+ تصويت جديد».</li>';
    }
    function deletePoll(id) {
        if (!needPerm('engage', 'التصويت')) return;
        confirmBox('حذف التصويت', 'سيُحذف التصويت وأصواته وتعليقاته. لا يمكن التراجع.', function () {
            var d = fullDoc();
            d.polls = (d.polls || []).filter(function (x) { return x.id !== id; });
            d.posts = (d.posts || []).filter(function (x) { return x.topic !== pollCommentTopic(id); });
            d.poll = activePoll(d) || (d.polls[0] || null);
            saveDoc(d); state = null; load(); render();
            toast('حُذف التصويت', 'ok');
        }, 'حذف');
    }
    function reviewOrder(id, ok) {
        if (!needPerm('bookings', 'الحجوزات')) return;
        var d = fullDoc();
        var o = (d.orders || []).filter(function (x) { return x.id === id; })[0];
        if (!o) return;
        confirmBox(ok ? 'تأكيد الطلب' : 'رفض الطلب', ok
            ? ('سيُؤكَّد طلب «' + o.name + '» — ' + o.title + ' (' + arPrice(o.amount) + ').')
            : ('سيُرفض طلب «' + o.name + '».'), function () {
            var d2 = fullDoc();
            var o2 = (d2.orders || []).filter(function (x) { return x.id === id; })[0];
            if (!o2) return;
            o2.status = ok ? 'confirmed' : 'rejected';
            o2.reviewedAt = new Date().toISOString();
            var txt = (ok ? '✅ تأكيد طلبك: ' : '✗ رُفض طلبك: ') + o2.title + ' — تابع مع الإدارة للاستلام.';
            d2.notices.unshift({ id: 'nt-' + rnd(6), to: o2.user, text: txt, kind: 'order', from: d2.authUser, at: new Date().toISOString(), read: false });
            d2.messages.unshift({ id: 'ms-' + rnd(6), from: d2.authUser, to: o2.user, text: txt, at: new Date().toISOString(), read: false, system: true });
            saveDoc(d2); state = null; load(); render();
            toast(ok ? 'تأكّد الطلب' : 'رُفض الطلب', 'ok');
        }, ok ? 'تأكيد' : 'رفض');
    }
    function renderAdminOrders(s) {
        var box = document.getElementById('adminOrderList');
        if (!box) return;
        var list = (fullDoc().orders || []).slice(0, 30);
        box.innerHTML = list.length ? list.map(function (o) {
            var st = o.status === 'confirmed' ? '<span class="text-emerald-700 font-bold">✓ مؤكَّد</span>'
                : o.status === 'rejected' ? '<span class="text-red-700 font-bold">✗ مرفوض</span>'
                : '<span class="text-amber-700 font-bold">⏳ جديد</span>';
            return '<li class="flex flex-wrap items-center justify-between gap-2 py-2 border-b border-matn-sand/60 text-xs">' +
                '<span class="min-w-0"><strong>' + esc(o.name) + '</strong> <span class="text-matn-muted">@' + esc(o.user) + '</span>' +
                    '<span class="block text-[10px] text-matn-muted">' + esc(clip(o.title, 40)) + ' · ' + esc(fmtDate(o.at)) + (o.ref ? (' · عملية: ' + esc(clip(o.ref, 14))) : '') + '</span></span>' +
                '<span class="flex flex-wrap items-center gap-2 shrink-0">' +
                    '<span class="font-bold text-matn-emerald">' + arPrice(o.amount) + '</span>' + st +
                    (o.receipt ? '<img src="' + esc(safeImg(o.receipt)) + '" data-zoom="' + esc(safeImg(o.receipt)) + '" class="w-10 h-10 rounded-lg object-cover border border-matn-sand" alt="إيصال">' : '') +
                    (o.status === 'pending' ? ('<button type="button" data-action="order-ok" data-oid="' + esc(o.id) + '" class="bg-emerald-700 text-white px-2.5 py-1.5 rounded-lg font-bold">✅ تأكيد</button>' +
                        '<button type="button" data-action="order-no" data-oid="' + esc(o.id) + '" class="bg-white border border-red-200 text-red-700 px-2.5 py-1.5 rounded-lg font-bold">✗ رفض</button>') : '') +
                '</span></li>';
        }).join('') : '<li class="text-xs text-matn-muted py-2">لا طلبات شراء.</li>';
    }
    function reviewPayment(uname, sid, ok) {
        if (!needPerm('bookings', 'الحجوزات')) return;
        var d = fullDoc();
        var a = d.accounts[uname];
        var b = a && a.bookings ? a.bookings[sid] : null;
        if (!b) return;
        confirmBox(ok ? 'تأكيد الدفع' : 'رفض الإيصال', ok
            ? ('سيُفعَّل اشتراك «' + a.name + '» في الجلسة ويُثبَّت مقعده (' + arPrice(b.amount || 0) + ').')
            : ('سيُرفض إيصال «' + a.name + '» ويُفرَّغ مقعده، ويستطيع رفع إيصال جديد.'), function () {
            var d2 = fullDoc();
            var b2 = d2.accounts[uname].bookings[sid];
            b2.payStatus = ok ? 'confirmed' : 'rejected';
            b2.reviewedAt = new Date().toISOString();
            if (ok) {
                d2.accounts[uname].points = (d2.accounts[uname].points || 0) + 20;
                d2.accounts[uname].ledger = d2.accounts[uname].ledger || [];
                d2.accounts[uname].ledger.unshift({ reason: 'اشتراك مؤكد في جلسة صالون', points: 20, at: new Date().toISOString() });
            } else {
                delete d2.accounts[uname].bookings[sid];
            }
            var txt = ok ? ('✅ تأكيد اشتراكك في «' + (b.title || '') + '» — أُضيفت 20 نقطة لرصيدك.')
                         : ('✗ رُفض إيصال اشتراكك في «' + (b.title || '') + '» — يمكنك رفع إيصال جديد.');
            var at = new Date().toISOString();
            d2.notices.unshift({ id: 'nt-' + rnd(6), to: uname, text: txt, kind: 'pay', from: d2.authUser, at: at, read: false });
            d2.messages.unshift({ id: 'ms-' + rnd(6), from: d2.authUser, to: uname, text: txt, at: at, read: false, system: true });
            saveDoc(d2); state = null; load(); render();
            toast(ok ? 'فُعّل الاشتراك' : 'رُفض الإيصال', 'ok');
        }, ok ? 'تأكيد' : 'رفض');
    }

    /* اسم الصالون الذي سيقيم الجلسة (المقر → الفرع → المكان) */
    function salonName(s, salon) {
        salon = salon || (s && s.salon) || {};
        if (salon.venue) return salon.venue;
        var br = salonBranch(s, salon.branchId);
        if (br) return (br.name || br.city || '') + (br.city && br.name && br.name !== br.city ? (' — ' + br.city) : '');
        if (salon.where) return salon.where;
        if (salon.city) return 'صالون ' + salon.city;
        return 'صالون مَتن';
    }
    function salonBranch(s, id) {
        if (!id) return null;
        var br = ((s && s.branches) || []).filter(function (b) { return b.id === id; })[0];
        return br || null;
    }
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
        var end = new Date(salonEndISO(salon));
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
        var end = new Date(salonEndISO(salon));
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
        { id: 'p-lavender', name: 'مشغل لافندر للعناية النسائية', tag: 0, desc: 'قسيمة خصم 100 ريال لكافة الخدمات التجميلية والمساج الأروماتك.', cost: 120, prefix: 'LAV',
          city: 'الرياض', place: 'حي الياسمين', street: 'طريق أنس بن مالك', mall: 'لافندر بارك — الدور الثاني',
          link: 'https://www.google.com/maps/search/?api=1&query=24.816944,46.636111' },
        { id: 'p-vita', name: 'نادي فيتا للياقة النسائية', tag: 1, desc: 'اشتراك أسبوعي تجريبي كامل شامل الصالة وحصص البيلاتس واليوغا.', cost: 150, prefix: 'VITA',
          city: 'الرياض', place: 'حي الملقا', street: 'طريق الملك سلمان', mall: 'فيتا مول — الدور الأرضي',
          link: 'https://www.google.com/maps/search/?api=1&query=24.774,46.6' },
        { id: 'p-sofia', name: 'مقهى ومكتبة صوفيا', tag: 2, desc: 'مشروب قهوة مختصة مجاني مع حجز ركن قراءة هادئ لمدة ساعتين.', cost: 50, prefix: 'SOF',
          city: 'الرياض', place: 'حي حطين', street: 'طريق الأمير تركي', mall: 'الرياض بارك — بوابة ٤',
          link: 'https://www.google.com/maps/search/?api=1&query=24.83,46.62' }
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
                desc: '', mode: 'hybrid', link: '', startsAt: '', reminderMin: 60, poster: '',
                city: 'الرياض', branchId: 'br-yasmin', venue: 'صالون مَتن - فرع الياسمين',
                venueKind: 'cafe', durationMin: 120, at: new Date().toISOString()
            }],
            seatsLeft: SESSION.seats,
            partners: SEED_PARTNERS.slice(),
            giftCodes: JSON.parse(JSON.stringify(SEED_CODES)),
            recording: { title: '', url: '' },
            branches: [{
                id: 'br-yasmin', city: 'الرياض', name: 'فرع الياسمين',
                place: 'صالون مَتن - فرع الياسمين',
                link: 'https://www.google.com/maps/search/?api=1&query=24.816944,46.636111',
                mode: 'hybrid', activity: 'صالونات القراءة والحوار', featured: true, at: new Date().toISOString()
            }],
            book: { title: '', author: '', cover: '', desc: '', url: '' },
            posts: [],
            poll: null
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

    /* الصالون المعروض: **الأقرب موعداً** تلقائياً، ثم الذي يليه بعده */
    function featuredSalon(d) {
        var l = (d && d.salons) || [];
        if (!l.length) return null;
        var now = Date.now();
        var upcoming = l.filter(function (x) { return x.startsAt && new Date(x.startsAt).getTime() >= now; });
        if (upcoming.length) {
            upcoming.sort(function (a, b) { return new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime(); });
            return upcoming[0];
        }
        var past = l.filter(function (x) { return x.startsAt; });
        if (past.length && past.length === l.length) {
            past.sort(function (a, b) { return new Date(b.startsAt).getTime() - new Date(a.startsAt).getTime(); });
            return past[0];
        }
        return l.filter(function (x) { return x.featured; })[0] || l[0];
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
            var bk = d.accounts[u].bookings || {};
            if (bk[sid]) n++;
            else if (d.accounts[u].booking && d.accounts[u].booking.salonId === sid) n++;
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
            if (typeof x.desc !== 'string') { x.desc = ''; dirty = true; }
            if (typeof x.poster !== 'string') { x.poster = ''; dirty = true; }
            if (typeof x.city !== 'string') { x.city = ''; dirty = true; }
            if (typeof x.branchId !== 'string') { x.branchId = ''; dirty = true; }
            if (!(x.durationMin > 0)) { x.durationMin = 90; dirty = true; }
            if (typeof x.venue !== 'string') { x.venue = ''; dirty = true; }
            if (typeof x.venueKind !== 'string') { x.venueKind = 'cafe'; dirty = true; }
            if (typeof x.venueLink !== 'string') { x.venueLink = ''; dirty = true; }
        });
        Object.keys(d.accounts || {}).forEach(function (u) {
            var a = d.accounts[u];
            /* مشرف قديم بلا صلاحيات → كل الصلاحيات */
            if (a.isAdmin && !a.super && !Array.isArray(a.perms)) { a.perms = ALL_PERMS.slice(); dirty = true; }
            if (!Array.isArray(a.perms)) { a.perms = []; dirty = true; }
            /* حجز قديم بلا صالون → يُنسب للصالون القادم */
            if (a.booking && !a.booking.salonId && feat) { a.booking.salonId = feat.id; dirty = true; }
            if (!a.bookings || typeof a.bookings !== 'object') { a.bookings = {}; dirty = true; }
            if (a.booking) {
                if (a.booking.salonId) a.bookings[a.booking.salonId] = a.booking;
                delete a.booking;
                dirty = true;
            }
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
    /* ترحيل الفروع والكتاب والنقاش */
    function migrateExtra(d) {
        var dirty = false;
        if (!Array.isArray(d.branches)) { d.branches = seedDoc().branches; dirty = true; }
        if (!d.book || typeof d.book !== 'object') { d.book = { title: '', author: '', cover: '', desc: '', url: '' }; dirty = true; }
        if (!Array.isArray(d.posts)) { d.posts = []; dirty = true; }
        if (typeof d.poll === 'undefined') { d.poll = null; dirty = true; }
        if (!Array.isArray(d.messages)) { d.messages = []; dirty = true; }
        if (!Array.isArray(d.notices)) { d.notices = []; dirty = true; }
        if (!Array.isArray(d.polls)) { d.polls = d.poll && d.poll.question ? [d.poll] : []; dirty = true; }
        Object.keys(d.accounts || {}).forEach(function (u) {
            var a = d.accounts[u];
            if (typeof a.avatar !== 'string') { a.avatar = ''; dirty = true; }
            if (typeof a.minutes !== 'number') { a.minutes = 0; dirty = true; }
            if (!Array.isArray(a.diary)) { a.diary = []; dirty = true; }
        });
        /* حساب الدعم الفني (نظامي — لا يستطيع تسجيل الدخول) */
        if (!d.accounts.support) {
            d.accounts.support = {
                name: 'الدعم الفني لنادي القراءة', hash: '', points: 0,
                ledger: [], vouchers: [], bookings: {}, isAdmin: false, super: false,
                perms: [], system: true, avatar: '', minutes: 0,
                createdAt: new Date().toISOString()
            };
            dirty = true;
        }
        if (dirty) saveDoc(d);
        return d;
    }
    function fullDoc() { return migrateExtra(migrateAll(doc())); }

    var state = null;

    function load() {
        if (state) return state;
        var d = fullDoc();
        var acc = (d.authUser && d.accounts[d.authUser]) ? d.accounts[d.authUser] : null;
        if (acc && acc.suspended) acc = null;
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
            branches: d.branches || [],
            book: d.book || { title: '', author: '', cover: '', desc: '', url: '' },
            posts: d.posts || [],
            poll: activePoll(d),
            polls: pollsOf(d),
            messages: d.messages || [],
            notices: d.authUser ? (d.notices || []).filter(function (n) { return n.to === d.authUser; }) : [],
            accounts: d.accounts || {},
            canMessage: (function () {
                if (!acc) return false;
                if (acc.system) return false;
                if (acc.super || acc.isAdmin) return true;
                return (acc.points || 0) >= 500;
            })(),
            myStats: acc ? {
                points: acc.points || 0, minutes: acc.minutes || 0,
                replies: (d.posts || []).filter(function (p) { return p.user === d.authUser; }).length,
                avatar: acc.avatar || ''
            } : null,
            giftCodes: d.giftCodes && typeof d.giftCodes === 'object' ? d.giftCodes : JSON.parse(JSON.stringify(SEED_CODES)),
            recording: d.recording && typeof d.recording === 'object' ? d.recording : { title: '', url: '' },
            myBookings: acc ? (acc.bookings || {}) : {},
            booking: (acc && acc.bookings && feat) ? (acc.bookings[feat.id] || null) : null,
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
        d.branches = state.branches;
        d.book = state.book;
        d.posts = state.posts;
        d.poll = state.poll;
        d.messages = state.messages || [];
        var u = state.user && state.user.username;
        if (u && d.accounts[u]) {
            d.accounts[u].points = state.user.points;
            d.accounts[u].bookings = state.myBookings || {};
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
        SUSPENDED: 'هذا الحساب موقوف من إدارة النادي — تواصل مع المشرف العام.',
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
            var first = !Object.keys(d.accounts).some(function (u) { return !d.accounts[u].system; });
            d.accounts[uname] = {
                name: String(name || '').trim() || uname,
                hash: hash,
                points: 340,                       // رصيد ترحيبي
                ledger: [{ reason: 'رصيد ترحيبي عند التسجيل', points: 340, at: new Date().toISOString() }],
                vouchers: [], bookings: {},
                avatar: '', minutes: 0,
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
        if (acc.suspended) return Promise.reject({ code: 'SUSPENDED' });
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
        var d = fullDoc();
        var bk = s.myBookings || {};
        var ids = Object.keys(bk);
        if (!ids.length) return null;
        if (s.salon && bk[s.salon.id]) return salonById(d, s.salon.id) || s.salon;
        var cands = ids.map(function (id) { return salonById(d, id); }).filter(Boolean)
            .filter(function (x) { return x.startsAt && new Date(x.startsAt).getTime() >= Date.now(); })
            .sort(function (a, b2) { return new Date(a.startsAt) - new Date(b2.startsAt); });
        return cands[0] || salonById(d, ids[0]) || null;
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
        var d = fullDoc();
        var s = load();
        var mine = (d.authUser && d.accounts[d.authUser]) ? d.accounts[d.authUser] : null;
        var bs0 = bookedSalon();
        var phone = (mine && mine.phone) || ((bs0 && s.myBookings && s.myBookings[bs0.id]) ? s.myBookings[bs0.id].phone : '') || '';
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
        var d = fullDoc();
        var u = d.authUser;
        if (u && d.accounts[u]) d.accounts[u].phone = p;
        if (u && d.accounts[u] && d.accounts[u].bookings) {
            Object.keys(d.accounts[u].bookings).forEach(function (k) { d.accounts[u].bookings[k].phone = p; });
        }
        var g = readGuest(); saveGuest(g.name || '', g.email || '', p);
        saveDoc(d); refresh();
        toast('حُفظ رقم الواتساب', 'ok');
    }

    /* صورة العضو الشخصية */
    function avatarForm() {
        if (needsLogin()) { requireLogin('الصورة الشخصية'); return; }
        var d = fullDoc();
        var a = d.accounts[d.authUser] || {};
        var pic = a.avatar || '';
        modal({
            title: 'صورتي الشخصية',
            body: '<p class="text-xs text-matn-muted mb-3">تظهر في «وسام التميّز» وفي الرسائل الخاصة.</p>' +
                  '<input type="file" id="avFile" accept="image/*" class="hidden">' +
                  '<div class="flex flex-wrap items-center gap-3">' +
                    '<img id="avPrev" alt="" class="w-20 h-20 rounded-full object-cover border border-matn-sand ' + (pic ? '' : 'hidden') + '" src="' + esc(pic) + '">' +
                    '<button type="button" id="avPick" class="matn-preset">📁 اختر صورة من جهازك</button>' +
                    '<button type="button" id="avDel" class="matn-preset">إزالة</button>' +
                  '</div><p id="avMsg" class="text-xs mt-2"></p>',
            footer: '<button type="button" id="avGo" class="bg-matn-emerald hover:bg-matn-emeraldLight text-white px-4 py-2.5 rounded-xl text-xs font-bold transition">حفظ</button>' + okBtn('إلغاء'),
            ready: function (w) {
                var prev = w.querySelector('#avPrev');
                w.querySelector('#avPick').addEventListener('click', function () { w.querySelector('#avFile').click(); });
                w.querySelector('#avFile').addEventListener('change', function (ev) {
                    var f = ev.target.files && ev.target.files[0];
                    if (!f) return;
                    var m = w.querySelector('#avMsg'); m.textContent = 'جارٍ تجهيز الصورة…'; m.className = 'text-xs text-matn-muted';
                    compressImage(f, 240, 0.85).then(function (url) {
                        pic = url; prev.src = url; prev.classList.remove('hidden');
                        m.textContent = 'حُضّرت الصورة — اضغط حفظ.'; m.className = 'text-xs text-emerald-700';
                    }).catch(function () { m.textContent = 'تعذّر قراءة الصورة.'; m.className = 'text-xs text-red-700'; });
                });
                w.querySelector('#avDel').addEventListener('click', function () { pic = ''; prev.removeAttribute('src'); prev.classList.add('hidden'); });
                w.querySelector('#avGo').addEventListener('click', function () {
                    var nd = fullDoc();
                    if (nd.accounts[nd.authUser]) nd.accounts[nd.authUser].avatar = pic;
                    saveDoc(nd); closeModal(); refresh();
                    toast('حُفظت صورتك', 'ok');
                });
            }
        });
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
        return AR_DAYS[d.getDay()] + ' ' + d.getDate() + ' ' + AR_MONTHS[d.getMonth()];
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
        var booked = a.bookings && Object.keys(a.bookings).length > 0;
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
        var bks = (a && a.bookings) || {};
        if (!a || !Object.keys(bks).length) return;
        var codes = Object.keys(bks).map(function (k) { return bks[k].code; }).join(' ، ');
        confirmBox('إلغاء الحجوزات', 'ستُلغى كل حجوزات «' + a.name + '» (' + Object.keys(bks).length + ' حجز: ' + codes + ') وتُفرَّغ مقاعدها.', function () {
            a.bookings = {};
            saveDoc(d); refresh();
            toast('أُلغي الحجز وأُفرغ المقعد', 'ok');
        }, 'إلغاء الحجز');
    }

    /* ---------- أعضاء تجريبيون (للتجربة — يمكن حذفهم أو إيقافهم) ---------- */
    var DEMO_PASS = 'matn1234';
    var DEMO_MEMBERS = [
        { u: 'noura', n: 'نورة العتيبي', p: 1240, m: 1860 },
        { u: 'sara', n: 'سارة القحطاني', p: 1105, m: 1425 },
        { u: 'reem', n: 'ريم الشهري', p: 980, m: 1190 },
        { u: 'lama', n: 'لمى الدوسري', p: 860, m: 960 },
        { u: 'jawaher', n: 'جواهر الحربي', p: 735, m: 780 },
        { u: 'haya', n: 'هيا المطيري', p: 620, m: 640 }
    ];
    var DEMO_DIARIES = [
        'اليوم أنهيت الفصل السابع من «ثلاثية غرناطة»… جلست بعد العشاء أعيد قراءة صفحتين ثلاثاً. شعرت أن الغرناطي في الرواية لا يتحدث عن مدينة فقط، بل عن طريقة في العيش تنقرض بهدوء.\n\nاقتباس توقفت عنده: «وكان الفقد أكبر من أن يُحكى».',
        'عادة صغيرة غيّرت قراءتي: أكتب في هامش الكتاب سؤالاً واحداً فقط في كل فصل، ثم أعود للأسئلة في نهاية الكتاب. اكتشفت أن معظم أسئلتي كانت عن الخوف لا عن الحكاية.',
        'قرأت هذا الصباح في المقهى مع كوب قهوة بارد (نسيته بين الصفحات 😅). أحب أن أقرأ في الأماكن العامة — صوت الناس البعيد يجعلني أدخل النص أعمق.',
        'يوم ثقيل قليلاً، فلم أقرأ إلا ثلاث صفحات. تعلّمت أن أتعامل مع القراءة كمزاج لا كواجب: أحياناً صفحة واحدة تفعل بالقلب أكثر من مئة.',
        'أفكر جدياً في كتابة قائمة «كتب أعيد قراءتها كل سنة» — ليس لأنها الأفضل، بل لأنني أتغيّر وقراءتي تتغيّر معي. أول كتاب في القائمة: «موسم الهجرة إلى الشمال».',
        'أعجبني في جلسة الصالون أن الاختلاف في التفسير لم يُفسد الحوار، بل جعله أعمق. خرجت بفكرة: لكل قارئ حقه في نسخته الخاصة من الكتاب.'
    ];
    var DEMO_TEXTS = [
        'ثلاثية غرناطة جعلتني أعيد التفكير في معنى الفقد… أسلوب رضوى عاشور شعري حتى في النثر.',
        'أحببت أن لكل شخصية صوتاً مستقلاً — كأننا نسمع الحكاية من ست جهات.',
        'اقتباس بقي معي: «وكان الفقد أكبر من أن يُحكى» — ناقشناه طويلاً في الجلسة.',
        'أقترح للجلسة القادمة كتاباً أقصر مع أسئلة نقاش جاهزة، ليكون الحوار أعمق.',
        'فكرة: لنجعل نصف الجلسة للكتاب ونصفها الآخر لربط الأحداث بواقعنا اليوم.',
        'سعدت بالمجموعة — تعليقاتكم على الفصل الأخير غيّرت قراءتي للنهاية تماماً.'
    ];
    function seedDemo() {
        if (!needPerm('members', 'إدارة الأعضاء')) return;
        var d = fullDoc();
        var exists = DEMO_MEMBERS.filter(function (m) { return d.accounts[m.u]; });
        modal({
            title: 'أعضاء تجريبيون',
            body: '<p class="text-xs text-matn-muted leading-relaxed mb-3">ستُنشأ <strong>٦ حسابات تجريبية</strong> بأسماء بنات، بكلمة مرور موحّدة <code class="matn-code">' + DEMO_PASS + '</code>، وبأوقات تواجد ونقاط تجعلها تظهر في «🏵 وسام التميّز».</p>' +
                  (exists.length ? '<p class="text-xs bg-amber-50 border border-amber-200 rounded-xl px-3 py-2 mb-3">يوجد ' + num(exists.length) + ' من هذه الأسماء مسبقاً — سيُحدَّث بدل تكراره.</p>' : '') +
                  '<label class="flex items-center gap-2 text-xs bg-matn-cream rounded-xl px-3 py-2.5 border border-matn-sand cursor-pointer"><input type="checkbox" id="sdPosts" checked class="accent-matn-emerald"> إنشاء منشورات نقاش تجريبية (لزيادة «الردود»)</label>' +
                  '<ul class="text-[11px] text-matn-muted mt-3 space-y-1 leading-relaxed">' + DEMO_MEMBERS.map(function (m) {
                      return '<li>• <strong class="text-matn-charcoal">' + esc(m.n) + '</strong> — @' + esc(m.u) + ' · ' + num(m.p) + ' نقطة</li>';
                  }).join('') + '</ul>' +
                  '<p class="text-[11px] text-matn-muted mt-3">مع كل حساب <strong>مذكرة في الأجندة</strong> (بمقتطف في شريط الرئيسية) و<strong>تقييمات وتعليق بانتظار الموافقة</strong> لتجربة النظام كاملاً.</p>' +
                  '<p class="text-[11px] text-matn-muted mt-2">يمكنك لاحقاً <strong>إيقافهم</strong> أو <strong>حذفهم</strong> من قسم «الأعضاء».</p>',
            footer: '<button type="button" id="sdGo" class="bg-matn-emerald hover:bg-matn-emeraldLight text-white px-4 py-2.5 rounded-xl text-xs font-bold transition">إنشاء</button>' + okBtn('إلغاء'),
            ready: function (w) {
                w.querySelector('#sdGo').addEventListener('click', function () {
                    var withPosts = !!w.querySelector('#sdPosts').checked;
                    var dd = fullDoc();
                    DEMO_MEMBERS.forEach(function (m) {
                        var old = dd.accounts[m.u] || {};
                        dd.accounts[m.u] = {
                            name: m.n, hash: old.hash || '', points: m.p, minutes: m.m,
                            ledger: old.ledger || [], vouchers: old.vouchers || [], bookings: old.bookings || {},
                            phone: old.phone || '', isAdmin: false, super: false, perms: [], avatar: '',
                            demo: true, suspended: false, createdAt: old.createdAt || new Date().toISOString()
                        };
                    });
                    saveDoc(dd);
                    var chain = Promise.resolve();
                    DEMO_MEMBERS.forEach(function (m) {
                        chain = chain.then(function () {
                            return sha256(DEMO_PASS).then(function (h) {
                                var d2 = fullDoc();
                                if (d2.accounts[m.u]) d2.accounts[m.u].hash = h;
                                saveDoc(d2);
                            });
                        });
                    });
                    chain.then(function () {
                        /* مذكرات الأجندة */
                        DEMO_MEMBERS.forEach(function (m, i) {
                            var d3 = fullDoc();
                            var acc = d3.accounts[m.u];
                            if (!acc) return;
                            var rt = {};
                            DEMO_MEMBERS.forEach(function (x, j) {
                                if (x.u !== m.u && j % 2 === 0) rt[x.u] = 3 + ((i + j) % 3);
                            });
                            acc.diary = [{
                                id: 'dy-' + rnd(6), text: DEMO_DIARIES[i % DEMO_DIARIES.length],
                                at: new Date(Date.now() - (i + 1) * 30 * 3600000).toISOString(),
                                public: true, edited: false, ratings: rt,
                                comments: (function () {
                                    var who = DEMO_MEMBERS[(i + 2) % 6], who2 = DEMO_MEMBERS[(i + 4) % 6];
                                    var out = [{
                                        id: 'dc-' + rnd(6), user: who.u, name: who.n,
                                        text: 'أسلوبك في السرد يشبه جلسات الصالون… استمري بالكتابة 🤍',
                                        at: new Date(Date.now() - (i + 1) * 12 * 3600000).toISOString(),
                                        approved: true, reported: 0, hide: false
                                    }];
                                    if (i === 0) {
                                        out.push({
                                            id: 'dc-' + rnd(6), user: who2.u, name: who2.n,
                                            text: 'سؤال: هل تقصدين بالاقتباس الفقد الشخصي أم فقد المدينة؟ أحب أن أسمع رأيك — تعليق بانتظار موافقتك.',
                                            at: new Date(Date.now() - 5 * 3600000).toISOString(),
                                            approved: false, reported: 0, hide: false
                                        });
                                    }
                                    return out;
                                })()
                            }];
                            saveDoc(d3);
                        });
                        if (withPosts) {
                            DEMO_MEMBERS.forEach(function (m, i) {
                                var d3 = fullDoc();
                                DEMO_TEXTS.slice(i % 3, (i % 3) + 2).forEach(function (t) {
                                    d3.posts.unshift({
                                        id: 'ps-' + rnd(6), topic: 'book', user: m.u, name: m.n, text: t,
                                        at: new Date(Date.now() - (i + 1) * 5 * 3600000).toISOString()
                                    });
                                });
                                saveDoc(d3);
                            });
                        }
                        closeModal(); state = null; load(); render();
                        toast('أُنشئ ' + num(DEMO_MEMBERS.length) + ' أعضاء تجريبيين', 'ok');
                    });
                });
            }
        });
    }
    function purgeDemo() {
        if (!needPerm('members', 'إدارة الأعضاء')) return;
        var d = fullDoc();
        var list = Object.keys(d.accounts).filter(function (u) { return d.accounts[u].demo; });
        if (!list.length) { toast('لا يوجد أعضاء تجريبيون.', 'info'); return; }
        confirmBox('حذف الأعضاء التجريبيين', 'سيُحذف ' + num(list.length) + ' حساباً تجريبياً ومنشوراتهم، وتُفرَّغ مقاعدهم المحجوزة. الحسابات الحقيقية لا تُمس.', function () {
            var d2 = fullDoc();
            list.forEach(function (u) {
                delete d2.accounts[u];
                if (d2.authUser === u) d2.authUser = null;
            });
            d2.posts = (d2.posts || []).filter(function (p) { return list.indexOf(p.user) === -1; });
            saveDoc(d2); state = null; load(); render();
            toast('حُذف ' + num(list.length) + ' أعضاء تجريبيين', 'ok');
        }, 'حذف التجريبيين');
    }
    function suspendMember(uname) {
        if (!needPerm('members', 'إدارة الأعضاء')) return;
        var d = fullDoc();
        var a = d.accounts[uname];
        if (!a || a.super || a.system) return;
        if (a.suspended) {
            a.suspended = false;
            saveDoc(d); state = null; load(); render();
            toast('أُعيد تنشيط «' + a.name + '»', 'ok');
            return;
        }
        confirmBox('إيقاف العضو', 'سيُمنع «' + a.name + '» من تسجيل الدخول، ولن يظهر في وسام التميّز. حجوزه تبقى، ويمكنك تنشيطه في أي وقت.', function () {
            var d2 = fullDoc();
            d2.accounts[uname].suspended = true;
            if (d2.authUser === uname) d2.authUser = null;
            saveDoc(d2); state = null; load(); render();
            toast('أُوقف «' + a.name + '»', 'ok');
        }, 'إيقاف');
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
                    '<label class="matn-field"><span>⏳ مدة اللقاء</span><select class="matn-input" id="sfDur">' +
                        DUR_OPTS.map(function (mm) {
                            return '<option value="' + mm + '"' + ((v.durationMin || 90) === mm ? ' selected' : '') + '>' + durLabel(mm) + '</option>';
                        }).join('') +
                    '</select></label>' +
                    '<label class="matn-field sm:col-span-2"><span>🎟 نوع المشاركة في الجلسة</span><select class="matn-input" id="sfPaid">' +
                        '<option value="free"' + (salonPrice(v) ? '' : ' selected') + '>🎁 مجاني — بلا رسوم (حجز مباشر)</option>' +
                        '<option value="paid"' + (salonPrice(v) ? ' selected' : '') + '>💳 باشتراك مدفوع (تحويل بنكي + إيصال)</option>' +
                    '</select></label>' +
                    '<label class="matn-field" id="sfPriceWrap"><span>💳 سعر الاشتراك (ر.س)</span><input class="matn-input" id="sfPrice" type="number" min="0" step="1" value="' + (salonPrice(v) || 0) + '"></label>' +
                    '<p class="text-[10px] text-matn-muted sm:col-span-2 -mt-1">«مجاني» = حجز مباشر بلا رسوم. «مدفوع» = يحوّل العضو المبلغ بنكياً ويرفع الإيصال، ويتفعّل اشتراكه بعد تأكيدك من «الحجوزات». والجلسات المدفوعة للأعضاء والمشتركين.</p>' +
                    '<label class="matn-field"><span>🏙 المدينة</span><select class="matn-input" id="sfCity">' + citiesOptions(v.city) + '</select></label>' +
                    '<label class="matn-field"><span>📍 مكانه (الفرع) — حضوري أو كليهما</span><select class="matn-input" id="sfBranch">' +
                        '<option value="">بدون فرع محدد</option>' +
                        (fullDoc().branches || []).map(function (b) {
                            return '<option value="' + esc(b.id) + '"' + (v.branchId === b.id ? ' selected' : '') + '>' + esc(b.name) + ' — ' + esc(b.city) + '</option>';
                        }).join('') +
                    '</select></label>' +
                        '<div class="flex flex-wrap gap-1.5 mt-1">' +
                            '<button type="button" class="matn-preset" data-preset="0">اليوم 7:30 م</button>' +
                            '<button type="button" class="matn-preset" data-preset="1">غداً 7:30 م</button>' +
                            '<button type="button" class="matn-preset" data-preset="7">بعد أسبوع 7:30 م</button>' +
                            '<button type="button" class="matn-preset" data-preset="14">بعد أسبوعين 7:30 م</button>' +
                        '</div>' +
                        '<p class="text-[10px] text-matn-muted mt-2 leading-relaxed">بدون هذا الحقل لا يظهر العدّ التنازلي في الرئيسية ولا يُرسل أي تذكير.</p>' +
                    '</div>' +
                    '<label class="matn-field sm:col-span-2"><span>📝 وصف الجلسة (يظهر تحت العنوان — لك حرية كتابته لكل صالون)</span><textarea class="matn-input" id="sfDesc" rows="3" placeholder="اكتب سطرين عن الجلسة، ومن يدير النقاش…">' + esc(v.desc || '') + '</textarea></label>' +
                    '<label class="matn-field sm:col-span-2"><span>🖼 صورة الكتاب / الإعلان (تظهر أعلى يسار البطاقة — اضغط عليها مطوّلاً لتكبر)</span>' +
                        '<input class="matn-input" id="sfPoster" type="url" value="' + (v.poster && v.poster.indexOf('data:') !== 0 ? esc(v.poster) : '') + '" placeholder="https://example.com/cover.jpg">' +
                        '<input type="file" id="sfFile" accept="image/*" class="hidden">' +
                        '<div class="flex flex-wrap items-center gap-2 mt-2">' +
                            '<button type="button" id="sfPick" class="matn-preset">📁 اختر صورة من جهازك</button>' +
                            '<button type="button" id="sfRm" class="matn-preset">إزالة الصورة</button>' +
                            '<img id="sfPrev" alt="" class="' + (v.poster ? '' : 'hidden ') + 'w-16 h-20 object-cover rounded-lg border border-matn-sand" src="' + esc(v.poster || '') + '">' +
                        '</div></span></label>' +
                    '<label class="matn-field"><span>⏰ التذكير قبل الموعد</span><select class="matn-input" id="sfRemind">' +
                        REMIND_OPTS.map(function (m) {
                            return '<option value="' + m + '"' + ((v.reminderMin || 60) === m ? ' selected' : '') + '>' + remindLabel(m) + '</option>';
                        }).join('') +
                    '</select></label>' +
                    '<label class="matn-field"><span>الموعد المعروض (اكتب التاريخ بلا وقت — الوقت يُحسب تلقائياً من اليوم والساعة والمدة)</span><input class="matn-input" id="sfWhen" type="text" value="' + esc(v.when) + '" placeholder="يُكتب تلقائياً"></label>' +
                    '<label class="matn-field"><span>نوع المجلس</span><select class="matn-input" id="sfMode">' +
                        MODES.map(function (m) {
                            return '<option value="' + m.key + '"' + ((v.mode || 'hybrid') === m.key ? ' selected' : '') + '>' + m.label + '</option>';
                        }).join('') +
                    '</select></label>' +
                    '<label class="matn-field"><span>الميسّر</span><input class="matn-input" id="sfFac" type="text" value="' + esc(v.facilitator) + '"></label>' +
                    '<label class="matn-field sm:col-span-2"><span>رابط الاجتماع — يظهر للمحجوزين فقط (Zoom أو أي رابط)</span><input class="matn-input" id="sfLink" type="url" value="' + esc(v.link || '') + '" placeholder="https://zoom.us/j/123456789"></label>' +
                    '<label class="matn-field sm:col-span-2"><span>📍 مكان اللقاء — الكوفي أو الصالة</span>' +
                        '<div class="grid grid-cols-1 sm:grid-cols-3 gap-3">' +
                            '<select class="matn-input" id="sfVenueKind">' +
                                VENUE_KINDS.map(function (k) {
                                    return '<option value="' + k.key + '"' + ((v.venueKind || 'cafe') === k.key ? ' selected' : '') + '>' + k.icon + ' ' + k.label + '</option>';
                                }).join('') +
                            '</select>' +
                            '<input class="matn-input sm:col-span-2" id="sfVenue" type="text" value="' + esc(v.venue || '') + '" placeholder="كوفي صوفيا - حي الياسمين">' +
                        '</div>' +
                        '<input class="matn-input mt-2" id="sfVenueLink" type="url" value="' + esc(v.venueLink || '') + '" placeholder="📍 رابط موقع المكان على خرائط Google (اختياري)">' +
                    '</label>' +
                    '<label class="matn-field sm:col-span-2"><span>المكان المعروض للزوار (اتركه فارغاً ليكتب تلقائياً من مكان اللقاء)</span><input class="matn-input" id="sfWhere" type="text" value="' + esc(v.where) + '" placeholder="يُكتب تلقائياً"></label>' +
                    '<label class="matn-field"><span>عدد المقاعد</span><input class="matn-input" id="sfCap" type="number" min="1" step="1" value="' + (v.capacity || 6) + '"></label>' +
                    '<label class="flex items-center gap-2 text-xs sm:col-span-2 bg-matn-cream border border-matn-sand rounded-xl px-3 py-2.5"><span>الصفحة الرئيسية تعرض الصالون <strong>الأقرب موعداً</strong> تلقائياً، ثم الذي يليه بعده — بلا اختيار يدوي.</span></label>' +
                  '</div><p id="sfMsg" class="text-xs"></p>',
            footer: '<button type="button" id="sfGo" class="bg-matn-emerald hover:bg-matn-emeraldLight text-white px-4 py-2.5 rounded-xl text-xs font-bold transition">حفظ</button>' + okBtn('إلغاء'),
            ready: function (w) {
                var posterVal = safeImg(v.poster || '');
                var brSel = w.querySelector('#sfBranch');
                var citySel = w.querySelector('#sfCity');
                if (brSel) brSel.addEventListener('change', function () {
                    var nd0 = fullDoc();
                    var b0 = nd0.branches.filter(function (x) { return x.id === brSel.value; })[0];
                    if (b0 && b0.city) citySel.value = b0.city;
                });
                var _pf0 = w.querySelector('#sfPaid');
                if (_pf0) {
                    var _sync0 = function () {
                        var isFree = _pf0.value === 'free';
                        var wrap0 = w.querySelector('#sfPriceWrap');
                        if (wrap0) wrap0.classList.toggle('hidden', isFree);
                        if (isFree && w.querySelector('#sfPrice')) w.querySelector('#sfPrice').value = '0';
                    };
                    _pf0.addEventListener('change', _sync0); _sync0();
                }
                var prev = w.querySelector('#sfPrev');
                var showPrev = function (url) {
                    if (url) { prev.src = url; prev.classList.remove('hidden'); }
                    else { prev.removeAttribute('src'); prev.classList.add('hidden'); }
                };
                w.querySelector('#sfPick').addEventListener('click', function () { w.querySelector('#sfFile').click(); });
                w.querySelector('#sfFile').addEventListener('change', function (ev) {
                    var f = ev.target.files && ev.target.files[0];
                    if (!f) return;
                    var m = w.querySelector('#sfMsg');
                    m.textContent = 'جارٍ تجهيز الصورة…'; m.className = 'text-xs text-matn-muted';
                    compressImage(f, 900, 0.82).then(function (url) {
                        posterVal = url;
                        w.querySelector('#sfPoster').value = '';
                        showPrev(url);
                        m.textContent = 'حُضّرت الصورة — اضغط حفظ.'; m.className = 'text-xs text-emerald-700';
                    }).catch(function () {
                        m.textContent = 'تعذّر قراءة الصورة — جرّب صورة أخرى.'; m.className = 'text-xs text-red-700';
                    });
                });
                w.querySelector('#sfPoster').addEventListener('input', function (e) {
                    posterVal = safeImg(e.target.value);
                    showPrev(posterVal);
                });
                w.querySelector('#sfRm').addEventListener('click', function () {
                    posterVal = ''; w.querySelector('#sfPoster').value = ''; showPrev('');
                });
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
                    var doc2 = fullDoc();
                    var startISO = whenISO(w.querySelector('#sfStart').value);
                    var whenTxt = w.querySelector('#sfWhen').value.trim();
                    if (!whenTxt && startISO) whenTxt = arabicWhen(startISO);
                    var venue = (w.querySelector('#sfVenue').value || '').trim();
                    var vk = w.querySelector('#sfVenueKind').value || 'cafe';
                    var whereField = w.querySelector('#sfWhere').value.trim();
                    var venueDisplay = venue ? (venueKind(vk).icon + ' ' + venue + (w.querySelector('#sfCity').value ? (' — ' + w.querySelector('#sfCity').value) : '')) : '';
                    /* إن كتب المشرف «المكان المعروض» بنفسه فهو الأول؛ وإلا يَغلِب مكان اللقاء */
                    var whereTxt = (whereField && whereField !== String(v.where || '')) ? whereField : (venueDisplay || whereField);
                    var data = {
                        title: t,
                        when: whenTxt,
                        desc: (w.querySelector('#sfDesc').value || '').trim(),
                        poster: posterVal,
                        facilitator: w.querySelector('#sfFac').value.trim(),
                        where: whereTxt,
                        venue: venue,
                        venueKind: vk,
                        venueLink: safeUrl(w.querySelector('#sfVenueLink').value),
                        capacity: cap,
                        mode: w.querySelector('#sfMode').value,
                        link: safeUrl(w.querySelector('#sfLink').value),
                        startsAt: startISO,
                        durationMin: parseInt(w.querySelector('#sfDur').value, 10) || 90,
                        city: (citySel ? citySel.value : '') || '',
                        branchId: (brSel ? brSel.value : '') || '',
                        reminderMin: parseInt(w.querySelector('#sfRemind').value, 10) || 60,
                        price: (function () {
                            var pf = w.querySelector('#sfPaid');
                            if (pf && pf.value === 'free') return 0;
                            return Math.max(0, parseInt((w.querySelector('#sfPrice') || {}).value, 10) || 0);
                        })()
                    };
                    if (isNew) {
                        data.id = newSalonId(doc2);
                        data.featured = doc2.salons.length === 0;
                        data.at = new Date().toISOString();
                        doc2.salons.push(data);
                    } else {
                        var t2 = salonById(doc2, id);
                        if (t2) { t2.title = data.title; t2.when = data.when; t2.desc = data.desc; t2.poster = data.poster; t2.facilitator = data.facilitator; t2.where = data.where; t2.capacity = data.capacity; t2.mode = data.mode; t2.link = data.link; t2.startsAt = data.startsAt; t2.reminderMin = data.reminderMin; t2.durationMin = data.durationMin; t2.city = data.city; t2.branchId = data.branchId; t2.venue = data.venue; t2.venueKind = data.venueKind; t2.venueLink = data.venueLink; t2.price = data.price; }
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
        var d = fullDoc();
        d.salons.forEach(function (s) { s.featured = (s.id === id); });
        saveDoc(d); refresh();
        toast('صار هذا الصالون هو القادم — يظهر في الرئيسية والحجز', 'ok');
    }

    function deleteSalon(id) {
        if (!needPerm('salons', 'إدارة الصالونات')) return;
        var d = fullDoc();
        if (d.salons.length <= 1) { toast('لا يمكن حذف الصالون الأخير — الموقع يحتاج صالوناً واحداً على الأقل.', 'error'); return; }
        var s = salonById(d, id);
        if (!s) return;
        var booked = 0;
        Object.keys(d.accounts).forEach(function (u) { if (d.accounts[u].bookings && d.accounts[u].bookings[id]) booked++; });
        confirmBox('حذف الصالون', 'سيُحذف «' + s.title + '»' +
            (booked ? ' — وله ' + num(booked) + ' حجز قائم سيُلغى وتُفرَّغ مقاعده' : '') + '. لا يمكن التراجع.', function () {
            var d2 = fullDoc();
            if (s.featured) {
                var other = d2.salons.filter(function (x) { return x.id !== id; })[0];
                if (other) other.featured = true;
            }
            Object.keys(d2.accounts).forEach(function (u) {
                if (d2.accounts[u].bookings && d2.accounts[u].bookings[id]) delete d2.accounts[u].bookings[id];
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
                    var d = fullDoc();
                    if (d.accounts[uname]) { m.textContent = 'اسم المستخدم محجوز — اختر غيره.'; m.className = 'text-xs text-red-700'; return; }
                    sha256(String(pass)).then(function (hash) {
                        var perms = role === 'manager' ? ALL_PERMS.slice() : [];
                        d.accounts[uname] = {
                            name: name || uname, hash: hash,
                            points: Math.max(0, pts),
                            ledger: [{ reason: 'حساب أُنشئ من لوحة التحكم', points: Math.max(0, pts), at: new Date().toISOString() }],
                            vouchers: [], bookings: {},
                            avatar: '', minutes: 0,
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
        var d = fullDoc();
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
        var d = fullDoc();
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
        var salon0 = s.salon || {};
        var price0 = salonPrice(salon0);
        if (s.booking) {
            if (price0 > 0 && s.booking.payStatus === 'pending') { payModal(salon0, null, s.booking); return; }
            cancelBooking(); return;
        }
        if (s.seatsLeft <= 0) { toast('اكتمل عدد مقاعد الجلسة', 'error'); return; }

        var g = readGuest();
        var needEmail = !!(CLOUD && window.MatnCloud && window.MatnCloud.emailTickets);

        var g0 = readGuest();
        var d0 = fullDoc();
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
                    var sal = (load().salon) || {};
                    if (salonPrice(sal) > 0) payModal(sal, { name: name, email: email, phone: phone });
                    else doBook(name, email, phone);
                });
            }
        });
    }

    function doBook(name, email, phone, pay) {
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
            var bk = st.myBookings || (st.myBookings = {});
            bk[salon.id] = {
                code: code, at: new Date().toISOString(), salonId: salon.id,
                title: salon.title, when: salon.when, where: salon.where, phone: ph,
                amount: pay ? pay.amount : 0,
                payStatus: pay ? (pay.payStatus || 'pending') : 'free',
                receipt: pay ? (pay.receipt || '') : '',
                ref: pay ? (pay.ref || '') : '',
                paidAt: pay ? new Date().toISOString() : ''
            };
            st.booking = bk[salon.id];
        });
        if (ph) {
            var dd = fullDoc();
            if (dd.authUser && dd.accounts[dd.authUser]) { dd.accounts[dd.authUser].phone = ph; saveDoc(dd); }
        }
        toast(pay ? 'رفعنا إيصالك — يبقى المقعد محجوزاً حتى تأكيد الإدارة' : ('تم تأكيد حجزك — رقم التذكرة ' + code), 'ok');
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
            if (st.myBookings && st.salon) delete st.myBookings[st.salon.id];
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
    function openAddPartner(editId) {
        if (!needPerm('partners', 'إدارة الشركاء')) return;
        var cur = null;
        if (editId) {
            var dd = fullDoc();
            cur = (dd.partners || []).filter(function (x) { return x.id === editId; })[0] || null;
            if (!cur) return;
        }
        var opts = CATEGORIES.map(function (c, i) { return '<option value="' + i + '"' + (cur && cur.tag === i ? ' selected' : '') + '>' + esc(c.label) + '</option>'; }).join('');
        var V = function (k) { return cur && cur[k] != null ? esc(String(cur[k])) : ''; };
        modal({
            title: cur ? ('تعديل: ' + cur.name) : 'إضافة شريك',
            body:
                '<label class="matn-field"><span>اسم الشريك</span><input class="matn-input" id="pName" type="text" placeholder="مثال: مكتبة المدى" value="' + V('name') + '"></label>' +
                '<label class="matn-field"><span>التصنيف</span><select class="matn-input" id="pCat">' + opts + '</select></label>' +
                '<label class="matn-field"><span>وصف العرض</span><input class="matn-input" id="pDesc" type="text" placeholder="قسيمة خصم 50 ريالاً..." value="' + V('desc') + '"></label>' +
                '<div class="grid grid-cols-1 sm:grid-cols-2 gap-3">' +
                    '<label class="matn-field"><span>المدينة / الحي</span><input class="matn-input" id="pCity" type="text" placeholder="الرياض — حي الياسمين" value="' + V('city') + '"></label>' +
                    '<label class="matn-field"><span>المقر (الفرع)</span><input class="matn-input" id="pPlace" type="text" placeholder="مشغل لافندر فرع الياسمين" value="' + V('place') + '"></label>' +
                    '<label class="matn-field"><span>الشارع</span><input class="matn-input" id="pStreet" type="text" placeholder="طريق أنس بن مالك" value="' + V('street') + '"></label>' +
                    '<label class="matn-field"><span>المول / المبنى</span><input class="matn-input" id="pMall" type="text" placeholder="لافندر بارك — الدور الثاني" value="' + V('mall') + '"></label>' +
                '</div>' +
                '<label class="matn-field"><span>رابط الموقع على الخريطة</span><input class="matn-input" id="pLink" type="url" dir="ltr" placeholder="https://maps.google.com/..." value="' + V('link') + '"></label>' +
                '<label class="matn-field"><span>تكلفة الاستبدال (نقاط)</span><input class="matn-input" id="pCost" type="number" min="1" step="1" value="' + (cur && cur.cost ? cur.cost : 100) + '"></label>' +
                '<p id="pMsg" class="text-xs mt-1"></p>',
            footer: '<button type="button" id="pGo" class="bg-matn-emerald hover:bg-matn-emeraldLight text-white px-4 py-2.5 rounded-xl text-xs font-bold transition">' + (cur ? 'حفظ التعديل' : 'إضافة الشريك') + '</button>' + okBtn('إلغاء'),
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
                    var extra = {
                        city: w.querySelector('#pCity').value.trim(),
                        place: w.querySelector('#pPlace').value.trim(),
                        street: w.querySelector('#pStreet').value.trim(),
                        mall: w.querySelector('#pMall').value.trim(),
                        link: safeUrl(w.querySelector('#pLink').value.trim()) || ''
                    };
                    if (cur) {
                        change(function (st) {
                            var p = (st.partners || []).filter(function (x) { return x.id === editId; })[0];
                            if (p) Object.assign(p, { name: name, tag: cat, desc: desc || p.desc, cost: cost }, extra);
                        });
                        closeModal();
                        toast('حُفظت بيانات «' + name + '»', 'ok');
                        return;
                    }
                    if (CLOUD) {
                        window.MatnCloud.addPartner(Object.assign({ name: name, tag: cat, desc: desc || 'عرض خاص لأعضاء نادي مَتن.', cost: cost, prefix: prefix }, extra))
                            .then(function () { return refresh(); })
                            .then(function () { closeModal(); toast('أُضيف «' + name + '» إلى دليل الشركاء', 'ok'); })
                            .catch(function (e) { msg.textContent = cloudAr(e); msg.className = 'text-xs mt-1 text-red-700'; });
                        return;
                    }
                    change(function (st) {
                        st.partners.push(Object.assign({ id: 'p-' + rnd(6).toLowerCase(), name: name, tag: cat, desc: desc || 'عرض خاص لأعضاء نادي مَتن.', cost: cost, prefix: prefix }, extra));
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
                var ms0 = s.myStats || {};
                var hrsEl = siBox.querySelector('[data-acct-hours]'); if (hrsEl) hrsEl.textContent = hoursText(ms0.minutes || 0);
                var rpEl = siBox.querySelector('[data-acct-replies]'); if (rpEl) rpEl.textContent = num(ms0.replies || 0);
                var avEl = document.getElementById('acctAvatar');
                if (avEl) {
                    var au = safeImg(ms0.avatar || '');
                    if (au) { avEl.src = au; avEl.classList.remove('hidden'); } else { avEl.removeAttribute('src'); avEl.classList.add('hidden'); }
                }
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
            var bPrice = salonPrice(s.salon || {});
            if (s.booking && bPrice > 0 && s.booking.payStatus === 'pending') {
                btn.textContent = '⏳ إيصالك قيد المراجعة — اضغط لتحديث الإيصال';
                btn.className = 'w-full bg-amber-50 border border-amber-300 text-amber-800 py-3.5 rounded-xl font-bold text-sm shadow-sm transition';
            } else if (s.booking) {
                btn.textContent = bPrice > 0 ? '✓ اشتراكك مفعّل — إلغاء' : '✓ مقعدك محجوز — إلغاء الحجز';
                btn.className = 'w-full bg-white hover:bg-matn-cream border border-matn-sand text-matn-charcoal py-3.5 rounded-xl font-bold text-sm shadow-sm transition';
            } else if (s.seatsLeft <= 0) {
                btn.textContent = 'اكتمل عدد المقاعد';
                btn.className = 'w-full bg-matn-muted/40 text-white py-3.5 rounded-xl font-bold text-sm cursor-not-allowed';
            } else if (salonPrice(s.salon || {}) > 0) {
                btn.textContent = '💳 ادفع واشترك في الجلسة — ' + arPrice(salonPrice(s.salon || {}));
                btn.className = 'w-full bg-matn-emerald hover:bg-matn-emeraldDark text-white py-3.5 rounded-xl font-bold text-sm shadow transition';
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
                        '<div class="font-bold text-matn-emerald text-sm">' + (s.booking.payStatus === 'pending' ? '⏳ حجزك محفوظ — بانتظار تأكيد الدفع' : (s.booking.payStatus === 'confirmed' ? '✓ اشتراكك مفعّل ومقعدك محجوز' : '✓ مقعدك محجوز')) + '</div>' +
                        ((s.booking.amount || 0) > 0 ? ('<div class="flex justify-between"><span class="text-matn-muted">الاشتراك</span><strong>' + arPrice(s.booking.amount) + '</strong></div>' +
                            '<div class="flex justify-between"><span class="text-matn-muted">حالة الدفع</span><span>' + payStatusLabel(s.booking.payStatus) + '</span></div>' +
                            (s.booking.receipt ? ('<div class="flex items-center gap-2"><span class="text-matn-muted">الإيصال:</span><img src="' + esc(safeImg(s.booking.receipt)) + '" data-zoom="' + esc(safeImg(s.booking.receipt)) + '" class="w-12 h-12 rounded-lg object-cover border border-matn-sand" alt="إيصال"></div>') : '') +
                            (s.booking.ref ? ('<div class="flex justify-between"><span class="text-matn-muted">رقم العملية</span><span>' + esc(s.booking.ref) + '</span></div>') : '')) : '') +
                        '<div class="flex justify-between"><span class="text-matn-muted">رقم التذكرة</span><span class="matn-code font-bold">' + esc(s.booking.code) + '</span></div>' +
                        '<div class="flex justify-between"><span class="text-matn-muted">الجلسة</span><strong>' + esc(s.booking.title) + '</strong></div>' +
                        '<div class="flex justify-between"><span class="text-matn-muted">الموعد</span><strong>' + esc(s.booking.when) + '</strong></div>' +
                        '<div class="flex justify-between"><span class="text-matn-muted">المكان</span><strong>' + esc(s.booking.where) + '</strong></div>' +
                        '<div class="flex justify-between"><span class="text-matn-muted">تاريخ الحجز</span><span>' + esc(fmtDate(s.booking.at)) + '</span></div>' +
                    '</div>';
            } else { ticket.classList.add('hidden'); ticket.innerHTML = ''; }
        }
        /* حجوزات العضو في جلسات أخرى (لكل صالون حجزه) */
        var others = document.getElementById('otherBookings');
        if (others) {
            var mybk = s.myBookings || {};
            var list = Object.keys(mybk).filter(function (k) { return k !== (s.salon && s.salon.id); }).map(function (k) { return mybk[k]; });
            if (list.length) {
                others.classList.remove('hidden');
                others.innerHTML = '<div class="text-[11px] font-bold text-matn-emerald mb-2">حجوزاتك في جلسات أخرى</div>' +
                    '<div class="space-y-2">' + list.map(function (b) {
                        return '<div class="p-3 rounded-xl border border-matn-sand bg-white text-[11px]">' +
                            '<strong>' + esc(b.title || '') + '</strong> · <span class="matn-code">' + esc(b.code || '') + '</span>' +
                            (b.when ? ('<div class="text-matn-muted mt-0.5">' + esc(b.when) + (b.where ? (' · ' + esc(b.where)) : '') + '</div>') : '') +
                        '</div>';
                    }).join('') + '</div>';
            } else { others.classList.add('hidden'); others.innerHTML = ''; }
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
                    (partnerLocLine(p) ? '<div class="text-[11px] space-y-0.5 bg-matn-cream rounded-xl p-2 border border-matn-sand">' + partnerLocLine(p) +
                        (safeUrl(p.link) ? '<a href="' + esc(safeUrl(p.link)) + '" target="_blank" rel="noopener" class="inline-block mt-1 font-bold text-matn-emerald">🗺 افتح الموقع ↗</a>' : '') + '</div>' : '') +
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
        document.querySelectorAll('[data-session-venuelink]').forEach(function (el) {
            var vl = safeUrl(salon.venueLink);
            if (vl) { el.classList.remove('hidden'); el.innerHTML = '<a href="' + esc(vl) + '" target="_blank" rel="noopener" class="text-matn-emerald font-bold whitespace-nowrap">📍 موقع مكان اللقاء ↗</a>'; }
            else { el.classList.add('hidden'); el.innerHTML = ''; }
        });
        document.querySelectorAll('[data-session-facilitator]').forEach(function (el) { if (salon.facilitator) el.textContent = salon.facilitator; });
        document.querySelectorAll('[data-session-mode]').forEach(function (el) { el.textContent = modeLabel(salon.mode); });

        /* صورة الصالون — أعلى يسار البطاقة، والضغط المطوّل يكبّرها */
        document.querySelectorAll('[data-poster-box]').forEach(function (box) {
            var img = box.querySelector('[data-poster-img]');
            var p = safeImg(salon.poster);
            if (p && img) {
                img.setAttribute('src', p);
                img.setAttribute('data-zoom', p);
                box.classList.remove('hidden');
            } else {
                box.classList.add('hidden');
            }
        });

        /* وصف الجلسة — نص يكتبه المشرف لكل صالون؛ يُخفى إن تُرك فارغاً */
        document.querySelectorAll('[data-session-desc]').forEach(function (el) {
            var tx = String(salon.desc || '').trim();
            if (tx) { el.textContent = tx; el.classList.remove('hidden'); }
            else { el.textContent = ''; el.classList.add('hidden'); }
        });

        /* المدينة ووقت اللقاء ومدته والفرع */
        document.querySelectorAll('[data-session-price]').forEach(function (el) {
            var pr = salonPrice(salon);
            var row = el.parentElement;
            if (pr > 0) { el.textContent = arPrice(pr) + ' (تحويل بنكي)'; el.className = 'text-matn-emerald font-bold'; if (row) row.classList.remove('hidden'); }
            else { el.textContent = 'مجاني للأعضاء'; el.className = 'text-emerald-700 font-bold'; }
        });
        document.querySelectorAll('[data-session-salon]').forEach(function (el) {
            el.textContent = salonName(s, salon);
        });
        document.querySelectorAll('[data-session-city]').forEach(function (el) {
            var row = el.parentElement;
            if (salon.city) { el.textContent = salon.city; if (row) row.classList.remove('hidden'); }
            else { el.textContent = ''; if (row && row !== el) row.classList.add('hidden'); }
        });
        document.querySelectorAll('[data-session-time]').forEach(function (el) {
            var t = salonTimeRange(salon);
            el.textContent = t ? (t + ' · ' + durLabel(salon.durationMin)) : 'يُعلَن قريباً';
        });
        document.querySelectorAll('[data-session-where]').forEach(function (el) {
            var row = el.parentElement;
            if (String(salon.where || '').trim()) { el.textContent = salon.where; if (row) row.classList.remove('hidden'); }
            else { el.textContent = ''; if (row && row !== el) row.classList.add('hidden'); }
        });
        var brBoxes = document.querySelectorAll('[data-session-branchbox]');
        if (brBoxes.length) {
            var br = salonBranch(s, salon.branchId);
            brBoxes.forEach(function (el) {
                if (!br) { el.classList.add('hidden'); el.innerHTML = ''; return; }
                var lk = safeUrl(br.link);
                el.classList.remove('hidden');
                var brName = (br.name && br.city && br.name !== br.city) ? (esc(br.name) + ' · ' + esc(br.city)) : esc(br.name || br.city);
                el.innerHTML = '<strong>الفرع:</strong> ' + brName +
                    ' <span class="text-[10px] bg-matn-creamDark border border-matn-sand rounded-full px-2 py-0.5">' + brModeLabel(br.mode) + '</span>' +
                    (lk ? ' <a href="' + esc(lk) + '" target="_blank" rel="noopener" class="text-matn-emerald font-bold whitespace-nowrap">📍 الموقع ↗</a>' : '');
            });
        }

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
            var isMine = !!bs && !!(s.myBookings && s.myBookings[bs.id]);
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
                            (salonTimeRange(bs) ? (' (' + esc(salonTimeRange(bs)) + ' · ' + durLabel(bs.durationMin) + ')') : '') +
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
            var bookedUsers = users.filter(function (u) { return D.accounts[u].bookings && Object.keys(D.accounts[u].bookings).length; });
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
                    var role = a.system ? 'الدعم الفني' : (a.super ? 'المشرف العام' : ((a.perms && a.perms.length) ? 'مدير' : 'عضو'));
                    var roleCls = a.super ? 'bg-matn-gold/25 text-matn-emerald' : ((a.perms && a.perms.length) ? 'bg-emerald-100 text-emerald-800' : 'bg-matn-creamDark text-matn-muted');
                    return '<li class="flex flex-wrap justify-between items-center gap-2 py-3 border-b border-matn-sand/60">' +
                        '<span><strong class="' + (a.suspended ? 'line-through text-matn-muted' : '') + '">' + esc(a.name) + '</strong> <span class="text-matn-muted">@' + esc(u) + '</span>' +
                        ' <span class="text-[10px] font-bold px-1.5 py-0.5 rounded ' + roleCls + '">' + role + '</span>' +
                        (a.demo ? ' <span class="text-[10px] font-bold px-1.5 py-0.5 rounded bg-purple-100 text-purple-800">تجريبي</span>' : '') +
                        (a.suspended ? ' <span class="text-[10px] font-bold px-1.5 py-0.5 rounded bg-red-100 text-red-700">موقوف</span>' : '') + '</span>' +
                        '<span class="flex flex-wrap items-center gap-3">' +
                            '<span class="font-bold text-matn-emerald">' + num(a.points) + ' نقطة</span>' +
                            '<button type="button" data-grant="' + esc(u) + '" class="text-matn-emerald font-bold hover:underline">منح / خصم</button>' +
                            ((a.bookings && Object.keys(a.bookings).length) ? '<button type="button" data-cxl="' + esc(u) + '" class="text-matn-muted font-bold hover:underline">إلغاء الحجوزات</button>' : '') +
                            '<button type="button" data-rp="' + esc(u) + '" class="text-matn-muted font-bold hover:underline">كلمة مرور</button>' +
                            ((a.super || a.system) ? '' : (a.suspended
                                ? '<button type="button" data-suspend="' + esc(u) + '" class="text-emerald-700 font-bold hover:underline">تنشيط</button>'
                                : '<button type="button" data-suspend="' + esc(u) + '" class="text-amber-700 font-bold hover:underline">إيقاف</button>')) +
                            (a.phone ? '<a href="' + esc(waLink(a.phone, reminderText(salon))) + '" target="_blank" rel="noopener" class="text-[#128C7E] font-bold hover:underline">واتساب</a>' : '<span class="text-matn-muted text-[10px]">بلا رقم</span>') +
                            ((a.super || a.system) ? '' : '<button type="button" data-del="' + esc(u) + '" class="text-red-700 font-bold hover:underline">حذف</button>') +
                        '</span>' +
                        '<div class="w-full flex flex-wrap items-center gap-2 mt-2">' +
                            (a.system
                                ? '<span class="text-[11px] text-matn-muted">حساب نظامي — تستقبل رسائل الأعضاء وتُقرأ في لوحة المشرف العام.</span>'
                                : a.super
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
                ml.querySelectorAll('[data-suspend]').forEach(function (b) {
                    b.addEventListener('click', function () { suspendMember(b.getAttribute('data-suspend')); });
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
                var rows = [];
                bookedUsers.forEach(function (u) {
                    var a = D.accounts[u];
                    Object.keys(a.bookings).forEach(function (sid) {
                    var b = a.bookings[sid];
                    var wl = waLink(a.phone, reminderText(salonById(D, b.salonId) || salon));
                    var ses = salonById(D, b.salonId);
                    var pay = (b.amount || 0) > 0;
                    rows.push('<li class="flex flex-wrap justify-between items-center gap-2 py-3 border-b border-matn-sand/60 ' + (pay && b.payStatus === 'pending' ? 'bg-amber-50/60' : '') + '">' +
                        '<span><strong>' + esc(a.name) + '</strong> <span class="text-matn-muted">@' + esc(u) + '</span>' +
                            (a.phone ? ' <span class="text-[10px] text-matn-muted" dir="ltr">' + esc(a.phone) + '</span>' : ' <span class="text-[10px] text-red-700">بلا رقم</span>') + '</span>' +
                        '<span class="flex flex-wrap items-center gap-3">' +
                            (ses ? ('<span class="text-matn-muted">' + esc(ses.title).slice(0, 22) + '</span>') : '') +
                            '<span class="matn-code">' + esc(b.code) + '</span>' +
                            '<span class="text-matn-muted">' + esc(fmtDate(b.at)) + '</span>' +
                            (pay ? ('<span class="font-bold text-matn-emerald">' + arPrice(b.amount) + '</span>' + payStatusLabel(b.payStatus)) : '') +
                            (pay && b.ref ? ('<span class="text-[10px] text-matn-muted">عملية: ' + esc(clip(b.ref, 16)) + '</span>') : '') +
                            (pay && b.receipt ? ('<img src="' + esc(safeImg(b.receipt)) + '" data-zoom="' + esc(safeImg(b.receipt)) + '" class="w-10 h-10 rounded-lg object-cover border border-matn-sand" alt="إيصال" title="اضغط مطوّلاً للتكبير">') : '') +
                            (pay && b.payStatus !== 'confirmed' ? ('<button type="button" data-action="pay-confirm" data-uname="' + esc(u) + '" data-sid="' + esc(b.salonId) + '" class="bg-emerald-700 text-white px-2.5 py-1.5 rounded-lg font-bold">✅ تأكيد الدفع</button>') : '') +
                            (pay && b.payStatus !== 'rejected' && b.payStatus !== 'confirmed' ? ('<button type="button" data-action="pay-reject" data-uname="' + esc(u) + '" data-sid="' + esc(b.salonId) + '" class="bg-white border border-red-200 text-red-700 px-2.5 py-1.5 rounded-lg font-bold">✗ رفض</button>') : '') +
                            (wl ? '<a href="' + esc(wl) + '" target="_blank" rel="noopener" class="bg-[#25D366] text-white px-2.5 py-1.5 rounded-lg font-bold">تذكير واتساب</a>' : '') +
                        '</span></li>');
                    });
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
                    ['الصالونات', 'إضافة صالون · تعديله · حذفه · المدينة ومكان اللقاء', 'sec-salons', 'salons'],
                    ['فروعنا', 'افتح فرعاً في أي مدينة بالمملكة مع موقعه ونوعه', 'sec-branches', 'branches'],
                    ['كتاب الأسبوع', 'اخترنا لكم: الكتاب والغلاف والنبذة', 'sec-book', 'book'],
                    ['النقاش والتصويت', 'تصويت للأعضاء + مشاركات الكتاب والجلسة', 'sec-engage', 'engage'],
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
                    '<span class="min-w-0">' + esc(p.name) + ' <span class="text-matn-muted">(' + num(p.cost) + ' نقطة)</span>' +
                        (partnerLocLine(p) ? '<span class="block text-[10px] text-matn-muted mt-0.5">' + esc([p.place, p.city, p.street, p.mall].filter(Boolean).join(' · ')) + (safeUrl(p.link) ? ' · 🗺' : '') + '</span>' : '') + '</span>' +
                    '<span class="flex items-center gap-3">' +
                        '<button type="button" data-editpartner="' + esc(p.id) + '" class="text-matn-emerald font-bold hover:underline">✏️ تعديل / الموقع</button>' +
                        '<button type="button" data-delpartner="' + esc(p.id) + '" class="text-red-700 font-bold hover:underline">حذف</button></span>' +
                    '</li>';
            }).join('');
            ap.querySelectorAll('[data-delpartner]').forEach(function (b) {
                b.addEventListener('click', function () { removePartner(b.getAttribute('data-delpartner')); });
            });
            ap.querySelectorAll('[data-editpartner]').forEach(function (b) {
                b.addEventListener('click', function () { openAddPartner(b.getAttribute('data-editpartner')); });
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
        renderBranches(s);
        renderBook(s);
        renderPosts(s);
        renderPoll(s);
        renderDiaryStrip(s);
        renderDiaryMenu(s);
        renderArchive(s);
        renderHomePartners(s);
        renderBookPage(s);
        renderAdminPay(s);
        renderAdminOrders(s);
        renderAdminPolls(s);
        renderPollsPage(s);
        renderHomePoll(s);
        renderBadWords(s);
        renderHeaderAdAdmin(s);
        renderHeaderAd(s);
        renderMyDiary(s);
        renderDiaryWall(s);
        renderBell(s);
        renderExcellence(s);
        renderFooterBranches(s);
        renderMessages(s);
        renderAdminMessages(s);
        renderAdminExtra(s);

        /* ما يظهر للمشرف العام فقط */
        document.querySelectorAll('[data-super-only]').forEach(function (el) {
            el.classList.toggle('hidden', !s.user.super);
        });

        /* إظهار الأقسام حسب صلاحيات المستخدم — بعد منطق البوابة ليكون هو الفصل */
        document.querySelectorAll('[data-need-perm]').forEach(function (el) {
            el.classList.toggle('hidden', !can(el.getAttribute('data-need-perm')));
        });
    }

    /* قائمة «فروعنا» + بطاقة الموقع (دبوس بلا خريطة مضمنة) */
    function renderBranches(s) {
        var list = s.branches || [];
        var feat = list.filter(function (b) { return b.featured; })[0] || list[0] || null;
        document.querySelectorAll('[data-branches-menu]').forEach(function (el) {
            el.innerHTML = list.length ? list.map(function (b) {
                var lk = safeUrl(b.link);
                return '<a href="' + esc(lk || '#') + '"' + (lk ? ' target="_blank" rel="noopener"' : '') + ' class="block px-3 py-2.5 rounded-xl hover:bg-matn-creamDark transition">' +
                    '<div class="flex items-center justify-between gap-2">' +
                        '<span class="font-bold text-matn-emerald text-xs">' + esc(b.name || b.city) + '</span>' +
                        '<span class="text-[10px] bg-matn-creamDark border border-matn-sand rounded-full px-2 py-0.5 shrink-0">' + brModeLabel(b.mode) + '</span>' +
                    '</div>' +
                    '<div class="text-[10px] text-matn-muted mt-0.5">' + esc(b.city) + (b.place ? (' · ' + esc(b.place)) : '') + '</div>' +
                    (b.activity ? '<div class="text-[10px] text-matn-muted">' + esc(b.activity) + '</div>' : '') +
                    (lk ? '<div class="text-[10px] font-bold text-matn-emerald mt-1">📍 افتح الموقع على الخريطة ↗</div>' : '') +
                '</a>';
            }).join('') : '<div class="px-3 py-3 text-xs text-matn-muted">لا توجد فروع بعد.</div>';
        });
        var card = document.getElementById('branchCard');
        if (card) {
            if (feat) {
                var lk2 = safeUrl(feat.link);
                card.classList.remove('hidden');
                card.innerHTML = '<h2 class="font-bold font-amiri text-lg text-matn-emerald flex items-center gap-2">' +
                        '<svg xmlns="http://www.w3.org/2000/svg" class="w-5 h-5 text-matn-gold shrink-0" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2a7 7 0 0 0-7 7c0 5.25 7 13 7 13s7-7.75 7-13a7 7 0 0 0-7-7Zm0 9.5A2.5 2.5 0 1 1 12 6.5a2.5 2.5 0 0 1 0 5Z"/></svg>' +
                        'موقع الفرع' +
                    '</h2>' +
                    '<p class="text-xs text-matn-muted mt-1">' + esc(feat.name || '') + ' · ' + esc(feat.city) + (feat.place ? (' — ' + esc(feat.place)) : '') + '</p>' +
                    '<p class="text-[11px] text-matn-muted mt-1">' + brModeLabel(feat.mode) + (feat.activity ? (' · ' + esc(feat.activity)) : '') + '</p>' +
                    (lk2
                        ? '<a href="' + esc(lk2) + '" target="_blank" rel="noopener" class="inline-block mt-4 text-xs font-bold text-matn-emerald bg-matn-creamDark border border-matn-sand px-4 py-2.5 rounded-xl hover:border-matn-gold transition">📍 افتح الموقع على خرائط Google ↗</a>'
                        : '<p class="text-[11px] text-amber-700 mt-3">لم يُضف رابط موقع لهذا الفرع بعد.</p>') +
                    (list.length > 1 ? '<p class="text-[11px] text-matn-muted mt-3">لدينا ' + num(list.length) + ' فروع — اختر «📍 فروعنا» أعلى الصفحة.</p>' : '');
            } else card.classList.add('hidden');
        }
    }

    /* كتاب الأسبوع */
    function renderBook(s) {
        var box = document.getElementById('bookBox');
        if (!box) return;
        var b = s.book || {};
        if (!b.title && !b.cover) { box.classList.add('hidden'); return; }
        box.classList.remove('hidden');
        var cv = safeImg(b.cover);
        var lk = safeUrl(b.url);
        box.innerHTML = '<div class="flex items-start gap-4">' +
                (cv ? '<div class="shrink-0"><img src="' + esc(cv) + '" data-zoom="' + esc(cv) + '" alt="غلاف الكتاب" class="matn-poster"><div class="text-[9px] text-matn-muted mt-1 leading-tight text-left">اضغط مطوّلاً للتكبير</div></div>' : '') +
                '<div class="min-w-0 flex-1">' +
                    '<div class="font-amiri text-xl font-bold text-matn-emerald">' + esc(b.title || '') + '</div>' +
                    (b.author ? '<div class="text-xs text-matn-gold mt-1">✍ ' + esc(b.author) + '</div>' : '') +
                    (b.desc ? '<p class="text-xs text-matn-muted leading-relaxed mt-2 whitespace-pre-line">' + esc(b.desc) + '</p>' : '') +
                    (lk ? '<a href="' + esc(lk) + '" target="_blank" rel="noopener" class="inline-block mt-3 text-xs font-bold text-matn-emerald border border-matn-sand rounded-xl px-4 py-2 hover:border-matn-gold transition">تفاصيل الكتاب ↗</a>' : '') +
                    '<div class="mt-3 flex flex-wrap items-center gap-2 text-[11px]">' +
                        (Math.max(0, parseInt(b.price, 10) || 0) > 0
                            ? ('<span class="font-bold text-matn-emerald bg-matn-gold/15 border border-matn-gold/40 rounded-xl px-3 py-1.5">🛒 الكتاب للبيع: ' + arPrice(Math.max(0, parseInt(b.price, 10) || 0)) + ' — للأعضاء والمشتركين</span>' +
                               '<button type="button" data-action="buy-book" class="ms-auto bg-matn-emerald hover:bg-matn-emeraldLight text-white px-4 py-2 rounded-xl font-bold shadow transition">اشترِ النسخة</button>')
                            : '<span class="font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-xl px-3 py-1.5">🎁 كتاب الأسبوع مجاني للأعضاء</span>') +
                    '</div>' +
                '</div></div>';
    }

    /* النقاش وآراء الأعضاء */
    function renderPosts(s) {
        var list = document.getElementById('postsList');
        if (!list) return;
        var items = (s.posts || []).filter(function (p) { return p.topic === postTopic; });
        list.innerHTML = items.length ? items.map(function (p) {
            var canDel = (s.signedIn && p.user === s.user.username) || can('engage');
            return '<li class="border border-matn-sand rounded-2xl p-3 bg-white">' +
                '<div class="flex items-center justify-between gap-2 text-[11px]">' +
                    '<span class="font-bold text-matn-emerald">' + esc(p.name || p.user) + '</span>' +
                    '<span class="text-matn-muted">' + esc(fmtDate(p.at)) + '</span>' +
                '</div>' +
                '<p class="text-xs leading-relaxed mt-1.5 whitespace-pre-line">' + esc(p.text) + '</p>' +
                (canDel ? '<button type="button" data-delpost="' + esc(p.id) + '" class="text-[11px] text-red-700 font-bold mt-1.5 hover:underline">حذف</button>' : '') +
            '</li>';
        }).join('') : '<li class="text-xs text-matn-muted py-2">لا توجد مشاركات بعد — كن أول من يكتب رأيه.</li>';
        list.querySelectorAll('[data-delpost]').forEach(function (b) {
            b.addEventListener('click', function () { deletePost(b.getAttribute('data-delpost')); });
        });
        document.querySelectorAll('[data-action="post-tab"]').forEach(function (b) {
            var on = b.getAttribute('data-topic') === postTopic;
            b.className = 'px-3 py-1.5 rounded-xl text-xs font-bold transition ' +
                (on ? 'bg-matn-emerald text-white' : 'bg-white border border-matn-sand text-matn-muted hover:border-matn-gold');
        });
        var hint = document.getElementById('postHint');
        if (hint) hint.textContent = postTopic === 'book' ? 'رأيك في كتاب الأسبوع' : 'رأيك في جلسة الصالون وموضوعها';
    }

    /* صفحة «كتاب الأسبوع»: قائمتا آراء (الكتاب / الصالون والحلقة) */
    function postsHtml(s, topic) {
        var items = (s.posts || []).filter(function (p) { return p.topic === topic; });
        if (!items.length) return '<li class="text-xs text-matn-muted py-2">لا توجد مشاركات بعد — كن أول من يكتب رأيه.</li>';
        return items.map(function (p) {
            var canDel = (s.signedIn && p.user === s.user.username) || can('engage');
            return '<li class="border border-matn-sand rounded-2xl p-3 bg-white">' +
                '<div class="flex items-center justify-between gap-2 text-[11px]">' +
                    '<button type="button" data-member="' + esc(p.user) + '" class="font-bold text-matn-emerald hover:underline">' + esc(p.name || p.user) + ' ›</button>' +
                    '<span class="text-matn-muted">' + esc(fmtDate(p.at)) + '</span>' +
                '</div>' +
                '<p class="text-xs leading-relaxed mt-1.5 whitespace-pre-line">' + esc(p.text) + '</p>' +
                (canDel ? '<button type="button" data-delpost="' + esc(p.id) + '" class="text-[11px] text-red-700 font-bold mt-1.5 hover:underline">حذف</button>' : '') +
            '</li>';
        }).join('');
    }
    function wirePostsBox(root) {
        if (!root) return;
        root.querySelectorAll('[data-delpost]').forEach(function (b) {
            b.addEventListener('click', function () { deletePost(b.getAttribute('data-delpost')); });
        });
        root.querySelectorAll('[data-member]').forEach(function (b) {
            b.addEventListener('click', function () { openMember(b.getAttribute('data-member')); });
        });
    }
    function renderBookPage(s) {
        var b1 = document.getElementById('postsBook');
        var b2 = document.getElementById('postsSession');
        if (!b1 && !b2) return;
        if (b1) { b1.innerHTML = postsHtml(s, 'book'); wirePostsBox(b1); }
        if (b2) { b2.innerHTML = postsHtml(s, 'session'); wirePostsBox(b2); }
        var n1 = document.getElementById('cBook');
        var n2 = document.getElementById('cSession');
        if (n1) n1.textContent = num((s.posts || []).filter(function (p) { return p.topic === 'book'; }).length);
        if (n2) n2.textContent = num((s.posts || []).filter(function (p) { return p.topic === 'session'; }).length);
    }
    /* إظهار/إخفاء لوحتي الآراء في صفحة الكتاب */
    function toggleBookPane(which, force) {
        var panes = { book: 'paneBook', session: 'paneSession' };
        var box = document.getElementById(panes[which]);
        if (!box) return;
        var on = (typeof force === 'boolean') ? force : box.classList.contains('hidden');
        box.classList.toggle('hidden', !on);
        var btns = document.querySelectorAll('[data-action="book-pane"]');
        btns.forEach(function (b) {
            var mine = b.getAttribute('data-pane') === which;
            var open = mine && on;
            b.className = 'w-full text-right flex items-center justify-between gap-3 border rounded-2xl px-4 py-3 transition font-bold text-sm ' +
                (open ? 'bg-matn-emerald text-white border-matn-emerald shadow' : 'bg-white border-matn-sand text-matn-emerald hover:border-matn-gold');
        });
        if (on) window.setTimeout(function () { try { box.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); } catch (e) {} }, 120);
    }
    /* انشر مشاركة في موضوع محدَّد */
    function addPostTopic(topic, taId) {
        if (needsLogin()) { requireLogin('الحوار والنقاش'); return; }
        var el = document.getElementById(taId);
        var text = el ? el.value.trim() : '';
        if (!text) { toast('اكتب رأيك أولاً.', 'error'); return; }
        if (!guardText(text, 'عدّل مشاركتك')) return;
        var d = fullDoc();
        var u = d.authUser;
        var acc = d.accounts[u] || {};
        if (!Array.isArray(d.posts)) d.posts = [];
        d.posts.unshift({
            id: 'po-' + rnd(6), topic: topic, user: u,
            name: acc.name || u, text: String(text).slice(0, 1500), at: new Date().toISOString()
        });
        saveDoc(d); state = null; refresh();
        if (el) el.value = '';
        toast('نُشرت مشاركتك', 'ok');
    }

    /* التصويت */
    function renderPoll(s) {
        var box = document.getElementById('pollBox');
        if (!box) return;
        var p = s.poll;
        if (!p || !p.question || !(p.options || []).length) { box.classList.add('hidden'); return; }
        box.classList.remove('hidden');
        var votes = p.votes || {};
        var total = Object.keys(votes).length;
        var my = s.signedIn ? votes[s.user.username] : null;
        box.innerHTML = '<div class="font-bold text-matn-emerald text-sm">🗳 ' + esc(p.question) + '</div>' +
            '<div class="space-y-2 mt-3">' + p.options.map(function (o) {
                var n = Object.keys(votes).filter(function (u) { return votes[u] === o.id; }).length;
                var pct = total ? Math.round(n * 100 / total) : 0;
                var sel = my === o.id;
                return '<button type="button" data-vote="' + esc(o.id) + '" class="w-full text-right border rounded-xl px-3 py-2 relative overflow-hidden transition ' +
                    (sel ? 'border-matn-emerald bg-emerald-50' : 'border-matn-sand bg-white hover:border-matn-gold') + '">' +
                    '<span class="absolute inset-y-0 right-0 bg-matn-emerald/10" style="width:' + pct + '%"></span>' +
                    '<span class="relative flex justify-between gap-2 text-xs font-bold"><span>' + (sel ? '✓ ' : '') + esc(o.text) + '</span>' +
                    '<span class="text-matn-muted shrink-0">' + num(n) + ' · ' + pct + '%</span></span></button>';
            }).join('') + '</div>' +
            '<div class="text-[11px] text-matn-muted mt-2">' + (total ? (num(total) + ' مشاركاً') : 'كن أول من يصوّت') + (p.open === false ? ' · التصويت مغلق' : '') + '</div>';
        box.querySelectorAll('[data-vote]').forEach(function (b) {
            b.addEventListener('click', function () { votePoll(b.getAttribute('data-vote')); });
        });
    }

    /* قوائم اللوحة: الفروع · الكتاب · التصويت والمشاركات */
    function renderAdminExtra(s) {
        var bl = document.getElementById('adminBranchList');        if (bl) {
            var list = s.branches || [];
            bl.innerHTML = list.length ? list.map(function (b) {
                var lk = safeUrl(b.link);
                return '<li class="border border-matn-sand rounded-2xl p-4 ' + (b.featured ? 'bg-matn-creamDark' : 'bg-white') + '">' +
                    '<div class="flex flex-wrap items-start justify-between gap-3">' +
                        '<div class="min-w-0">' +
                            '<div class="font-bold text-sm">' + esc(b.name || '') +
                                ' <span class="text-[10px] bg-matn-gold/25 text-matn-emerald px-1.5 py-0.5 rounded">' + esc(b.city) + '</span>' +
                                (b.featured ? ' <span class="text-[10px] bg-white border border-matn-sand px-1.5 py-0.5 rounded">المعروض</span>' : '') + '</div>' +
                            '<div class="text-[11px] text-matn-muted mt-1">' + brModeLabel(b.mode) + (b.activity ? (' · ' + esc(b.activity)) : '') + '</div>' +
                            '<div class="text-[11px] mt-0.5">' + (lk ? '<span class="text-matn-muted">📍 رابط الموقع محفوظ</span>' : '<span class="text-amber-700">⚠ بلا رابط موقع</span>') + '</div>' +
                        '</div>' +
                        '<div class="flex flex-wrap items-center gap-3 text-xs">' +
                            '<button type="button" data-branch-edit="' + esc(b.id) + '" class="text-matn-emerald font-bold hover:underline">تعديل</button>' +
                            (b.featured ? '' : '<button type="button" data-branch-feature="' + esc(b.id) + '" class="text-matn-muted font-bold hover:underline">تعيين كمعروض</button>') +
                            '<button type="button" data-branch-del="' + esc(b.id) + '" class="text-red-700 font-bold hover:underline">حذف</button>' +
                        '</div>' +
                    '</div></li>';
            }).join('') : '<li class="text-matn-muted py-2">لا فروع بعد.</li>';
            bl.querySelectorAll('[data-branch-edit]').forEach(function (x) { x.addEventListener('click', function () { branchForm(x.getAttribute('data-branch-edit')); }); });
            bl.querySelectorAll('[data-branch-feature]').forEach(function (x) { x.addEventListener('click', function () { setFeaturedBranch(x.getAttribute('data-branch-feature')); }); });
            bl.querySelectorAll('[data-branch-del]').forEach(function (x) { x.addEventListener('click', function () { deleteBranch(x.getAttribute('data-branch-del')); }); });
        }
        var bi = document.getElementById('adminBookInfo');
        if (bi) {
            var b = s.book || {};
            bi.innerHTML = (b.title || b.cover)
                ? '<div class="text-xs"><strong class="text-matn-emerald">' + esc(b.title || '') + '</strong>' + (b.author ? (' — ' + esc(b.author)) : '') +
                  (safeImg(b.cover) ? ' <span class="text-[10px] bg-matn-creamDark border border-matn-sand px-1.5 py-0.5 rounded">🖼 غلاف</span>' : ' <span class="text-amber-700 text-[10px]">بلا غلاف</span>') + '</div>'
                : '<div class="text-xs text-amber-700">⚠ لم يُحدَّد كتاب الأسبوع — لن يظهر قسم «اخترنا لكم».</div>';
        }
        var pi = document.getElementById('adminPollInfo');
        if (pi) {
            var p = s.poll;
            pi.innerHTML = (p && p.question)
                ? '<div class="text-xs"><strong class="text-matn-emerald">' + esc(p.question) + '</strong> · ' + num((p.options || []).length) + ' خيارات · ' + num(Object.keys(p.votes || {}).length) + ' صوت' + (p.open === false ? ' · مغلق' : '') + '</div>'
                : '<div class="text-xs text-matn-muted">لا يوجد تصويت حالياً.</div>';
        }
        var pl = document.getElementById('adminPostList');
        if (pl) {
            var ps = s.posts || [];
            pl.innerHTML = ps.length ? ps.slice(0, 20).map(function (p) {
                return '<li class="border border-matn-sand rounded-xl p-3">' +
                    '<div class="flex items-center justify-between gap-2 text-[11px]">' +
                        '<span class="font-bold text-matn-emerald">' + esc(p.name || p.user) + '</span>' +
                        '<span class="text-matn-muted">' + (p.topic === 'book' ? 'كتاب الأسبوع' : 'جلسة الصالون') + ' · ' + esc(fmtDate(p.at)) + '</span>' +
                    '</div>' +
                    '<p class="text-xs mt-1 whitespace-pre-line">' + esc(p.text) + '</p>' +
                    '<button type="button" data-delpost="' + esc(p.id) + '" class="text-[11px] text-red-700 font-bold mt-1 hover:underline">حذف</button>' +
                '</li>';
            }).join('') : '<li class="text-matn-muted py-2">لا مشاركات.</li>';
            pl.querySelectorAll('[data-delpost]').forEach(function (x) { x.addEventListener('click', function () { deletePost(x.getAttribute('data-delpost')); }); });
        }
    }

    /* قائمة الصالونات في اللوحة */
    function renderSalons(s) {
        var sl = document.getElementById('adminSalonList');
        if (!sl) return;
        var d = doc();
        var list = s.salons || [];
        sl.innerHTML = list.length ? list.map(function (x) {
            var tk = takenOf(d, x.id);
            var isNext = (x.id === ((featuredSalon(d) || {}).id));
            return '<li class="border rounded-2xl p-4 ' + (isNext ? 'border-matn-gold bg-matn-creamDark' : 'border-matn-sand bg-white') + '">' +
                '<div class="flex flex-wrap items-start justify-between gap-3">' +
                    '<div class="min-w-0">' +
                        '<div class="font-bold text-sm">' + esc(x.title) +
                            (isNext ? ' <span class="text-[10px] font-bold bg-matn-gold/30 text-matn-emerald px-1.5 py-0.5 rounded">⭐ الأقرب موعداً — تُعرض في الرئيسية</span>' : '') + '</div>' +
                        '<div class="text-[11px] text-matn-muted mt-1">' + esc(x.when || '—') + ' • ' + esc(x.where || '—') + '</div>' +
                        '<div class="text-[11px] text-matn-muted mt-0.5">الميسّر: ' + esc(x.facilitator || '—') + ' · المحجوز: ' + num(tk) + ' من ' + num(x.capacity || 0) + '</div>' +
                        (x.venue ? ('<div class="text-[11px] mt-0.5"><span class="font-bold text-matn-emerald">' + esc(venueText(x)) + '</span>' + (safeUrl(x.venueLink) ? ' · 📍 رابط المكان محفوظ' : '') + '</div>') : '<div class="text-[11px] mt-0.5 text-amber-700">📍 لم يُحدَّد مكان اللقاء</div>') +
                        '<div class="text-[11px] text-matn-muted mt-0.5">' + esc(x.city || 'بلا مدينة') + (salonBranch(s, x.branchId) ? (' · ' + esc(salonBranch(s, x.branchId).name)) : '') +
                            (x.startsAt ? (' · 🕐 ' + esc(salonTimeRange(x)) + ' · ' + durLabel(x.durationMin)) : '') + '</div>' +
                        '<div class="text-[11px] mt-0.5"><span class="font-bold text-matn-emerald">' + modeLabel(x.mode) + '</span>' +
                            (safeUrl(x.link) ? ' · <span class="text-matn-muted">رابط الاجتماع محفوظ (يراه المحجوزون فقط)</span>' : ' · <span class="text-matn-muted">لا يوجد رابط اجتماع</span>') + '</div>' +
                        '<div class="text-[11px] mt-0.5 text-matn-muted">' + (String(x.desc || '').trim() ? '📝 الوصف مكتوب' : '<span class="text-amber-700">📝 بلا وصف</span>') +
                            ' · ' + (safeImg(x.poster) ? '🖼 صورة' : '<span class="text-amber-700">🖼 بلا صورة</span>') +
                            (x.home ? ' · <span class="text-emerald-700 font-bold">★ في الرئيسية</span>' : '') +
                            ' · ' + (x.startsAt
                            ? ('⏰ ' + esc(fmtDateTime(x.startsAt)) + ' · يصلك التنبيه ' + remindLabel(x.reminderMin || 60))
                            : '<span class="text-amber-700 font-bold">⚠ لم تُحدَّد اليوم والساعة — لا عدّاد ولا تذكير</span>') + '</div>' +
                    '</div>' +
                    '<div class="flex flex-wrap items-center gap-3 text-xs">' +
                        '<button type="button" data-salon-edit="' + esc(x.id) + '" class="text-matn-emerald font-bold hover:underline">تعديل</button>' +
                        '<button type="button" data-salon-del="' + esc(x.id) + '" class="text-red-700 font-bold hover:underline">حذف</button>' +
                    '</div>' +
                '</div></li>';
        }).join('') : '<li class="text-matn-muted py-2">لا توجد صالونات.</li>';
        sl.querySelectorAll('[data-salon-edit]').forEach(function (b) {
            b.addEventListener('click', function () { salonForm(b.getAttribute('data-salon-edit')); });
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
       فروعنا — كل مدن المملكة
       ====================================================================== */
    function citiesOptions(sel) {
        var list = SA_CITIES.slice();
        if (sel && list.indexOf(sel) === -1) list.unshift(sel);
        return list.map(function (c) {
            return '<option value="' + esc(c) + '"' + (c === sel ? ' selected' : '') + '>' + esc(c) + '</option>';
        }).join('');
    }
    function branchForm(id) {
        if (!needPerm('branches', 'فروعنا')) return;
        var d = fullDoc();
        var b = id ? d.branches.filter(function (x) { return x.id === id; })[0] : null;
        var isNew = !b;
        var v = b || { city: 'الرياض', name: '', place: '', link: '', mode: 'hybrid', activity: '' };
        modal({
            title: isNew ? 'إضافة فرع جديد' : 'تعديل الفرع',
            body: '<div class="grid grid-cols-1 sm:grid-cols-2 gap-3">' +
                    '<label class="matn-field"><span>المدينة (كل مدن المملكة)</span><select class="matn-input" id="bfCity">' + citiesOptions(v.city) + '</select></label>' +
                    '<label class="matn-field"><span>نوع النشاط</span><select class="matn-input" id="bfMode">' +
                        BRANCH_MODES.map(function (m) {
                            return '<option value="' + m.key + '"' + ((v.mode || 'in-person') === m.key ? ' selected' : '') + '>' + m.label + '</option>';
                        }).join('') +
                    '</select></label>' +
                    '<label class="matn-field sm:col-span-2"><span>اسم الفرع</span><input class="matn-input" id="bfName" type="text" value="' + esc(v.name) + '" placeholder="فرع الياسمين"></label>' +
                    '<label class="matn-field sm:col-span-2"><span>المكان / العنوان</span><input class="matn-input" id="bfPlace" type="text" value="' + esc(v.place) + '" placeholder="شارع الأمير سلطان - حي الياسمين"></label>' +
                    '<label class="matn-field sm:col-span-2"><span>📍 رابط الموقع (دبوس خرائط Google)</span><input class="matn-input" id="bfLink" type="url" value="' + esc(v.link || '') + '" placeholder="https://maps.google.com/?q=24.81,46.63"></label>' +
                    '<label class="matn-field sm:col-span-2"><span>نشاطه</span><input class="matn-input" id="bfAct" type="text" value="' + esc(v.activity) + '" placeholder="صالونات القراءة والنقاش الأسبوعي"></label>' +
                  '</div><p class="text-[10px] text-matn-muted mt-1 leading-relaxed">يظهر الفرع في قائمة «فروعنا» أعلى الموقع، ومنه يفتح الزائر الموقع على خرائط Google.</p><p id="bfMsg" class="text-xs"></p>',
            footer: '<button type="button" id="bfGo" class="bg-matn-emerald hover:bg-matn-emeraldLight text-white px-4 py-2.5 rounded-xl text-xs font-bold transition">حفظ</button>' + okBtn('إلغاء'),
            ready: function (w) {
                w.querySelector('#bfGo').addEventListener('click', function () {
                    var nm = w.querySelector('#bfName').value.trim();
                    var m = w.querySelector('#bfMsg');
                    if (!nm) { m.textContent = 'اكتب اسم الفرع.'; m.className = 'text-xs text-red-700'; return; }
                    var nd = fullDoc();
                    var data = {
                        city: w.querySelector('#bfCity').value,
                        name: nm,
                        place: w.querySelector('#bfPlace').value.trim(),
                        link: safeUrl(w.querySelector('#bfLink').value),
                        mode: w.querySelector('#bfMode').value,
                        activity: w.querySelector('#bfAct').value.trim()
                    };
                    if (isNew) {
                        data.id = 'br-' + rnd(6).toLowerCase();
                        data.at = new Date().toISOString();
                        data.featured = nd.branches.length === 0;
                        nd.branches.push(data);
                    } else {
                        var t = nd.branches.filter(function (x) { return x.id === id; })[0];
                        if (t) for (var k in data) t[k] = data[k];
                    }
                    saveDoc(nd); closeModal(); refresh();
                    toast(isNew ? 'أُضيف الفرع' : 'حُفظت تعديلات الفرع', 'ok');
                });
            }
        });
    }
    function deleteBranch(id) {
        if (!needPerm('branches', 'فروعنا')) return;
        var d = fullDoc();
        var b = d.branches.filter(function (x) { return x.id === id; })[0];
        if (!b) return;
        confirmBox('حذف الفرع', 'سيُحذف «' + (b.name || b.city) + '» من قائمة فروعنا. لا يمكن التراجع.', function () {
            var nd = fullDoc();
            nd.branches = nd.branches.filter(function (x) { return x.id !== id; });
            if (!nd.branches.some(function (x) { return x.featured; }) && nd.branches[0]) nd.branches[0].featured = true;
            saveDoc(nd); refresh(); toast('حُذف الفرع', 'ok');
        }, 'حذف');
    }
    function setFeaturedBranch(id) {
        if (!needPerm('branches', 'فروعنا')) return;
        var d = fullDoc();
        d.branches.forEach(function (b) { b.featured = (b.id === id); });
        saveDoc(d); refresh();
        toast('صار هذا الفرع هو المعروض في بطاقة الموقع', 'ok');
    }

    /* ======================================================================
       كتاب الأسبوع
       ====================================================================== */
    function bookForm() {
        if (!needPerm('book', 'كتاب الأسبوع')) return;
        var d = fullDoc();
        var b = d.book || {};
        modal({
            title: 'كتاب الأسبوع — اخترنا لكم',
            body: '<div class="grid grid-cols-1 sm:grid-cols-2 gap-3">' +
                    '<label class="matn-field sm:col-span-2"><span>عنوان الكتاب</span><input class="matn-input" id="bkWTitle" type="text" value="' + esc(b.title) + '" placeholder="موسم الهجرة إلى الشمال"></label>' +
                    '<label class="matn-field"><span>المؤلف</span><input class="matn-input" id="bkWAuthor" type="text" value="' + esc(b.author) + '" placeholder="الطيب صالح"></label>' +
                    '<label class="matn-field"><span>رابط (اختياري)</span><input class="matn-input" id="bkWUrl" type="url" value="' + esc(b.url || '') + '" placeholder="https://..."></label>' +
                    '<label class="matn-field"><span>🛒 سعر الكتاب (ر.س) — 0 = مجاني للأعضاء</span><input class="matn-input" id="bkPrice" type="number" min="0" step="1" value="' + Math.max(0, parseInt(b.price, 10) || 0) + '"></label>' +
                    '<p class="text-[10px] text-matn-muted sm:col-span-2 -mt-1">إن وضعت سعراً يظهر زر «شراء الكتاب» ويؤكده المشرف من «طلبات الشراء». وكتاب الأسبوع للأعضاء والمشتركين.</p>' +
                    '<label class="matn-field sm:col-span-2"><span>نبذة / لماذا اخترناه</span><textarea class="matn-input" id="bkWDesc" rows="3" placeholder="سطران عن الكتاب">' + esc(b.desc) + '</textarea></label>' +
                    '<label class="matn-field sm:col-span-2"><span>🖼 صورة الغلاف</span>' +
                        '<input class="matn-input" id="bkWPoster" type="url" value="' + (b.cover && b.cover.indexOf('data:') !== 0 ? esc(b.cover) : '') + '" placeholder="https://example.com/cover.jpg">' +
                        '<input type="file" id="bkWFile" accept="image/*" class="hidden">' +
                        '<div class="flex flex-wrap items-center gap-2 mt-2">' +
                            '<button type="button" id="bkWPick" class="matn-preset">📁 اختر صورة من جهازك</button>' +
                            '<button type="button" id="bkWClear" class="matn-preset">إزالة الصورة</button>' +
                            '<img id="bkWPrev" alt="" class="' + (b.cover ? '' : 'hidden ') + 'w-16 h-20 object-cover rounded-lg border border-matn-sand" src="' + esc(b.cover || '') + '">' +
                        '</div></span></label>' +
                  '</div><p id="bkWMsg" class="text-xs"></p>',
            footer: '<button type="button" id="bkWGo" class="bg-matn-emerald hover:bg-matn-emeraldLight text-white px-4 py-2.5 rounded-xl text-xs font-bold transition">حفظ</button>' + okBtn('إلغاء'),
            ready: function (w) {
                var cover = safeImg(b.cover || '');
                var prev = w.querySelector('#bkWPrev');
                var showPrev = function (u) { if (u) { prev.src = u; prev.classList.remove('hidden'); } else { prev.removeAttribute('src'); prev.classList.add('hidden'); } };
                w.querySelector('#bkWPick').addEventListener('click', function () { w.querySelector('#bkWFile').click(); });
                w.querySelector('#bkWFile').addEventListener('change', function (ev) {
                    var f = ev.target.files && ev.target.files[0];
                    if (!f) return;
                    var m = w.querySelector('#bkWMsg'); m.textContent = 'جارٍ تجهيز الصورة…'; m.className = 'text-xs text-matn-muted';
                    compressImage(f, 700, 0.82).then(function (url) {
                        cover = url; w.querySelector('#bkWPoster').value = ''; showPrev(url);
                        m.textContent = 'حُضّرت الصورة — اضغط حفظ.'; m.className = 'text-xs text-emerald-700';
                    }).catch(function () { m.textContent = 'تعذّر قراءة الصورة.'; m.className = 'text-xs text-red-700'; });
                });
                w.querySelector('#bkWPoster').addEventListener('input', function (e) { cover = safeImg(e.target.value); showPrev(cover); });
                w.querySelector('#bkWClear').addEventListener('click', function () { cover = ''; w.querySelector('#bkWPoster').value = ''; showPrev(''); });
                w.querySelector('#bkWGo').addEventListener('click', function () {
                    var nd = fullDoc();
                    nd.book = {
                        title: w.querySelector('#bkWTitle').value.trim(),
                        author: w.querySelector('#bkWAuthor').value.trim(),
                        desc: w.querySelector('#bkWDesc').value.trim(),
                        url: safeUrl(w.querySelector('#bkWUrl').value),
                        cover: cover,
                        price: Math.max(0, parseInt((w.querySelector('#bkPrice') || {}).value, 10) || 0),
                        at: new Date().toISOString()
                    };
                    saveDoc(nd); closeModal(); refresh();
                    toast('حُفظ كتاب الأسبوع', 'ok');
                });
            }
        });
    }

    /* ======================================================================
       النقاش وآراء الأعضاء + التصويت
       ====================================================================== */
    var postTopic = 'book';
    function addPost() {
        if (needsLogin()) { requireLogin('الحوار والنقاش'); return; }
        var el = document.getElementById('postText');
        var text = el ? el.value.trim() : '';
        if (!text) { toast('اكتب رأيك أولاً.', 'error'); return; }
        if (!guardText(text, 'عدّل مشاركتك')) return;
        var d = fullDoc();
        var u = d.authUser;
        var acc = d.accounts[u] || {};
        if (!Array.isArray(d.posts)) d.posts = [];
        d.posts.unshift({
            id: 'po-' + rnd(6), topic: postTopic, user: u,
            name: acc.name || u, text: String(text).slice(0, 1500), at: new Date().toISOString()
        });
        saveDoc(d); refresh();
        toast('نُشرت مشاركتك', 'ok');
    }
    function deletePost(id) {
        var d = fullDoc();
        var p = (d.posts || []).filter(function (x) { return x.id === id; })[0];
        if (!p) return;
        var mine = d.authUser && p.user === d.authUser;
        if (!mine && !can('engage')) { toast('يمكنك حذف مشاركتك فقط.', 'error'); return; }
        d.posts = d.posts.filter(function (x) { return x.id !== id; });
        saveDoc(d); refresh(); toast('حُذفت المشاركة', 'info');
    }
    function votePoll(optId, pollId) {
        if (needsLogin()) { requireLogin('التصويت'); return; }
        var d = fullDoc();
        var p = null;
        if (pollId) p = pollsOf(d).filter(function (x) { return x.id === pollId; })[0] || null;
        if (!p) p = activePoll(d) || (d.poll && d.poll.question ? d.poll : null);
        if (!p) { toast('لا يوجد تصويت حالياً.', 'info'); return; }
        if (!pollOpenNow(p)) { toast('التصويت مغلق أو لم يبدأ بعد.', 'info'); return; }
        if (!p.votes) p.votes = {};
        p.votes[d.authUser] = optId;
        if (!Array.isArray(d.polls)) d.polls = [];
        if (p.id && !d.polls.some(function (x) { return x.id === p.id; })) d.polls.push(p);
        d.poll = activePoll(d) || d.poll;
        saveDoc(d); state = null; refresh();
        toast('شُجّل تصويتك', 'ok');
    }
    /* تعليق على تصويت */
    function addPollComment(pollId) {
        if (needsLogin()) { requireLogin('التعليق'); return; }
        var el = document.getElementById('pcText');
        var text = el ? el.value.trim() : '';
        if (!text) { toast('اكتب تعليقك أولاً.', 'error'); return; }
        if (!guardText(text, 'عدّل تعليقك')) return;
        var d = fullDoc();
        var acc = d.accounts[d.authUser] || {};
        d.posts = d.posts || [];
        d.posts.unshift({
            id: 'po-' + rnd(6), topic: pollCommentTopic(pollId), pollId: pollId,
            user: d.authUser, name: acc.name || d.authUser,
            text: String(text).slice(0, 1000), at: new Date().toISOString()
        });
        saveDoc(d); state = null; refresh();
        toast('نُشر تعليقك على التصويت', 'ok');
    }
    function whenValue(iso) {
        if (!iso) return '';
        var dt = new Date(iso);
        if (isNaN(dt.getTime())) return '';
        var off = dt.getTimezoneOffset() * 60000;
        return new Date(dt.getTime() - off).toISOString().slice(0, 16);
    }
    function pollForm(editId) {
        if (!needPerm('engage', 'التصويت')) return;
        var d = fullDoc();
        var p = null;
        if (editId) p = pollsOf(d).filter(function (x) { return x.id === editId; })[0] || null;
        if (!p) p = { question: '', options: [{ id: 'o1', text: '' }, { id: 'o2', text: '' }], votes: {}, open: true, id: 'pl-' + rnd(6), at: new Date().toISOString() };
        modal({
            title: 'تصويت الأسبوع',
            body: '<label class="matn-field"><span>سؤال التصويت</span><input class="matn-input" id="poQ" type="text" value="' + esc(p.question) + '" placeholder="أي كتاب نقرأ الأسبوع القادم؟"></label>' +
                  '<label class="matn-field"><span>الخيارات — كل سطر خيار (حتى 6)</span><textarea class="matn-input" id="poOpts" rows="4" placeholder="الخيار الأول&#10;الخيار الثاني">' + esc((p.options || []).map(function (o) { return o.text; }).join('\n')) + '</textarea></label>' +
                  '<div class="grid grid-cols-1 sm:grid-cols-2 gap-3">' +
                    '<label class="matn-field"><span>🕐 يبدأ التصويت (اختياري)</span><input class="matn-input" id="poStart" type="datetime-local" value="' + whenValue(p.startAt) + '"></label>' +
                    '<label class="matn-field"><span>⏹ ينتهي التصويت (اختياري)</span><input class="matn-input" id="poEnd" type="datetime-local" value="' + whenValue(p.endAt) + '"></label>' +
                  '</div>' +
                  '<p class="text-[10px] text-matn-muted -mt-1">بعد انتهاء الوقت يختفي التصويت من الرئيسية ويبقى في صفحة التصويتات.</p>' +
                  '<div class="flex flex-wrap gap-4 text-xs mt-1">' +
                    '<label class="flex items-center gap-2"><input type="checkbox" id="poOpen"' + (p.open === false ? '' : ' checked') + '> التصويت مفتوح</label>' +
                    '<label class="flex items-center gap-2"><input type="checkbox" id="poReset"> تصفير الأصوات</label>' +
                  '</div><p id="poMsg" class="text-xs"></p>',
            footer: '<button type="button" id="poGo" class="bg-matn-emerald hover:bg-matn-emeraldLight text-white px-4 py-2.5 rounded-xl text-xs font-bold transition">حفظ</button>' + okBtn('إلغاء'),
            ready: function (w) {
                w.querySelector('#poGo').addEventListener('click', function () {
                    var q = w.querySelector('#poQ').value.trim();
                    var opts = w.querySelector('#poOpts').value.split('\n').map(function (s) { return s.trim(); }).filter(Boolean).slice(0, 6);
                    var m = w.querySelector('#poMsg');
                    if (!q) { m.textContent = 'اكتب سؤال التصويت.'; m.className = 'text-xs text-red-700'; return; }
                    if (opts.length < 2) { m.textContent = 'اكتب خيارين على الأقل.'; m.className = 'text-xs text-red-700'; return; }
                    var nd = fullDoc();
                    if (!Array.isArray(nd.polls)) nd.polls = [];
                    var cur = editId ? nd.polls.filter(function (x) { return x.id === editId; })[0] : null;
                    var oldVotes = (cur && !w.querySelector('#poReset').checked) ? (cur.votes || {}) : {};
                    var sEl = w.querySelector('#poStart'), eEl = w.querySelector('#poEnd');
                    var obj = cur || { id: 'pl-' + rnd(6), at: new Date().toISOString(), votes: {} };
                    obj.question = q;
                    obj.options = opts.map(function (tx, i) { return { id: 'o' + (i + 1), text: tx }; });
                    obj.votes = oldVotes;
                    obj.open = !!w.querySelector('#poOpen').checked;
                    obj.startAt = (sEl && sEl.value) ? new Date(sEl.value).toISOString() : '';
                    obj.endAt = (eEl && eEl.value) ? new Date(eEl.value).toISOString() : '';
                    if (!obj.at) obj.at = new Date().toISOString();
                    if (!cur) nd.polls.unshift(obj);
                    nd.poll = activePoll(nd) || obj;
                    saveDoc(nd); closeModal(); state = null; refresh();
                    toast(cur ? 'حُفظ التصويت' : 'أُضيف تصويت جديد', 'ok');
                });
            }
        });
    }

    /* ======================================================================
       المذكرات (أجندة الأعضاء)
       ====================================================================== */
    var DIARY_MAX = 2000;
    function diaryEntries(d, u) {
        var a = (d.accounts || {})[u];
        return (a && Array.isArray(a.diary)) ? a.diary : [];
    }
    function diaryAvg(e) {
        var k = Object.keys(e.ratings || {});
        if (!k.length) return { avg: 0, n: 0 };
        var sum = 0;
        k.forEach(function (u) { sum += Number(e.ratings[u]) || 0; });
        return { avg: sum / k.length, n: k.length };
    }
    function starsHtml(n) {
        var out = '';
        for (var i = 1; i <= 5; i++) out += (i <= Math.round(n) ? '★' : '☆');
        return out;
    }
    function diaryWord(n) {
        if (n === 1) return 'مذكرة';
        if (n === 2) return 'مذكرتان';
        if (n >= 3 && n <= 10) return 'مذكرات';
        return 'مذكرة';
    }
    /* ============ 📢 إعلان الترويسة (من اللوحة) ============ */
    var AD_DEFAULT = 'الصالون الثقافي العربي المعاصر • نلتقي حول كتاب، ونغادر بفكرة.';
    function headerAd(d) {
        var a = (d && d.headerAd) || {};
        return {
            text: (typeof a.text === 'string' && a.text.trim()) ? a.text : AD_DEFAULT,
            link: a.link || '', linkText: a.linkText || '',
            active: a.active === false ? false : true
        };
    }
    function renderHeaderAd(s) {
        var bars = document.querySelectorAll('[data-ad-bar]');
        if (!bars.length) return;
        var ad = headerAd(fullDoc());
        bars.forEach(function (b) { b.classList.toggle('hidden', ad.active === false); });
        document.querySelectorAll('[data-header-ad]').forEach(function (el) { el.textContent = ad.text; });
        document.querySelectorAll('[data-header-link]').forEach(function (a) {
            var lk = safeLink(ad.link);
            if (ad.active !== false && lk && ad.linkText) {
                a.href = lk; a.textContent = ad.linkText; a.classList.remove('hidden');
            } else { a.classList.add('hidden'); a.removeAttribute('href'); a.textContent = ''; }
        });
    }
    function saveHeaderAd() {
        if (!needPerm('engage', 'إعلان الترويسة')) return;
        var q = function (id) { var e = document.getElementById(id); return e ? e.value : ''; };
        var cb = document.getElementById('adActive');
        var d = fullDoc();
        d.headerAd = {
            text: String(q('adText')).trim() || AD_DEFAULT,
            linkText: String(q('adLinkText')).trim(),
            link: safeLink(String(q('adLink')).trim()) || '',
            active: cb ? !!cb.checked : true,
            at: new Date().toISOString()
        };
        saveDoc(d); state = null; render();
        toast(d.headerAd.active ? 'حُفظ الإعلان وهو ظاهر الآن' : 'حُفظ الإعلان وأُوقف', 'ok');
    }
    function renderHeaderAdAdmin(s) {
        var t = document.getElementById('adText');
        if (!t) return;
        if (document.activeElement === t) return;
        var a = headerAd(fullDoc());
        t.value = a.text;
        var lt = document.getElementById('adLinkText'); if (lt) lt.value = a.linkText || '';
        var lk = document.getElementById('adLink'); if (lk) lk.value = a.link || '';
        var cb = document.getElementById('adActive'); if (cb) cb.checked = a.active !== false;
        var pv = document.getElementById('adPreview');
        if (pv) {
            pv.innerHTML = '<span class="font-bold text-white">' + esc(a.text) + '</span>' +
                (a.linkText && a.link ? (' <span class="underline text-matn-goldLight">' + esc(a.linkText) + '</span>') : '') +
                (a.active === false ? ' <span class="text-red-300 font-bold">(موقوف — لا يظهر للزوار)</span>' : '');
            pv.className = 'bg-matn-emeraldDark rounded-xl px-3 py-2.5 text-xs text-center';
        }
    }

    /* ============ فلتر الكلمات المخالفة للذوق العام ============ */
    var BAD_WORDS_SEED = ['كلب', 'حمار', 'غبي', 'أحمق', 'تافه', 'خرقاء', 'لعنة', 'قذر', 'حقير', 'كريه',
        'مقرف', 'سخيف', 'بليد', 'حثالة', 'زبالة', 'يلعن', 'قذارة', 'وسخ', 'مجنون', 'أبله', 'فاشل'];
    function badWords(d) {
        var list = (d && Array.isArray(d.badWords) && d.badWords.length) ? d.badWords : BAD_WORDS_SEED;
        return list.map(function (w) { return String(w || '').trim(); }).filter(Boolean);
    }
    function findBadWord(text) {
        var t = String(text || '');
        if (!t) return null;
        var words = badWords(fullDoc());
        for (var i = 0; i < words.length; i++) {
            if (t.indexOf(words[i]) !== -1) return words[i];
        }
        return null;
    }
    function guardText(text, what) {
        var bad = findBadWord(text);
        if (!bad) return true;
        toast('🚫 كلمة مخالفة للذوق العام («' + bad + '») — ' + (what || 'عدّل النص') + ' واحترم بقية الأعضاء.', 'error');
        return false;
    }
    /* ============ التصويتات (متعددة + وقت بداية ونهاية) ============ */
    function pollsOf(d) {
        var list = (d && Array.isArray(d.polls)) ? d.polls.slice() : [];
        if (!list.length && d && d.poll && d.poll.question) list = [d.poll];
        return list.sort(function (a, b) { return new Date(b.at || 0) - new Date(a.at || 0); });
    }
    function pollOpenNow(p) {
        if (!p || !p.question || !(p.options || []).length) return false;
        if (p.open === false) return false;
        var now = Date.now();
        if (p.startAt && now < new Date(p.startAt).getTime()) return false;
        if (p.endAt && now > new Date(p.endAt).getTime()) return false;
        return true;
    }
    function pollState(p) {
        if (!p || !p.question) return 'none';
        var now = Date.now();
        if (p.startAt && now < new Date(p.startAt).getTime()) return 'soon';
        if (p.open === false) return 'closed';
        if (p.endAt && now > new Date(p.endAt).getTime()) return 'ended';
        return 'live';
    }
    function activePoll(d) {
        var list = pollsOf(d);
        for (var i = 0; i < list.length; i++) { if (pollOpenNow(list[i])) return list[i]; }
        return null;
    }
    function pollStateLabel(p) {
        var st = pollState(p);
        if (st === 'live') return '<span class="text-emerald-700 font-bold">🔴 جارٍ الآن</span>';
        if (st === 'soon') return '<span class="text-amber-700 font-bold">⏳ لم يبدأ بعد</span>';
        if (st === 'ended') return '<span class="text-matn-muted font-bold">✓ انتهى</span>';
        if (st === 'closed') return '<span class="text-matn-muted font-bold">مغلق</span>';
        return '';
    }
    function pollWhenLabel(p) {
        var out = [];
        if (p.startAt) out.push('من ' + fmtDateTime(p.startAt));
        if (p.endAt) out.push('إلى ' + fmtDateTime(p.endAt));
        return out.join(' · ');
    }
    function pollBoxHtml(p, opts) {
        opts = opts || {};
        if (!p || !p.question) return '';
        var votes = p.votes || {};
        var total = Object.keys(votes).length;
        var d = fullDoc();
        var my = d.authUser ? votes[d.authUser] : null;
        var live = pollOpenNow(p);
        return '<div class="font-bold text-matn-emerald text-sm">🗳 ' + esc(p.question) + '</div>' +
            (opts.showState ? ('<div class="text-[10px] mt-1">' + pollStateLabel(p) + (pollWhenLabel(p) ? (' <span class="text-matn-muted">· ' + esc(pollWhenLabel(p)) + '</span>') : '') + '</div>') : '') +
            '<div class="space-y-2 mt-3">' + (p.options || []).map(function (o) {
                var n = Object.keys(votes).filter(function (u) { return votes[u] === o.id; }).length;
                var pct = total ? Math.round(n * 100 / total) : 0;
                var sel = my === o.id;
                return '<button type="button" data-vote="' + esc(o.id) + '" data-poll="' + esc(p.id || '') + '"' + (live ? '' : ' disabled') +
                    ' class="w-full text-right border rounded-xl px-3 py-2 relative overflow-hidden transition ' +
                    (sel ? 'border-matn-emerald bg-emerald-50' : 'border-matn-sand bg-white') + (live ? ' hover:border-matn-gold' : ' opacity-80') + '">' +
                    '<span class="absolute inset-y-0 right-0 bg-matn-emerald/10" style="width:' + pct + '%"></span>' +
                    '<span class="relative flex justify-between gap-2 text-xs font-bold"><span>' + (sel ? '✓ ' : '') + esc(o.text) + '</span>' +
                    '<span class="text-matn-muted shrink-0">' + num(n) + ' · ' + pct + '%</span></span></button>';
            }).join('') + '</div>' +
            '<div class="text-[11px] text-matn-muted mt-2">' + (total ? (num(total) + ' مشاركاً') : 'كن أول من يصوّت') +
            (!live ? ' · التصويت مغلق' : '') + (opts.showState ? '' : '') + '</div>';
    }
    function wireVotes(root) {
        if (!root) return;
        root.querySelectorAll('[data-vote]').forEach(function (b) {
            b.addEventListener('click', function () { votePoll(b.getAttribute('data-vote'), b.getAttribute('data-poll')); });
        });
    }
    /* تعليقات كل تصويت (لا تظهر في الرئيسية) */
    function pollCommentTopic(id) { return 'poll:' + id; }
    function pollCommentsBlock(p) {
        var d = fullDoc();
        var s = load();
        var topic = pollCommentTopic(p.id);
        var items = (s.posts || []).filter(function (x) { return x.topic === topic; });
        return '<div class="space-y-3">' +
            '<div class="text-[11px] font-bold text-matn-emerald">💬 تعليقات الأعضاء على التصويت (' + num(items.length) + ')</div>' +
            (s.signedIn
                ? ('<div class="space-y-2"><textarea id="pcText" rows="2" class="matn-input" placeholder="تعليقك على هذا التصويت…"></textarea>' +
                   '<button type="button" data-action="add-poll-comment" data-poll="' + esc(p.id) + '" class="bg-matn-emerald hover:bg-matn-emeraldLight text-white px-4 py-2 rounded-xl text-xs font-bold transition">انشر تعليقي</button></div>')
                : '<p class="text-[11px] text-matn-muted">سجّل الدخول للتعليق.</p>') +
            '<ul class="text-xs space-y-2">' + (items.length ? items.map(function (x) {
                var canDel = (s.signedIn && x.user === s.user.username) || can('engage');
                return '<li class="border border-matn-sand rounded-2xl p-3 bg-white">' +
                    '<div class="flex items-center justify-between gap-2 text-[11px]">' +
                        '<button type="button" data-member="' + esc(x.user) + '" class="font-bold text-matn-emerald hover:underline">' + esc(x.name || x.user) + ' ›</button>' +
                        '<span class="text-matn-muted">' + esc(fmtDate(x.at)) + '</span></div>' +
                    '<p class="text-xs leading-relaxed mt-1.5 whitespace-pre-line">' + esc(x.text) + '</p>' +
                    (canDel ? '<button type="button" data-delpost="' + esc(x.id) + '" class="text-[11px] text-red-700 font-bold mt-1.5 hover:underline">حذف</button>' : '') +
                '</li>';
            }).join('') : '<li class="text-xs text-matn-muted py-1">لا تعليقات بعد.</li>') + '</ul></div>';
    }
    function renderPollsPage(s) {
        var box = document.getElementById('pollsBox');
        if (!box) return;
        var d = fullDoc();
        var list = pollsOf(d);
        if (!list.length) {
            box.innerHTML = '<div class="bg-white rounded-3xl border border-dashed border-matn-sand p-6 text-center text-xs text-matn-muted">لا توجد تصويتات بعد — يضيفها المشرف من لوحة الإدارة.</div>';
            return;
        }
        box.innerHTML = list.map(function (p) {
            var st = pollState(p);
            var live = st === 'live';
            var res = pollBoxHtml(p, { showState: true });
            return '<section class="bg-matn-cream rounded-3xl border border-matn-sand shadow-sm p-5 space-y-4 ' + (live ? '' : 'opacity-95') + '">' +
                '<div class="flex flex-wrap items-center justify-between gap-2">' +
                    '<h2 class="font-amiri text-xl font-bold text-matn-emerald">🗳 ' + esc(p.question) + '</h2>' + pollStateLabel(p) + '</div>' +
                (pollWhenLabel(p) ? '<p class="text-[11px] text-matn-muted">🕐 ' + esc(pollWhenLabel(p)) + '</p>' : '') +
                '<div>' + res + '</div>' +
                pollCommentsBlock(p) +
            '</section>';
        }).join('');
        wireVotes(box);
        wirePostsBox(box);
    }
    /* تصويت الرئيسية: آخر تصويت جارٍ فقط (بلا تعليقات) */
    function renderHomePoll(s) {
        var box = document.getElementById('homePollBox');
        if (!box) return;
        var d = fullDoc();
        var p = activePoll(d);
        if (!p) { box.classList.add('hidden'); box.innerHTML = ''; return; }
        box.classList.remove('hidden');
        box.innerHTML = pollBoxHtml(p, { showState: true }) +
            '<a href="polls.html" class="inline-block mt-3 text-[11px] font-bold text-matn-emerald hover:underline">كل التصويتات والتعليق عليها ›</a>';
        wireVotes(box);
    }
    function clip(t, n) {
        var x = String(t == null ? '' : t).replace(/\s+/g, ' ').trim();
        return x.length > n ? x.slice(0, n) + '…' : x;
    }
    function publicDiaries(d) {
        var out = [];
        Object.keys(d.accounts || {}).forEach(function (u) {
            var a = d.accounts[u];
            if (!a || a.system || a.suspended) return;
            (a.diary || []).forEach(function (e) {
                if (e.public === false) return;
                out.push({ u: u, name: a.name || u, avatar: a.avatar || '', e: e });
            });
        });
        return out.sort(function (x, y) { return new Date(y.e.at) - new Date(x.e.at); });
    }
    function visibleComments(e, me, isOwner, isMod) {
        return (e.comments || []).filter(function (c) {
            if (c.hide) return !!isMod;                 /* المُخفى بعد ٣ إبلاغات: للمشرف فقط */
            if (c.approved) return true;
            return isOwner || c.user === me;            /* غير الموافَق: لصاحبة المذكرة أو كاتب التعليق */
        });
    }
    function diaryRowHtml(it, opts) {
        opts = opts || {};
        var av = safeImg(it.avatar);
        var n = (it.e.comments || []).filter(function (c) { return c.approved && !c.hide; }).length;
        var rt = diaryAvg(it.e);
        return '<button type="button" data-diary="' + esc(it.u) + '" data-entry="' + esc(it.e.id) + '" class="w-full text-right flex items-center gap-3 bg-white border border-matn-sand hover:border-matn-gold rounded-2xl px-3 py-2.5 sm:px-4 sm:py-3 transition shadow-sm">' +
            (av
                ? '<img src="' + esc(av) + '" alt="" class="w-9 h-9 rounded-full object-cover shrink-0 border border-matn-sand">'
                : '<span class="w-9 h-9 rounded-full bg-matn-creamDark flex items-center justify-center font-bold text-matn-emerald shrink-0 text-xs">' + esc(String(it.name || '؟').charAt(0)) + '</span>') +
            '<span class="min-w-0 flex-1">' +
                '<span class="flex flex-wrap items-center gap-x-2 gap-y-0.5">' +
                    '<strong class="text-[11px] sm:text-xs text-matn-emerald">' + esc(it.name) + '</strong>' +
                    '<span class="text-[10px] text-matn-muted">' + esc(fmtDate(it.e.at)) + '</span>' +
                    (rt.n ? '<span class="text-[10px] text-amber-600">' + starsHtml(rt.avg) + ' ' + rt.avg.toFixed(1) + '</span>' : '') +
                    (n ? '<span class="text-[10px] text-matn-muted">💬 ' + num(n) + '</span>' : '') +
                    (opts.showPending && (it.e.comments || []).some(function (c) { return !c.approved; })
                        ? '<span class="text-[10px] font-bold text-amber-700 bg-amber-50 border border-amber-200 rounded-full px-1.5">تعليق بانتظار موافقتك</span>' : '') +
                '</span>' +
                '<span class="block text-[11px] text-matn-muted truncate mt-0.5">«' + esc(clip(it.e.text, 90)) + '»</span>' +
            '</span>' +
            '<span class="shrink-0 text-[11px] font-bold text-matn-emerald whitespace-nowrap">للمزيد اضغط هنا ›</span>' +
        '</button>';
    }
    /* شريط المذكرات في أعلى الرئيسية */
    function renderDiaryStrip(s) {
        var box = document.getElementById('diaryStrip');
        if (!box) return;
        var d = fullDoc();
        var list = publicDiaries(d);
        var sec = box.closest('section');
        if (sec) sec.classList.toggle('hidden', !list.length);
        if (!list.length) { box.innerHTML = ''; return; }
        box.classList.remove('hidden');
        var head =
            '<div class="flex flex-wrap items-end justify-between gap-3 mb-4">' +
                '<div>' +
                    '<div class="text-[11px] font-bold tracking-[.25em] text-matn-gold">من أجندة الأعضاء</div>' +
                    '<h2 class="font-amiri text-2xl sm:text-3xl font-bold text-matn-emerald mt-1">📔 مذكرات الأعضاء</h2>' +
                    '<p class="text-[11px] text-matn-muted mt-1">مقتطفات من يوميات الأعضاء — اضغط أي مذكرة للمزيد والتقييم والتعليق.</p>' +
                '</div>' +
                '<a href="account.html#diary" class="text-[11px] font-bold text-matn-emerald bg-white border border-matn-sand px-3 py-2 rounded-xl hover:border-matn-gold transition">اكتب مذكرتك ›</a>' +
            '</div>';
        box.innerHTML = head + '<div class="space-y-2">' + list.slice(0, 5).map(function (it) { return diaryRowHtml(it); }).join('') + '</div>' +
            (list.length > 5 ? '<p class="text-center mt-4"><a href="account.html#diary" class="text-[11px] font-bold text-matn-emerald hover:underline">عرض كل المذكرات (' + num(list.length) + ') ›</a></p>' : '');
        bindDiaryRows(box);
    }
    /* 🤝 شركاؤنا في الرئيسية: الاسم + المقر + الشارع + المول + رابط الخريطة */
    function partnerLocLine(p) {
        var bits = [];
        if (p.place) bits.push(esc(p.place));
        if (p.city) bits.push(esc(p.city));
        var head = bits.join(' — ');
        var out = '';
        if (head) out += '<span class="block text-[11px] text-matn-charcoal">📍 المقر: ' + head + '</span>';
        if (p.street) out += '<span class="block text-[11px] text-matn-muted">🛣 الشارع: ' + esc(p.street) + '</span>';
        if (p.mall) out += '<span class="block text-[11px] text-matn-muted">🏬 المول/المبنى: ' + esc(p.mall) + '</span>';
        return out;
    }
    function renderHomePartners(s) {
        var card = document.getElementById('homePartnersCard');
        var box = document.getElementById('homePartners');
        if (!card || !box) return;
        var list = s.partners || [];
        card.classList.toggle('hidden', !list.length);
        if (!list.length) return;
        box.innerHTML = list.map(function (p) {
            var lk = safeUrl(p.link);
            var inner =
                '<span class="shrink-0 w-9 h-9 rounded-full bg-white border border-matn-sand flex items-center justify-center text-base">' + (p.tag === 1 ? '🏋️' : p.tag === 2 ? '☕' : p.tag === 3 ? '📚' : '✨') + '</span>' +
                '<span class="min-w-0 flex-1">' +
                    '<span class="flex flex-wrap items-center gap-2">' +
                        '<strong class="text-xs text-matn-emerald">' + esc(p.name) + '</strong>' +
                        '<span class="text-[10px] font-bold px-1.5 py-0.5 rounded ' + catCls(p.tag) + '">' + esc(catLabel(p.tag)) + '</span>' +
                        '<span class="text-[10px] text-matn-gold font-bold">' + num(p.cost) + ' نقطة</span>' +
                    '</span>' +
                    partnerLocLine(p) +
                    (p.desc ? '<span class="block text-[10px] text-matn-muted mt-0.5">' + esc(clip(p.desc, 90)) + '</span>' : '') +
                '</span>' +
                (lk ? '<span class="shrink-0 text-[11px] font-bold text-matn-emerald whitespace-nowrap">🗺 الموقع ›</span>'
                    : '<span class="shrink-0 text-[10px] text-matn-muted whitespace-nowrap">بلا موقع</span>');
            return lk
                ? '<a href="' + esc(lk) + '" target="_blank" rel="noopener" class="w-full flex items-start gap-3 bg-white border border-matn-sand hover:border-matn-gold rounded-2xl px-3 py-3 transition shadow-sm">' + inner + '</a>'
                : '<div class="w-full flex items-start gap-3 bg-white border border-matn-sand rounded-2xl px-3 py-3 shadow-sm">' + inner + '</div>';
        }).join('');
    }
    /* فتح/إغلاق نقاش كتاب الأسبوع */
    function toggleBookTalk(force) {
        var box = document.getElementById('bookTalk');
        if (!box) return;
        var on = (typeof force === 'boolean') ? force : box.classList.contains('hidden');
        box.classList.toggle('hidden', !on);
        var btn = document.getElementById('bookTalkBtn');
        if (btn) btn.textContent = on ? '▲ إخفاء الآراء والنقاش' : '💬 آراء الأعضاء والحوار';
        if (on) window.setTimeout(function () { try { box.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); } catch (e) {} }, 120);
    }

    /* القائمة المنسدلة للمذكرات في الترويسة */
    function renderDiaryMenu(s) {
        var boxes = document.querySelectorAll('[data-diary-menu]');
        if (!boxes.length) return;
        var d = fullDoc();
        var list = publicDiaries(d).slice(0, 5);
        boxes.forEach(function (el) {
            el.innerHTML =
                '<div class="px-2 pt-1 pb-2 text-[10px] font-bold text-matn-gold border-b border-matn-sand/60 mb-1">أحدث مذكرات الأعضاء</div>' +
                (list.length ? list.map(function (it) {
                    return '<button type="button" data-diary="' + esc(it.u) + '" data-entry="' + esc(it.e.id) + '" class="w-full text-right block px-2 py-2 rounded-xl hover:bg-matn-cream transition">' +
                        '<span class="block text-[11px] font-bold text-matn-emerald">' + esc(it.name) + ' <span class="text-[9px] text-matn-muted font-normal">' + esc(fmtDate(it.e.at)) + '</span></span>' +
                        '<span class="block text-[10px] text-matn-muted truncate">' + esc(clip(it.e.text, 55)) + '</span>' +
                        '<span class="block text-[9px] font-bold text-matn-emerald mt-0.5">للمزيد اضغط هنا ›</span></button>';
                }).join('') : '<div class="px-2 py-2 text-[11px] text-matn-muted">لا مذكرات عامة بعد.</div>') +
                '<div class="border-t border-matn-sand/60 mt-1 pt-1 space-y-0.5">' +
                    '<a href="archive.html" class="block px-2 py-2 rounded-xl text-[11px] font-bold text-matn-emerald hover:bg-matn-cream transition">🗂 أرشيف مذكراتي (بحث وفلترة)</a>' +
                    '<a href="account.html#diary" class="block px-2 py-2 rounded-xl text-[11px] font-bold text-matn-emerald hover:bg-matn-cream transition">✍️ اكتب مذكرة جديدة</a>' +
                '</div>';
            bindDiaryRows(el);
            el.querySelectorAll('a').forEach(function (a) { a.addEventListener('click', function () { el.classList.add('hidden'); }); });
        });
    }
    /* ================= أرشيف المذكرات: بحث وفلترة ================= */
    var arState = { scope: 'mine', q: '', sort: 'new', vis: 'all', stars: 0, from: '', to: '', user: '' };
    function arRowHtml(r, mine) {
        var e = r.e;
        var rt = diaryAvg(e);
        var ap = (e.comments || []).filter(function (c) { return c.approved && !c.hide; }).length;
        var pend = (e.comments || []).filter(function (c) { return !c.approved; }).length;
        return '<li class="border border-matn-sand rounded-2xl p-3 bg-white space-y-2">' +
            '<div class="flex flex-wrap items-center gap-x-2 gap-y-1 text-[10px] text-matn-muted">' +
                '<strong class="text-[11px] text-matn-emerald">' + esc(r.name) + '</strong>' +
                '<span>🗓 ' + esc(fmtDate(e.at)) + (e.edited ? ' · عُدّلت' : '') + '</span>' +
                (e.public === false ? '<span class="font-bold text-amber-700 bg-amber-50 border border-amber-200 rounded-full px-1.5">خاصة</span>' : '<span class="font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-full px-1.5">عامة</span>') +
                (rt.n ? '<span class="text-amber-600">' + starsHtml(rt.avg) + ' ' + rt.avg.toFixed(1) + '</span>' : '<span>لا تقييم</span>') +
                '<span>💬 ' + num(ap) + (pend ? (isMineRow(r) ? ' · <span class="text-amber-700 font-bold">' + num(pend) + ' بانتظار موافقتك</span>' : '') : '') + '</span>' +
            '</div>' +
            '<p class="text-xs whitespace-pre-line leading-relaxed">' + esc(e.text) + '</p>' +
            '<div class="flex flex-wrap gap-3 pt-1">' +
                '<button type="button" data-diary="' + esc(r.u) + '" data-entry="' + esc(e.id) + '" class="text-matn-emerald text-[11px] font-bold hover:underline">عرض / تقييم / تعليق</button>' +
                (mine ? '<button type="button" data-aredit="' + esc(e.id) + '" class="text-matn-muted text-[11px] font-bold hover:underline">تعديل</button>' +
                        '<button type="button" data-arepub="' + esc(e.id) + '" class="text-matn-muted text-[11px] font-bold hover:underline">' + (e.public === false ? 'اجعلها عامة' : 'اجعلها خاصة') + '</button>' +
                        '<button type="button" data-aredel="' + esc(e.id) + '" class="text-red-700 text-[11px] font-bold hover:underline">حذف</button>' : '') +
                '<button type="button" data-member="' + esc(r.u) + '" class="text-matn-emerald text-[11px] font-bold hover:underline">👤 ملف ' + esc(clip(r.name, 14)) + '</button>' +
            '</div></li>';
    }
    function isMineRow(r) { return r.mine; }
    function archivePick(d) {
        var me = d.authUser;
        var rows = [];
        if (arState.scope === 'mine') {
            if (!me) return [];
            var acc = d.accounts[me] || {};
            diaryEntries(d, me).forEach(function (e) {
                rows.push({ u: me, name: acc.name || me, avatar: acc.avatar || '', e: e, mine: true });
            });
        } else {
            rows = publicDiaries(d).map(function (x) { var y = x; y.mine = (x.u === me); return y; });
            if (arState.user) rows = rows.filter(function (r) { return r.u === arState.user; });
        }
        var q = String(arState.q || '').trim();
        if (q) rows = rows.filter(function (r) {
            return (r.e.text + ' ' + r.name).toLowerCase().indexOf(q.toLowerCase()) !== -1;
        });
        if (arState.scope === 'mine' && arState.vis !== 'all') {
            rows = rows.filter(function (r) { return arState.vis === 'public' ? r.e.public !== false : r.e.public === false; });
        }
        if (arState.stars) rows = rows.filter(function (r) { var a = diaryAvg(r.e); return a.n && a.avg >= arState.stars; });
        if (arState.from) rows = rows.filter(function (r) { return String(r.e.at) >= arState.from; });
        if (arState.to) rows = rows.filter(function (r) { return String(r.e.at) <= arState.to + 'T23:59:59'; });
        var by = {
            new: function (a, b) { return new Date(b.e.at) - new Date(a.e.at); },
            old: function (a, b) { return new Date(a.e.at) - new Date(b.e.at); },
            top: function (a, b) { return diaryAvg(b.e).avg - diaryAvg(a.e).avg; },
            comments: function (a, b) { return (b.e.comments || []).length - (a.e.comments || []).length; }
        };
        return rows.sort(by[arState.sort] || by.new);
    }
    function renderArchive(s) {
        var box = document.getElementById('archiveBox');
        if (!box) return;
        var d = fullDoc();
        var all = archivePick(d);
        var rtc = 0, rtn = 0, cm = 0, pend = 0;
        all.forEach(function (r) { cm += (r.e.comments || []).length; ((r.e.comments || []).filter(function (c) { return !c.approved; }).forEach(function () { pend++; })); var a = diaryAvg(r.e); if (a.n) { rtc += a.n; rtn += a.avg * a.n; } });
        var st = document.getElementById('arStats');
        if (st) {
            var full = archivePick(Object.assign({}, d));
            st.innerHTML = '<strong class="text-matn-emerald">' + num(all.length) + '</strong> نتيجة معروضة' +
                (arState.q || arState.vis !== 'all' || arState.stars || arState.from || arState.to || arState.user ? ' (بعد الفلترة)' : '') +
                ' · متوسط تقييم النتائج: <strong class="text-matn-emerald">' + (rtc ? (rtn / rtc).toFixed(1) : '—') + '</strong>' +
                ' · تعليقات: <strong class="text-matn-emerald">' + num(cm) + '</strong>' +
                (arState.scope === 'mine' && pend ? ' · <span class="text-amber-700 font-bold">' + num(pend) + ' بانتظار موافقتك</span>' : '');
        }
        var cn = document.getElementById('arCount');
        if (cn) cn.textContent = num(all.length) + ' مذكرة';
        if (!all.length) {
            box.innerHTML = '<li class="text-xs text-matn-muted bg-matn-cream rounded-2xl p-4 text-center">لا نتائج مطابقة.' +
                (arState.scope === 'mine' && !s.signedIn ? ' سجّل الدخول لعرض أرشيفك.' : ' جرّب تعديل البحث أو الفلاتر.') + '</li>';
            return;
        }
        box.innerHTML = all.map(function (r) { return arRowHtml(r, r.mine && arState.scope === 'mine'); }).join('');
        bindDiaryRows(box);
        box.querySelectorAll('[data-aredit]').forEach(function (b) { b.addEventListener('click', function () { editDiary(b.getAttribute('data-aredit')); }); });
        box.querySelectorAll('[data-arepub]').forEach(function (b) { b.addEventListener('click', function () { toggleDiaryPublic(b.getAttribute('data-arepub')); }); });
        box.querySelectorAll('[data-aredel]').forEach(function (b) { b.addEventListener('click', function () { deleteDiary(b.getAttribute('data-aredel')); }); });
        box.querySelectorAll('[data-member]').forEach(function (b) { b.addEventListener('click', function () { openMember(b.getAttribute('data-member')); }); });
    }
    function wireArchive() {
        if (!document.getElementById('archiveBox')) return;
        var q = document.getElementById('arSearch');
        var so = document.getElementById('arSort');
        var vi = document.getElementById('arVis');
        var sr = document.getElementById('arStars');
        var fr = document.getElementById('arFrom');
        var to = document.getElementById('arTo');
        var u = new URLSearchParams(window.location.search).get('u');
        if (u) { arState.user = u; arState.scope = 'all'; }
        function read() {
            arState.q = q ? q.value : '';
            arState.sort = so ? so.value : 'new';
            arState.vis = vi ? vi.value : 'all';
            arState.stars = sr ? Number(sr.value) || 0 : 0;
            arState.from = fr ? fr.value : '';
            arState.to = to ? to.value : '';
            var t = document.getElementById('arScopeLabel');
            renderArchive(load());
            if (t) t.textContent = arState.user ? ('مذكرات ' + ((fullDoc().accounts[arState.user] || {}).name || arState.user)) : '';
        }
        [q, so, vi, sr, fr, to].forEach(function (el) { if (el) el.addEventListener('input', read); if (el) el.addEventListener('change', read); });
        var rs = document.getElementById('arReset');
        if (rs) rs.addEventListener('click', function () {
            arState.q = ''; arState.sort = 'new'; arState.vis = 'all'; arState.stars = 0; arState.from = ''; arState.to = ''; arState.user = '';
            if (q) q.value = ''; if (so) so.value = 'new'; if (vi) vi.value = 'all'; if (sr) sr.value = '0'; if (fr) fr.value = ''; if (to) to.value = '';
            arState.scope = 'mine';
            switchArchiveScope('mine');
            read();
        });
        document.querySelectorAll('[data-action="archive-tab"]').forEach(function (b) {
            b.addEventListener('click', function () { switchArchiveScope(b.getAttribute('data-scope')); read(); });
        });
        switchArchiveScope(u ? 'all' : 'mine');
        read();
    }
    function switchArchiveScope(scope) {
        arState.scope = scope;
        document.querySelectorAll('[data-action="archive-tab"]').forEach(function (b) {
            var on = b.getAttribute('data-scope') === scope;
            b.className = 'text-xs font-bold px-4 py-2 rounded-xl transition ' +
                (on ? 'bg-matn-emerald text-white shadow' : 'bg-white border border-matn-sand text-matn-muted hover:border-matn-gold');
        });
        var vw = document.getElementById('arVisWrap');
        if (vw) vw.classList.toggle('hidden', scope !== 'mine');
        if (scope !== 'all') { arState.user = ''; var t = document.getElementById('arScopeLabel'); if (t) t.textContent = ''; }
    }

    /* جدار المذكرات (في الملف الشخصي) */
    function renderDiaryWall(s) {
        var box = document.getElementById('diaryWall');
        if (!box) return;
        var d = fullDoc();
        var list = publicDiaries(d).filter(function (it) { return it.u !== d.authUser; });
        box.innerHTML = list.length
            ? '<div class="space-y-2">' + list.map(function (it) { return diaryRowHtml(it); }).join('') + '</div>'
            : '<p class="text-xs text-matn-muted">لا مذكرات عامة من الأعضاء بعد.</p>';
        bindDiaryRows(box);
    }
    /* مذكراتي (إدارة) */
    function renderMyDiary(s) {
        var box = document.getElementById('myDiaryList');
        var card = document.getElementById('diaryCard');
        if (card) card.classList.toggle('hidden', !s.signedIn);
        if (!box) return;
        if (!s.signedIn) { box.innerHTML = ''; return; }
        var d = fullDoc();
        var mine = diaryEntries(d, d.authUser).slice().sort(function (a, b) { return new Date(b.at) - new Date(a.at); });
        box.innerHTML = mine.length ? mine.map(function (e) {
            var rt = diaryAvg(e);
            var pending = (e.comments || []).filter(function (c) { return !c.approved; });
            var cms = (e.comments || []).filter(function (c) { return c.approved || !c.approved; });
            return '<li class="border border-matn-sand rounded-2xl p-3 space-y-2 bg-white">' +
                '<div class="flex flex-wrap items-center justify-between gap-2 text-[10px] text-matn-muted">' +
                    '<span>🗓 ' + esc(fmtDate(e.at)) + (e.edited ? ' · عُدّلت' : '') + ' · ' +
                        (e.public === false ? '<span class="font-bold text-amber-700">خاصة (لك وحدك)</span>' : '<span class="font-bold text-emerald-700">عامة</span>') + '</span>' +
                    '<span>' + (rt.n ? '<span class="text-amber-600">' + starsHtml(rt.avg) + '</span> ' + rt.avg.toFixed(1) + ' (' + num(rt.n) + ' تقييم)' : 'لا تقييم بعد') + '</span>' +
                '</div>' +
                '<p class="text-xs whitespace-pre-line leading-relaxed">' + esc(e.text) + '</p>' +
                (pending.length ? '<div class="bg-amber-50 border border-amber-200 rounded-xl p-2 space-y-2">' +
                    '<div class="text-[11px] font-bold text-amber-800">⏳ تعليقات بانتظار موافقتك (' + num(pending.length) + ') — لا يراها غيرك حتى توافق:</div>' +
                    pending.map(function (c) {
                        return '<div class="bg-white rounded-lg p-2 text-[11px] space-y-1">' +
                            '<div class="text-matn-muted"><strong class="text-matn-charcoal">' + esc(c.name || c.user) + '</strong> · ' + esc(fmtDate(c.at)) + '</div>' +
                            '<div class="whitespace-pre-line">' + esc(c.text) + '</div>' +
                            '<div class="flex flex-wrap gap-2 pt-1">' +
                                '<button type="button" data-approve="' + esc(c.id) + '" data-owner="' + esc(d.authUser) + '" data-entry="' + esc(e.id) + '" class="bg-matn-emerald text-white px-2.5 py-1 rounded-lg text-[10px] font-bold">✔ إظهار للجميع</button>' +
                                '<button type="button" data-report="' + esc(c.id) + '" data-owner="' + esc(d.authUser) + '" data-entry="' + esc(e.id) + '" class="bg-white border border-red-200 text-red-700 px-2.5 py-1 rounded-lg text-[10px] font-bold">🚩 إبلاغ عن إساءة</button>' +
                                '<button type="button" data-reject="' + esc(c.id) + '" data-owner="' + esc(d.authUser) + '" data-entry="' + esc(e.id) + '" class="text-matn-muted px-2.5 py-1 rounded-lg text-[10px] font-bold hover:underline">حذف التعليق</button>' +
                            '</div></div>';
                    }).join('') + '</div>' : '') +
                (cms.filter(function (c) { return c.approved; }).length ? '<div class="space-y-1">' + cms.filter(function (c) { return c.approved; }).map(function (c) {
                    return '<div class="bg-matn-cream rounded-lg p-2 text-[11px]"><strong class="text-matn-emerald">' + esc(c.name || c.user) + '</strong>' +
                        (c.hide ? ' <span class="text-[9px] text-red-700 font-bold">مخفي بعد إبلاغات</span>' : '') +
                        ' <span class="text-matn-muted">· ' + esc(fmtDate(c.at)) + '</span><div class="whitespace-pre-line mt-0.5">' + esc(c.text) + '</div>' +
                        (c.hide ? '' : '<button type="button" data-report="' + esc(c.id) + '" data-owner="' + esc(d.authUser) + '" data-entry="' + esc(e.id) + '" class="text-red-700 text-[10px] font-bold mt-1 hover:underline">🚩 إبلاغ</button>') +
                        '</div>';
                }).join('') + '</div>' : '') +
                '<div class="flex flex-wrap gap-2 pt-1">' +
                    '<button type="button" data-diaryopen="' + esc(e.id) + '" class="text-matn-emerald text-[11px] font-bold hover:underline">عرض / تقييم</button>' +
                    '<button type="button" data-diaryedit="' + esc(e.id) + '" class="text-matn-muted text-[11px] font-bold hover:underline">تعديل</button>' +
                    '<button type="button" data-diarypub="' + esc(e.id) + '" class="text-matn-muted text-[11px] font-bold hover:underline">' + (e.public === false ? 'اجعلها عامة' : 'اجعلها خاصة') + '</button>' +
                    '<button type="button" data-diarydel="' + esc(e.id) + '" class="text-red-700 text-[11px] font-bold hover:underline">حذف</button>' +
                '</div></li>';
        }).join('') : '<li class="text-xs text-matn-muted">لا مذكرات بعد — اكتب أول مذكرة أعلاه. ✍️</li>';
        box.querySelectorAll('[data-diaryopen]').forEach(function (b) {
            b.addEventListener('click', function () { openDiary(fullDoc().authUser, b.getAttribute('data-diaryopen')); });
        });
        box.querySelectorAll('[data-diaryedit]').forEach(function (b) {
            b.addEventListener('click', function () { editDiary(b.getAttribute('data-diaryedit')); });
        });
        box.querySelectorAll('[data-diarypub]').forEach(function (b) {
            b.addEventListener('click', function () { toggleDiaryPublic(b.getAttribute('data-diarypub')); });
        });
        box.querySelectorAll('[data-diarydel]').forEach(function (b) {
            b.addEventListener('click', function () { deleteDiary(b.getAttribute('data-diarydel')); });
        });
        box.querySelectorAll('[data-approve]').forEach(function (b) {
            b.addEventListener('click', function () { approveComment(b.getAttribute('data-owner'), b.getAttribute('data-entry'), b.getAttribute('data-approve')); });
        });
        box.querySelectorAll('[data-reject]').forEach(function (b) {
            b.addEventListener('click', function () { rejectComment(b.getAttribute('data-owner'), b.getAttribute('data-entry'), b.getAttribute('data-reject')); });
        });
        box.querySelectorAll('[data-report]').forEach(function (b) {
            b.addEventListener('click', function () { reportComment(b.getAttribute('data-owner'), b.getAttribute('data-entry'), b.getAttribute('data-report')); });
        });
    }
    /* تبويبا: مذكراتي / مذكرات الأعضاء */
    function switchDiaryTab(tab) {
        document.querySelectorAll('[data-action="diary-tab"]').forEach(function (b) {
            var on = b.getAttribute('data-tab') === tab;
            b.className = 'text-xs font-bold px-4 py-2 rounded-xl transition ' +
                (on ? 'bg-matn-emerald text-white shadow' : 'bg-white border border-matn-sand text-matn-muted hover:border-matn-gold');
        });
        var mine = document.getElementById('diaryMinePane');
        var wall = document.getElementById('diaryWallPane');
        if (mine) mine.classList.toggle('hidden', tab !== 'mine');
        if (wall) wall.classList.toggle('hidden', tab !== 'wall');
    }

    function findEntry(d, u, eid) {
        var l = diaryEntries(d, u);
        for (var i = 0; i < l.length; i++) { if (l[i].id === eid) return l[i]; }
        return null;
    }
    function bindDiaryRows(root) {
        (root || document).querySelectorAll('[data-diary]').forEach(function (b) {
            b.addEventListener('click', function () { openDiary(b.getAttribute('data-diary'), b.getAttribute('data-entry')); });
        });
    }
    /* نافذة المذكرة: النص كاملاً + النجوم + التعليقات */
    function openDiary(u, eid) {
        var s = load();
        var d = fullDoc();
        var acc = d.accounts[u];
        if (!acc) return;
        var e = findEntry(d, u, eid);
        if (!e) return;
        var me = d.authUser;
        var isOwner = me === u;
        var isMod = !!(s.user.super || s.user.isAdmin);
        if (e.public === false && !isOwner && !isMod) { toast('هذه المذكرة خاصة.', 'error'); return; }
        var rt = diaryAvg(e);
        var comments = visibleComments(e, me, isOwner, isMod);
        var pub = comments.filter(function (c) { return c.approved || c.user === me || isOwner; });
        var av = safeImg(acc.avatar);
        var rated = me && e.ratings ? e.ratings[me] : null;

        var body =
            '<div class="flex items-center gap-2 pb-3 border-b border-matn-sand/60">' +
                (av ? '<img src="' + esc(av) + '" class="w-10 h-10 rounded-full object-cover" alt="">'
                    : '<span class="w-10 h-10 rounded-full bg-matn-creamDark flex items-center justify-center font-bold text-matn-emerald">' + esc(String(acc.name || u).charAt(0)) + '</span>') +
                '<div class="min-w-0"><button type="button" data-member="' + esc(u) + '" class="font-bold text-sm text-matn-emerald hover:underline">' + esc(acc.name || u) + ' ›</button>' +
                '<div class="text-[10px] text-matn-muted">🗓 ' + esc(fmtDate(e.at)) + (e.edited ? ' · عُدّلت' : '') +
                (e.public === false ? ' · <span class="font-bold text-amber-700">خاصة</span>' : '') + '</div></div>' +
            '</div>' +
            '<p class="text-sm whitespace-pre-line leading-relaxed max-h-56 overflow-auto bg-matn-cream rounded-2xl p-3 border border-matn-sand">' + esc(e.text) + '</p>' +
            /* النجوم */
            '<div class="flex flex-wrap items-center gap-2 bg-white border border-matn-sand rounded-2xl px-3 py-2">' +
                '<span class="text-[11px] font-bold text-matn-emerald">التقييم:</span>' +
                '<span class="text-sm text-amber-500" id="dmStars">' + starsHtml(rt.avg) + '</span>' +
                '<span class="text-[11px] text-matn-muted">' + (rt.n ? (rt.avg.toFixed(1) + ' من 5 · ' + num(rt.n) + ' مقيّم') : 'لا تقييم بعد') + '</span>' +
                (isOwner ? '' : (me
                    ? '<span class="flex items-center gap-1 mr-auto">' + [1, 2, 3, 4, 5].map(function (i) {
                        return '<button type="button" data-rate="' + i + '" class="text-lg leading-none ' + (rated && i <= rated ? 'text-amber-500' : 'text-matn-sand hover:text-amber-400') + '">★</button>';
                      }).join('') + '</span>'
                    : '<span class="text-[10px] text-matn-muted mr-auto">سجّل الدخول لتقييمها</span>')) +
            '</div>' +
            /* التعليقات */
            '<div class="space-y-2">' +
                '<div class="text-[11px] font-bold text-matn-emerald">💬 التعليقات' + (isOwner && (e.comments || []).some(function (c) { return !c.approved; }) ? ' — <span class="text-amber-700">لديك تعليقات بانتظار موافقتك</span>' : '') + '</div>' +
                (pub.length ? pub.map(function (c) {
                    var mineC = c.user === me;
                    return '<div class="rounded-xl p-2.5 text-[11px] ' + (c.approved ? 'bg-matn-cream border border-matn-sand' : 'bg-amber-50 border border-amber-200') + '">' +
                        '<div class="flex flex-wrap items-center gap-2"><strong class="text-matn-emerald">' + esc(c.name || c.user) + '</strong>' +
                        '<span class="text-[9px] text-matn-muted">' + esc(fmtDate(c.at)) + '</span>' +
                        (!c.approved ? '<span class="text-[9px] font-bold text-amber-800 bg-white border border-amber-200 rounded-full px-1.5">بانتظار موافقة صاحبة المذكرة</span>' : '') +
                        (c.hide ? '<span class="text-[9px] font-bold text-red-700 bg-red-50 border border-red-200 rounded-full px-1.5">مخفي بعد إبلاغات</span>' : '') + '</div>' +
                        '<div class="whitespace-pre-line mt-1 leading-relaxed">' + esc(c.text) + '</div>' +
                        '<div class="flex flex-wrap gap-2 mt-1">' +
                            (isOwner && !c.approved ? '<button type="button" data-approve="' + esc(c.id) + '" class="bg-matn-emerald text-white px-2.5 py-1 rounded-lg text-[10px] font-bold">✔ إظهار للجميع</button>' +
                                '<button type="button" data-reject="' + esc(c.id) + '" class="text-matn-muted text-[10px] font-bold hover:underline">حذف</button>' : '') +
                            (mineC ? '' : '<button type="button" data-report="' + esc(c.id) + '" class="text-red-700 text-[10px] font-bold hover:underline">🚩 إبلاغ</button>') +
                        '</div></div>';
                  }).join('') : '<p class="text-[11px] text-matn-muted">لا تعليقات ظاهرة بعد.</p>') +
                ((me && !isOwner)
                    ? '<label class="matn-field"><span>اكتب تعليقاً (لا يظهر حتى توافق عليه صاحبة المذكرة)</span><textarea class="matn-input" id="dmText" rows="2" maxlength="600" placeholder="تعليقك…"></textarea></label>' +
                      '<button type="button" id="dmSend" class="w-full bg-matn-emerald hover:bg-matn-emeraldLight text-white py-2.5 rounded-xl text-xs font-bold transition">أرسل التعليق</button>'
                    : (me ? '' : '<p class="text-[10px] text-matn-muted">سجّل الدخول للتعليق.</p>')) +
            '</div>';

        modal({
            title: isOwner ? 'مذكرتي' : ('مذكرة ' + (acc.name || u)),
            body: body,
            footer: okBtn('إغلاق'),
            ready: function (w) {
                w.querySelectorAll('[data-rate]').forEach(function (b) {
                    b.addEventListener('click', function () { rateDiary(u, eid, Number(b.getAttribute('data-rate'))); });
                });
                var send = w.querySelector('#dmSend');
                if (send) send.addEventListener('click', function () {
                    if (commentDiary(u, eid, w.querySelector('#dmText').value)) closeModal();
                });
                w.querySelectorAll('[data-approve]').forEach(function (b) {
                    b.addEventListener('click', function () { approveComment(u, eid, b.getAttribute('data-approve')); });
                });
                w.querySelectorAll('[data-reject]').forEach(function (b) {
                    b.addEventListener('click', function () { rejectComment(u, eid, b.getAttribute('data-reject')); });
                });
                w.querySelectorAll('[data-report]').forEach(function (b) {
                    b.addEventListener('click', function () { reportComment(u, eid, b.getAttribute('data-report')); });
                });
                w.querySelectorAll('[data-member]').forEach(function (b) {
                    b.addEventListener('click', function () { closeModal(); openMember(b.getAttribute('data-member')); });
                });
            }
        });
    }
    /* إضافة / تعديل / حذف */
    function addDiary(text, isPublic) {
        if (needsLogin()) { requireLogin('المذكرات'); return false; }
        var t = String(text || '').trim();
        if (t.length < 10) { toast('اكتب مذكرة أطول قليلاً (10 أحرف على الأقل).', 'error'); return false; }
        if (t.length > DIARY_MAX) { toast('المذكرة تتجاوز ' + num(DIARY_MAX) + ' حرف.', 'error'); return false; }
        if (!guardText(t, 'عدّل مذكرتك')) return false;
        var d = fullDoc();
        var acc = d.accounts[d.authUser];
        if (!acc.diary) acc.diary = [];
        acc.diary.unshift({ id: 'dy-' + rnd(6), text: t, at: new Date().toISOString(), public: isPublic !== false, ratings: {}, comments: [] });
        if (isPublic !== false) {
            acc.points = (acc.points || 0) + 10;
            acc.ledger = acc.ledger || [];
            acc.ledger.unshift({ reason: 'نشر مذكرة في الأجندة', points: 10, at: new Date().toISOString() });
        }
        saveDoc(d); state = null; refresh();
        toast('أُضيفت مذكرتك' + (isPublic !== false ? ' (+10 نقاط)' : ' (خاصة)'), 'ok');
        return true;
    }
    function editDiary(eid) {
        var d = fullDoc();
        var e = findEntry(d, d.authUser, eid);
        if (!e) return;
        modal({
            title: 'تعديل المذكرة',
            body: '<label class="matn-field"><span>نص المذكرة</span><textarea class="matn-input" id="edText" rows="8" maxlength="' + DIARY_MAX + '">' + esc(e.text) + '</textarea></label><p class="text-[10px] text-matn-muted" id="edCount"></p>',
            footer: '<button type="button" id="edGo" class="bg-matn-emerald hover:bg-matn-emeraldLight text-white px-4 py-2.5 rounded-xl text-xs font-bold transition">حفظ التعديل</button>' + okBtn('إلغاء'),
            ready: function (w) {
                var ta = w.querySelector('#edText'), cnt = w.querySelector('#edCount');
                function upd() { cnt.textContent = ta.value.length + ' / ' + DIARY_MAX + ' حرف'; cnt.className = 'text-[10px] ' + (ta.value.length >= DIARY_MAX ? 'text-red-700 font-bold' : 'text-matn-muted'); }
                ta.addEventListener('input', upd); upd();
                w.querySelector('#edGo').addEventListener('click', function () {
                    var t = ta.value.trim();
                    if (!t.length || t.length > DIARY_MAX) { toast('النص غير صالح.', 'error'); return; }
                    var d2 = fullDoc();
                    var e2 = findEntry(d2, d2.authUser, eid);
                    if (!e2) return;
                    e2.text = t; e2.edited = true; e2.at = e2.at;
                    saveDoc(d2); state = null; closeModal(); refresh();
                    toast('حُفظ التعديل', 'ok');
                });
            }
        });
    }
    function deleteDiary(eid) {
        confirmBox('حذف المذكرة', 'ستُحذف المذكرة وتقييماتها وتعليقاتها نهائياً.', function () {
            var d = fullDoc();
            var acc = d.accounts[d.authUser];
            acc.diary = (acc.diary || []).filter(function (e) { return e.id !== eid; });
            saveDoc(d); state = null; refresh();
            toast('حُذفت المذكرة', 'ok');
        }, 'حذف');
    }
    function toggleDiaryPublic(eid) {
        var d = fullDoc();
        var e = findEntry(d, d.authUser, eid);
        if (!e) return;
        e.public = (e.public === false);
        saveDoc(d); state = null; refresh();
        toast(e.public ? 'المذكرة صارت عامة' : 'المذكرة صارت خاصة (لك وحدك)', 'ok');
    }
    /* تفاعل الآخرين */
    function rateDiary(u, eid, stars) {
        var d = fullDoc();
        if (!d.authUser) { requireLogin('التقييم'); return; }
        if (d.authUser === u) { toast('لا يمكنك تقييم مذكرتك.', 'error'); return; }
        var e = findEntry(d, u, eid);
        if (!e) return;
        e.ratings = e.ratings || {};
        e.ratings[d.authUser] = stars;
        saveDoc(d); state = null;
        var own = d.accounts[u];
        if (own) { own.points = (own.points || 0) + 2; }   /* نقطتان لصاحبة المذكرة */
        saveDoc(d);
        refresh(); closeModal(); window.setTimeout(function () { openDiary(u, eid); }, 150);
        toast('شكراً لتقييمك (' + stars + ' ★)', 'ok');
    }
    function commentDiary(u, eid, text) {
        var d = fullDoc();
        if (!d.authUser) { requireLogin('التعليق'); return false; }
        var t = String(text || '').trim();
        if (!t.length) { toast('اكتب نص التعليق.', 'error'); return false; }
        if (t.length > 600) { toast('التعليق طويل — الحد 600 حرف.', 'error'); return false; }
        if (!guardText(t, 'عدّل تعليقك')) return false;
        var e = findEntry(d, u, eid);
        if (!e) return false;
        if (!Array.isArray(e.comments)) e.comments = [];
        e.comments.push({
            id: 'dc-' + rnd(6), user: d.authUser, name: (d.accounts[d.authUser] || {}).name || d.authUser,
            text: t, at: new Date().toISOString(), approved: false, reported: 0, hide: false
        });
        saveDoc(d);
        pushNotice([u], '💬 تعليق جديد على مذكرتك بانتظار موافقتك — من ' + ((d.accounts[d.authUser] || {}).name || d.authUser), 'comment', d.authUser);
        state = null; refresh();
        toast('أُرسل التعليق — سيظهر بعد موافقة صاحبة المذكرة', 'ok');
        return true;
    }
    function approveComment(u, eid, cid) {
        var d = fullDoc();
        if (d.authUser !== u) { toast('الموافقة لصاحبة المذكرة فقط.', 'error'); return; }
        var e = findEntry(d, u, eid);
        if (!e) return;
        var c = (e.comments || []).filter(function (x) { return x.id === cid; })[0];
        if (!c) return;
        c.approved = true;
        saveDoc(d);
        pushNotice([c.user], '✅ نُشر تعليقك على مذكرة ' + ((d.accounts[u] || {}).name || u), 'ok', u);
        state = null; refresh();
        toast('ظهر التعليق للجميع', 'ok');
    }
    function rejectComment(u, eid, cid) {
        var d = fullDoc();
        if (d.authUser !== u) return;
        var e = findEntry(d, u, eid);
        if (!e) return;
        e.comments = (e.comments || []).filter(function (x) { return x.id !== cid; });
        saveDoc(d); state = null; refresh();
        toast('حُذف التعليق', 'ok');
    }
    function reportComment(u, eid, cid) {
        var d = fullDoc();
        if (!d.authUser) { requireLogin('الإبلاغ'); return; }
        var e = findEntry(d, u, eid);
        if (!e) return;
        var c = (e.comments || []).filter(function (x) { return x.id === cid; })[0];
        if (!c) return;
        c.reported = (c.reported || 0) + 1;
        var hidden = c.reported >= 3;
        if (hidden) c.hide = true;
        var ownerName = (d.accounts[u] || {}).name || u;
        var reporter = (d.accounts[d.authUser] || {}).name || d.authUser;
        var txt = '🚩 إبلاغ عن تعليق مسيء' +
            '\nالمذكرة: «' + clip(e.text, 45) + '» لـ ' + ownerName +
            '\nالتعليق: «' + clip(c.text, 140) + '»' +
            '\nبقلم: ' + (c.name || c.user) +
            '\nالمُبلِّغ: ' + reporter +
            '\nعدد الإبلاغات: ' + num(c.reported) + (hidden ? ' — أُخفي تلقائياً عن الجميع (يبقى للمشرف العام)' : '');
        var targets = adminsOf(d, d.authUser);
        if (!Array.isArray(d.notices)) d.notices = [];
        if (!Array.isArray(d.messages)) d.messages = [];
        var at = new Date().toISOString();
        targets.forEach(function (t) {
            d.notices.unshift({ id: 'nt-' + rnd(6), to: t, text: txt, kind: 'report', from: d.authUser, at: at, read: false });
            d.messages.unshift({ id: 'ms-' + rnd(6), from: d.authUser, to: t, text: txt, at: at, read: false, system: true });
        });
        saveDoc(d);
        state = null; load(); render();
        toast(hidden ? 'أُخفي التعليق وأُبلغ المشرف العام والمديرون' : 'أُرسل الإبلاغ إلى المشرف العام والمديرين', 'ok');
    }

    /* ======================================================================
       التنبيهات (جرس الإشعارات)
       ====================================================================== */
    function pushNotice(tos, text, kind, from) {
        var d = fullDoc();
        if (!Array.isArray(d.notices)) d.notices = [];
        var at = new Date().toISOString();
        (tos || []).forEach(function (t) {
            d.notices.unshift({ id: 'nt-' + rnd(6), to: t, text: text, kind: kind || 'info', from: from || '', at: at, read: false });
        });
        saveDoc(d);
    }
    function adminsOf(d, exclude) {
        return Object.keys(d.accounts || {}).filter(function (u) {
            var a = d.accounts[u];
            return a && !a.system && !a.suspended && (a.super || a.isAdmin) && u !== exclude;
        });
    }
    function sysMessage(from, to, text) {
        var d = fullDoc();
        if (!Array.isArray(d.messages)) d.messages = [];
        d.messages.unshift({ id: 'ms-' + rnd(6), from: from, to: to, text: text, at: new Date().toISOString(), read: false, system: true });
        saveDoc(d);
    }
    function renderBell(s) {
        var btn = document.getElementById('bellBtn');
        if (!btn) return;
        var count = (s.notices || []).filter(function (n) { return !n.read; }).length;
        var hidden = !s.signedIn;
        btn.classList.toggle('hidden', hidden);
        var c = document.getElementById('bellCount');
        if (c) {
            c.textContent = count > 9 ? '٩+' : num(count);
            c.classList.toggle('hidden', !count);
        }
        var menu = document.getElementById('bellMenu');
        if (menu && !menu.classList.contains('hidden')) renderBellList(s);
    }
    function renderBellList(s) {
        var menu = document.getElementById('bellMenu');
        if (!menu) return;
        var list = (s.notices || []).slice(0, 15);
        menu.innerHTML = '<div class="flex items-center justify-between gap-2 mb-2">' +
                '<strong class="text-xs text-matn-emerald">🔔 التنبيهات</strong>' +
                (list.length ? '<button type="button" data-action="bell-read" class="text-[10px] text-matn-muted font-bold hover:underline">تعليم الكل كمقروء</button>' : '') +
            '</div>' +
            (list.length ? '<ul class="space-y-2 max-h-72 overflow-auto">' + list.map(function (n) {
                return '<li class="text-[11px] border-b border-matn-sand/60 pb-2 ' + (n.read ? 'opacity-70' : '') + '">' +
                    '<div class="whitespace-pre-line leading-relaxed">' + esc(n.text) + '</div>' +
                    '<div class="text-[9px] text-matn-muted mt-0.5">' + esc(fmtDate(n.at)) + (n.read ? '' : ' · جديد') + '</div></li>';
            }).join('') + '</ul>' : '<p class="text-[11px] text-matn-muted">لا تنبيهات.</p>');
    }
    function openBell() {
        var menu = document.getElementById('bellMenu');
        if (!menu) return;
        var willShow = menu.classList.contains('hidden');
        menu.classList.toggle('hidden', !willShow);
        if (willShow) {
            var s = load();
            renderBellList(s);
            /* تعليم الكل كمقروء بعد فتح القائمة */
            var d = fullDoc();
            var changed = false;
            (d.notices || []).forEach(function (n) {
                if (n.to === d.authUser && !n.read) { n.read = true; changed = true; }
            });
            if (changed) {
                saveDoc(d); state = null;
                var c = document.getElementById('bellCount');
                if (c) { c.textContent = ''; c.classList.add('hidden'); }
            }
        }
    }
    function markAllNoticesRead() {
        var d = fullDoc();
        var changed = false;
        (d.notices || []).forEach(function (n) { if (n.to === d.authUser && !n.read) { n.read = true; changed = true; } });
        if (changed) { saveDoc(d); state = null; refresh(); }
        toast('عُلّمت التنبيهات كمقروءة', 'ok');
    }

    /* ======================================================================
       التواجد والتميّز (وسام التميز)
       ====================================================================== */
    function hoursText(min) {
        min = min || 0;
        var h = Math.floor(min / 60), m = min % 60;
        if (h && m) return h + ' ساعة و' + m + ' دقيقة';
        if (h === 1) return 'ساعة';
        if (h === 2) return 'ساعتان';
        if (h > 2) return h + ' ساعات';
        return m + ' دقيقة';
    }
    function memberStats(u, d) {
        var a = (d.accounts || {})[u] || {};
        var replies = (d.posts || []).filter(function (p) { return p.user === u; }).length;
        var points = a.points || 0, minutes = a.minutes || 0;
        var diaries = (a.diary || []).filter(function (e) { return e.public !== false; }).length;
        var received = 0;
        (a.diary || []).forEach(function (e) { received += (e.comments || []).filter(function (c) { return c.approved; }).length; });
        return {
            u: u, name: a.name || u, avatar: a.avatar || '', points: points,
            replies: replies, minutes: minutes, diaries: diaries, received: received,
            score: points + replies * 15 + Math.floor(minutes / 5) + diaries * 8
        };
    }
    /* عدد التعليقات التي كتبها العضو في مذكرات الآخرين */
    function commentsBy(u, d) {
        var n = 0;
        Object.keys(d.accounts || {}).forEach(function (k) {
            ((d.accounts[k].diary) || []).forEach(function (e) {
                (e.comments || []).forEach(function (c) { if (c.user === u) n++; });
            });
        });
        return n;
    }
    function diaryCount(u, d) {
        var a = (d.accounts || {})[u] || {};
        var all = (a.diary || []).length;
        var pub = (a.diary || []).filter(function (e) { return e.public !== false; }).length;
        return { all: all, pub: pub, priv: all - pub };
    }
    /* ملف العضو */
    function openMember(u) {
        var d = fullDoc();
        var a = d.accounts[u];
        if (!a) return;
        var me = d.authUser;
        var s = load();
        var st = memberStats(u, d);
        var dc = diaryCount(u, d);
        var cms = commentsBy(u, d);
        var av = safeImg(a.avatar);
        var ratings = 0, rsum = 0;
        (a.diary || []).forEach(function (e) {
            var k = Object.keys(e.ratings || {}); ratings += k.length;
            k.forEach(function (x) { rsum += Number(e.ratings[x]) || 0; });
        });
        var avg = ratings ? (rsum / ratings).toFixed(1) : '—';
        var can = s.canMessage || me === u;
        var isMe = me === u;
        var need = Math.max(0, 500 - ((d.accounts[me] || {}).points || 0));
        var body =
            '<div class="text-center">' +
                (av ? '<img src="' + esc(av) + '" class="w-20 h-20 rounded-full object-cover mx-auto border-2 border-matn-gold" data-zoom="' + esc(av) + '" alt="">'
                    : '<div class="w-20 h-20 rounded-full mx-auto border-2 border-matn-gold bg-matn-creamDark flex items-center justify-center font-amiri text-3xl font-bold text-matn-emerald">' + esc(String(a.name || u).charAt(0)) + '</div>') +
                '<div class="font-bold text-matn-emerald mt-2">' + esc(a.name || u) + '</div>' +
                '<div class="text-[11px] text-matn-muted">@' + esc(u) + ' · ' +
                    (a.system ? 'حساب نظامي' : a.super ? 'المشرف العام' : (a.isAdmin ? 'مشرف' : 'عضو')) +
                    (a.suspended ? ' · <span class="text-red-700 font-bold">موقوف</span>' : '') + '</div>' +
            '</div>' +
            '<div class="grid grid-cols-2 gap-2 text-center text-[11px]">' +
                '<div class="bg-matn-cream rounded-xl p-2 border border-matn-sand"><div class="text-matn-muted">نقاط الولاء</div><div class="font-bold text-matn-emerald">' + num(st.points) + '</div></div>' +
                '<div class="bg-matn-cream rounded-xl p-2 border border-matn-sand"><div class="text-matn-muted">ساعات التواجد</div><div class="font-bold text-matn-emerald">' + esc(hoursText(st.minutes)) + '</div></div>' +
                '<div class="bg-matn-cream rounded-xl p-2 border border-matn-sand"><div class="text-matn-muted">تفاعل النقاش</div><div class="font-bold text-matn-emerald">' + num(st.replies) + '</div></div>' +
                '<div class="bg-matn-cream rounded-xl p-2 border border-matn-sand"><div class="text-matn-muted">📔 المذكرات</div><div class="font-bold text-matn-emerald">' + num(dc.all) + ' ' + diaryWord(dc.all) + (isMe ? (' <span class="text-[9px] text-matn-muted">(' + num(dc.pub) + ' عامة · ' + num(dc.priv) + ' خاصة)</span>') : '') + '</div></div>' +
                '<div class="bg-matn-cream rounded-xl p-2 border border-matn-sand"><div class="text-matn-muted">💬 تعليقاته</div><div class="font-bold text-matn-emerald">' + num(cms) + '</div></div>' +
                '<div class="bg-matn-cream rounded-xl p-2 border border-matn-sand"><div class="text-matn-muted">⭐ متوسط تقييم مذكراته</div><div class="font-bold text-matn-emerald">' + esc(String(avg)) + (ratings ? ' <span class="text-[9px] text-matn-muted">(' + num(ratings) + ' تقييم)</span>' : '') + '</div></div>' +
            '</div>' +
            (isMe ? '<p class="text-[11px] text-matn-muted text-center">هذا ملفك الشخصي.</p>'
                  : (can
                     ? '<button type="button" id="mbMsg" class="w-full bg-matn-emerald hover:bg-matn-emeraldLight text-white py-3 rounded-xl text-xs font-bold shadow transition">📨 مراسلته برسالة خاصة</button>'
                     : '<p class="text-[11px] bg-amber-50 border border-amber-200 rounded-xl px-3 py-2 text-center">🔒 الرسائل الخاصة تُفتح بعد <strong>500 نقطة ولاء</strong> — تحتاج <strong>' + num(need) + '</strong> نقطة (رصيدك ' + num((d.accounts[me] || {}).points || 0) + ').</p>')) +
            (dc.pub ? '<button type="button" id="mbDiary" class="w-full bg-white border border-matn-sand hover:border-matn-gold py-3 rounded-xl text-xs font-bold transition">📔 عرض مذكراته (' + num(dc.pub) + ')</button>' : '');
        modal({
            title: 'ملف العضو',
            body: body,
            footer: okBtn('إغلاق'),
            ready: function (w) {
                var b = w.querySelector('#mbMsg');
                if (b) b.addEventListener('click', function () { closeModal(); newMessageForm(false, u); });
                var bd = w.querySelector('#mbDiary');
                if (bd) bd.addEventListener('click', function () { window.location.href = 'archive.html?u=' + encodeURIComponent(u); });
            }
        });
    }
    function topMembers(d, n) {
        return Object.keys(d.accounts || {})
            .filter(function (u) { return !d.accounts[u].system && !d.accounts[u].suspended; })
            .map(function (u) { return memberStats(u, d); })
            .sort(function (x, y) { return y.score - x.score || y.points - x.points; })
            .slice(0, n || 6);
    }
    /* عدّاد التواجد: دقيقة لكل دقيقة والصفحة ظاهرة */
    var presenceTimer = null;
    function startPresence() {
        if (presenceTimer) return;
        presenceTimer = window.setInterval(function () {
            if (document.hidden) return;
            var d = fullDoc();
            var u = d.authUser;
            if (!u || !d.accounts[u] || d.accounts[u].system) return;
            d.accounts[u].minutes = (d.accounts[u].minutes || 0) + 1;
            saveDoc(d);
        }, 60000);
    }
    function renderExcellence(s) {
        var box = document.getElementById('excellenceBox');
        if (!box) return;
        var d = fullDoc();
        var list = topMembers(d, 6);
        box.classList.remove('hidden');
        var medals = ['🥇', '🥈', '🥉', '🏅', '🏅', '🏅'];
        var slots = list.slice();
        while (slots.length < 6) slots.push(null);
        box.innerHTML =
            '<div class="text-center mb-5">' +
                '<div class="text-[10px] sm:text-[11px] font-bold tracking-[.3em] text-matn-gold">نادي مَتن</div>' +
                '<h2 class="font-amiri text-2xl sm:text-3xl font-bold text-matn-emerald mt-1.5">🏵 وسام التميّز</h2>' +
                '<p class="text-[11px] sm:text-xs text-matn-muted mt-1.5">أكثر الأعضاء تفاعلاً — بالنقاط والتفاعل وساعات التواجد</p>' +
            '</div>' +
            /* ٣ في الصف دائماً (حتى الجوال) ثم ٣ أسفلها */
            '<div class="grid grid-cols-3 gap-2 sm:gap-4">' + slots.map(function (m, i) {
                if (!m) return '<div data-card="empty" class="rounded-2xl sm:rounded-3xl border-2 border-dashed border-matn-sand bg-white/50 p-2 sm:p-4 flex flex-col items-center justify-center min-h-[9rem] sm:min-h-[11rem] text-center">' +
                    '<div class="text-lg sm:text-2xl opacity-35">' + medals[i] + '</div>' +
                    '<div class="text-[9px] sm:text-[11px] text-matn-muted mt-2 leading-relaxed">مقعد متاح<br><span class="hidden sm:inline">تفاعل بالنقاط والتفاعل لتصل هنا</span></div></div>';
                var av = safeImg(m.avatar);
                return '<button type="button" data-card="member" data-member="' + esc(m.u) + '" title="ملف العضو" class="text-center relative rounded-2xl sm:rounded-3xl p-[2px] bg-gradient-to-br from-matn-gold via-matn-goldLight to-matn-emeraldDark shadow-sm hover:scale-[1.02] transition">' +
                    '<div class="bg-white rounded-[14px] sm:rounded-[22px] p-2 sm:p-4 text-center h-full flex flex-col items-center">' +
                        '<div class="text-base sm:text-2xl leading-none">' + medals[i] + '</div>' +
                        (av
                            ? '<img src="' + esc(av) + '" alt="' + esc(m.name) + '" class="w-11 h-11 sm:w-16 sm:h-16 rounded-full object-cover mt-1.5 sm:mt-2 border-2 border-matn-gold" data-zoom="' + esc(av) + '">'
                            : '<div class="w-11 h-11 sm:w-16 sm:h-16 rounded-full mt-1.5 sm:mt-2 border-2 border-matn-gold bg-matn-creamDark flex items-center justify-center font-amiri text-base sm:text-2xl font-bold text-matn-emerald">' + esc(String(m.name || '؟').charAt(0)) + '</div>') +
                        '<div class="font-bold text-[10px] sm:text-sm mt-1.5 sm:mt-2 text-matn-emerald leading-tight">' + esc(m.name) + '</div>' +
                        /* البيانات أسفل بعضها */
                        '<div class="w-full mt-1.5 sm:mt-3 space-y-1">' +
                            '<div class="bg-matn-cream rounded-lg py-1 px-1 text-[9px] sm:text-[11px] leading-tight"><span class="font-bold text-matn-emerald">' + num(m.points) + '</span> <span class="text-matn-muted">نقطة</span></div>' +
                            '<div class="bg-matn-cream rounded-lg py-1 px-1 text-[9px] sm:text-[11px] leading-tight"><span class="font-bold text-matn-emerald">' + num(m.replies) + '</span> <span class="text-matn-muted">تفاعل</span></div>' +
                            '<div class="bg-matn-cream rounded-lg py-1 px-1 text-[9px] sm:text-[11px] leading-tight"><span class="font-bold text-matn-emerald">' + esc(hoursText(m.minutes)) + '</span> <span class="text-matn-muted">تواجد</span></div>' +
                            '<div class="bg-matn-cream rounded-lg py-1 px-1 text-[9px] sm:text-[11px] leading-tight"><span class="font-bold text-matn-emerald">' + num(m.diaries || 0) + '</span> <span class="text-matn-muted">' + diaryWord(m.diaries || 0) + '</span></div>' +
                        '</div>' +
                    '</div></button>';
            }).join('') + '</div>' +
            (list.length ? '' : '<p class="text-center mt-5"><a href="account.html" class="inline-block bg-matn-emerald hover:bg-matn-emeraldLight text-white text-[11px] sm:text-xs font-bold px-5 py-3 rounded-xl shadow transition">أنشئ حسابك وكن أول المتميّزين</a></p>');
        box.querySelectorAll('[data-member]').forEach(function (b) {
            b.addEventListener('click', function () { openMember(b.getAttribute('data-member')); });
        });
    }
    /* روابط الفروع في أسفل الصفحة */
    function renderFooterBranches(s) {
        var boxes = document.querySelectorAll('[data-footer-branches]');
        if (!boxes.length) return;
        var list = s.branches || [];
        boxes.forEach(function (el) {
            el.innerHTML = list.length ? list.map(function (b) {
                var lk = safeUrl(b.link);
                return '<div><a href="' + esc(lk || '#') + '"' + (lk ? ' target="_blank" rel="noopener"' : '') + ' class="hover:text-white transition">📍 ' +
                    esc(b.name || b.city) + ' <span class="text-white/50">( ' + esc(b.city) + ' · ' + brModeLabel(b.mode) + ' )</span></a></div>';
            }).join('') : '<div class="text-white/50">لا توجد فروع بعد.</div>';
        });
    }

    /* ======================================================================
       الرسائل الخاصة
       ====================================================================== */
    function msgPartner(m, me) { return m.from === me ? m.to : m.from; }
    function myMessages(s) {
        var me = s.user.username;
        return (s.messages || []).filter(function (m) { return m.from === me || m.to === me; });
    }
    function sendMessage(to, text, asUser) {
        var d = fullDoc();
        var from = asUser || d.authUser;
        if (!from) { requireLogin('الرسائل'); return false; }
        if (!to || !d.accounts[to]) { toast('اختر عضواً صحيحاً.', 'error'); return false; }
        if (!String(text || '').trim()) { toast('اكتب نص الرسالة.', 'error'); return false; }
        if (!guardText(text, 'عدّل رسالتك')) return false;
        var acc = d.accounts[from] || {};
        if (!acc.super && !acc.isAdmin && (acc.points || 0) < 500) {
            toast('الرسائل الخاصة تُفتح بعد 500 نقطة.', 'error'); return false;
        }
        if (!Array.isArray(d.messages)) d.messages = [];
        d.messages.unshift({
            id: 'ms-' + rnd(6), from: from, to: to,
            text: String(text).slice(0, 2000), at: new Date().toISOString(), read: false
        });
        saveDoc(d); refresh();
        toast('أُرسلت الرسالة', 'ok');
        return true;
    }
    function memberOptions(d, exclude) {
        return Object.keys(d.accounts || {}).filter(function (u) { return u !== exclude; })
            .map(function (u) {
                var a = d.accounts[u];
                return '<option value="' + esc(u) + '">' + esc(a.name || u) + (a.system ? ' (الدعم الفني)' : '') + '</option>';
            }).join('');
    }
    function newMessageForm(asSupport, toUser) {
        var sv = load();
        if (!asSupport && !sv.canMessage) {
            var need = 500 - (sv.user.points || 0);
            toast('🔒 الرسائل الخاصة تُفتح بعد 500 نقطة — تحتاج ' + num(need) + ' نقطة.', 'error');
            return;
        }
        var d = fullDoc();
        var me = asSupport ? 'support' : d.authUser;
        modal({
            title: 'رسالة جديدة',
            body: '<label class="matn-field"><span>إلى</span><select class="matn-input" id="nmTo">' + memberOptions(d, me) + '</select></label>' +
                  '<label class="matn-field"><span>الرسالة</span><textarea class="matn-input" id="nmText" rows="4" placeholder="اكتب رسالتك…"></textarea></label>' +
                  (asSupport ? '<p class="text-[10px] text-matn-muted">ستُرسل باسم: الدعم الفني لنادي القراءة</p>' : ''),
            footer: '<button type="button" id="nmGo" class="bg-matn-emerald hover:bg-matn-emeraldLight text-white px-4 py-2.5 rounded-xl text-xs font-bold transition">إرسال</button>' + okBtn('إلغاء'),
            ready: function (w) {
                if (toUser && d.accounts[toUser] && w.querySelector('#nmTo')) w.querySelector('#nmTo').value = toUser;
                w.querySelector('#nmGo').addEventListener('click', function () {
                    var ok = sendMessage(w.querySelector('#nmTo').value, w.querySelector('#nmText').value, asSupport ? 'support' : null);
                    if (ok) closeModal();
                });
            }
        });
    }
    function openThread(other) {
        var s = load();
        var me = s.user.username;
        var d = fullDoc();
        if (!d.accounts[other]) return;
        var thread = (s.messages || []).filter(function (m) {
            return (m.from === me && m.to === other) || (m.from === other && m.to === me);
        });
        /* علّمها مقروءة */
        var changed = false;
        (d.messages || []).forEach(function (m) { if (m.from === other && m.to === me && !m.read) { m.read = true; changed = true; } });
        if (changed) saveDoc(d);
        modal({
            title: 'محادثة: ' + (d.accounts[other].name || other),
            body: '<div class="space-y-2 max-h-[45vh] overflow-auto" id="thList">' + (thread.length ? thread.slice().reverse().map(function (m) {
                    var mine = m.from === me;
                    return '<div class="' + (mine ? 'text-left' : 'text-right') + '">' +
                        '<div class="inline-block max-w-[85%] text-right rounded-2xl px-3 py-2 text-xs ' + (mine ? 'bg-matn-emerald text-white' : 'bg-matn-cream border border-matn-sand') + '">' +
                        esc(m.text) + '</div>' +
                        '<div class="text-[9px] text-matn-muted mt-0.5">' + esc(d.accounts[m.from] ? (d.accounts[m.from].name || m.from) : m.from) + ' · ' + esc(fmtDate(m.at)) + '</div></div>';
                }).join('') : '<p class="text-xs text-matn-muted">لا رسائل بعد — ابدأ الكتابة.</p>') + '</div>' +
                  '<label class="matn-field mt-3"><span>ردّك</span><textarea class="matn-input" id="thText" rows="2"></textarea></label>',
            footer: '<button type="button" id="thGo" class="bg-matn-emerald hover:bg-matn-emeraldLight text-white px-4 py-2.5 rounded-xl text-xs font-bold transition">إرسال</button>' + okBtn('إغلاق'),
            ready: function (w) {
                w.querySelector('#thGo').addEventListener('click', function () {
                    if (sendMessage(other, w.querySelector('#thText').value)) closeModal();
                });
            }
        });
        window.setTimeout(function () { render(); }, 300);
    }
    function renderMessages(s) {
        var box = document.getElementById('msgSection');
        if (!box) return;
        if (!s.signedIn) { box.classList.add('hidden'); return; }
        box.classList.remove('hidden');
        var lock = document.getElementById('msgLocked');
        var mine = myMessages(s);
        var byOther = {};
        mine.forEach(function (m) {
            var o = msgPartner(m, s.user.username);
            if (!byOther[o]) byOther[o] = { other: o, last: m, unread: 0, n: 0 };
            byOther[o].n++;
            if (m.from === o && !m.read) byOther[o].unread++;
        });
        var list = Object.keys(byOther).map(function (k) { return byOther[k]; })
            .sort(function (a, b2) { return new Date(b2.last.at) - new Date(a.last.at); });
        var canMsg = s.canMessage;
        if (lock) {
            if (canMsg) { lock.classList.add('hidden'); lock.textContent = ''; }
            else {
                var need = 500 - (s.user.points || 0);
                lock.classList.remove('hidden');
                lock.innerHTML = '🔒 تُفتح الرسائل الخاصة بعد <strong>500 نقطة</strong> — تحتاج <strong>' + num(need) + '</strong> نقطة. رصيدك: ' + num(s.user.points || 0) + ' نقطة.';
            }
        }
        var nm = document.querySelectorAll('[data-action="new-message"]');
        nm.forEach(function (b) { b.classList.toggle('hidden', !canMsg); });
        var tl = document.getElementById('msgThreads');
        if (!tl) return;
        tl.innerHTML = list.length ? list.map(function (t) {
            var a = (s.accounts || {})[t.other] || {};
            var av = safeImg(a.avatar || '');
            var op = canMsg || t.unread;
            return '<button type="button" data-thread="' + esc(t.other) + '" class="w-full text-right flex items-center gap-3 border border-matn-sand rounded-2xl p-3 hover:border-matn-gold transition bg-white">' +
                    (av ? '<img src="' + esc(av) + '" class="w-10 h-10 rounded-full object-cover shrink-0" alt="">' : '<div class="w-10 h-10 rounded-full bg-matn-creamDark flex items-center justify-center font-bold text-matn-emerald shrink-0">' + esc(String(a.name || t.other).charAt(0)) + '</div>') +
                    '<span class="min-w-0 flex-1"><span class="block font-bold text-xs text-matn-emerald">' + esc(a.name || t.other) + (t.unread ? (' <span class="text-[9px] bg-red-100 text-red-700 px-1.5 py-0.5 rounded-full">' + num(t.unread) + ' جديد</span>') : '') + '</span>' +
                    '<span class="block text-[11px] text-matn-muted truncate">' + esc(String(t.last.text).slice(0, 48)) + '</span></span>' +
                    '<span class="text-[10px] text-matn-muted shrink-0">' + esc(fmtDate(t.last.at)) + '</span>' +
                '</button>';
        }).join('') : '<p class="text-xs text-matn-muted">لا رسائل بعد.' + (canMsg ? ' ابدأ برسالة جديدة.' : '') + '</p>';
        tl.querySelectorAll('[data-thread]').forEach(function (b) {
            b.addEventListener('click', function () { openThread(b.getAttribute('data-thread')); });
        });
    }
    /* لوحة المشرف العام: كل الرسائل الخاصة (للمشرف العام فقط) */
    function renderAdminMessages(s) {
        var box = document.getElementById('adminMsgList');
        if (!box) return;
        if (!s.user.super) { box.innerHTML = '<li class="text-matn-muted py-2">هذه الرسائل تظهر للمشرف العام فقط.</li>'; return; }
        var d = fullDoc();
        var ms = (s.messages || []).slice(0, 40);
        box.innerHTML = ms.length ? ms.map(function (m) {
            var f = (d.accounts[m.from] || {}).name || m.from;
            var t = (d.accounts[m.to] || {}).name || m.to;
            return '<li class="border border-matn-sand rounded-xl p-3">' +
                '<div class="flex flex-wrap items-center justify-between gap-2 text-[11px]">' +
                    '<span><strong class="text-matn-emerald">' + esc(f) + '</strong> ← ' + esc(t) + '</span>' +
                    '<span class="text-matn-muted">' + esc(fmtDate(m.at)) + (m.read ? '' : ' · غير مقروءة') + '</span>' +
                '</div>' +
                '<p class="text-xs mt-1 whitespace-pre-line">' + esc(m.text) + '</p>' +
            '</li>';
        }).join('') : '<li class="text-matn-muted py-2">لا رسائل خاصة.</li>';
    }

    /* ======================================================================
       الربط
       ====================================================================== */
    document.addEventListener('click', function (e) {
        var mnu = document.getElementById('branchesMenu');
        if (mnu && !mnu.classList.contains('hidden') && !e.target.closest('[data-action="toggle-branches"]') && !e.target.closest('#branchesMenu')) {
            mnu.classList.add('hidden');
        }
        var dmn = document.getElementById('diaryMenu');
        if (dmn && !dmn.classList.contains('hidden') && !e.target.closest('[data-action="toggle-diaries"]') && !e.target.closest('#diaryMenu')) {
            dmn.classList.add('hidden');
        }
        var blm = document.getElementById('bellMenu');
        if (blm && !blm.classList.contains('hidden') && !e.target.closest('[data-action="bell"]') && !e.target.closest('#bellMenu')) {
            blm.classList.add('hidden');
        }
        var el = e.target.closest('[data-action]');
        if (!el) return;
        var a = el.getAttribute('data-action');
        if (a === 'book') { bookSeat(); }
        else if (a === 'copy') copyToClipboard(el.getAttribute('data-copy'));
        else if (a === 'pay-confirm') reviewPayment(el.getAttribute('data-uname'), el.getAttribute('data-sid'), true);
        else if (a === 'pay-reject') reviewPayment(el.getAttribute('data-uname'), el.getAttribute('data-sid'), false);
        else if (a === 'save-pay') savePaySettings();
        else if (a === 'save-badwords') saveBadWords();
        else if (a === 'save-ad') saveHeaderAd();
        else if (a === 'buy-book') orderModal('book', 'book', (fullDoc().book || {}).title || 'كتاب الأسبوع', bookPrice());
        else if (a === 'order-ok') reviewOrder(el.getAttribute('data-oid'), true);
        else if (a === 'order-no') reviewOrder(el.getAttribute('data-oid'), false);
        else if (a === 'add-poll-comment') addPollComment(el.getAttribute('data-poll'));
        else if (a === 'edit-poll-id') pollForm(el.getAttribute('data-pid'));
        else if (a === 'del-poll') deletePoll(el.getAttribute('data-pid'));
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
            var d0 = fullDoc(); var u0 = d0.authUser;
            if (u0 && d0.accounts[u0]) { d0.accounts[u0].phone = ''; saveDoc(d0); refresh(); }
        }
        else if (a === 'copy-reminder') copyReminder();
        else if (a === 'avatar') avatarForm();
        else if (a === 'new-message') newMessageForm(false);
        else if (a === 'support-reply') newMessageForm(true);
        else if (a === 'seed-demo') seedDemo();
        else if (a === 'purge-demo') purgeDemo();
        else if (a === 'toggle-book-talk') toggleBookTalk();
        else if (a === 'book-pane') toggleBookPane(el.getAttribute('data-pane'));
        else if (a === 'add-post-book') addPostTopic('book', 'postTextBook');
        else if (a === 'add-post-session') addPostTopic('session', 'postTextSession');
        else if (a === 'bell') openBell();
        else if (a === 'bell-read') markAllNoticesRead();
        else if (a === 'toggle-branches') {
            var mnu = document.getElementById('branchesMenu');
            if (mnu) mnu.classList.toggle('hidden');
            var dm0 = document.getElementById('diaryMenu');
            if (dm0) dm0.classList.add('hidden');
        }
        else if (a === 'toggle-diaries') {
            var dm = document.getElementById('diaryMenu');
            if (dm) dm.classList.toggle('hidden');
            var bm2 = document.getElementById('branchesMenu');
            if (bm2) bm2.classList.add('hidden');
        }
        else if (a === 'add-branch') branchForm(null);
        else if (a === 'edit-book') bookForm();
        else if (a === 'edit-poll') pollForm();
        else if (a === 'add-post') addPost();
        else if (a === 'post-tab') {
            postTopic = el.getAttribute('data-topic') || 'book';
            renderPosts(load());
        }
        else if (a === 'claim-admin') claimSuperAdmin();
        else if (a === 'signout') standaloneSignOut();
    });

    /* تكبير الصورة: ضغط مطوّل = تكبير، إفلات = رجوع (فأرة أو لمس) */
    document.addEventListener('pointerdown', function (e) {
        var el = e.target && e.target.closest ? e.target.closest('[data-zoom]') : null;
        if (!el) return;
        var src = el.getAttribute('data-zoom') || (el.tagName === 'IMG' ? el.getAttribute('src') : '');
        if (!src) return;
        if (e.cancelable) e.preventDefault();
        showZoom(src);
    }, { passive: false });
    ['pointerup', 'pointercancel', 'mouseup', 'touchend', 'touchcancel'].forEach(function (ev) {
        document.addEventListener(ev, hideZoom);
    });
    window.addEventListener('blur', hideZoom);

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

    function wireDiaryForm() {
        var ta = document.getElementById('diaryText');
        var cnt = document.getElementById('diaryCount');
        var go = document.querySelector('[data-action="add-diary"]');
        var priv = document.getElementById('diaryPrivate');
        if (!ta) return;
        function upd() {
            var n = ta.value.length;
            if (cnt) {
                cnt.textContent = num(n) + ' / ' + num(DIARY_MAX) + ' حرف' + (n >= DIARY_MAX ? ' — وصلت الحد الأقصى' : '');
                cnt.className = 'text-[10px] mt-1 ' + (n >= DIARY_MAX ? 'text-red-700 font-bold' : 'text-matn-muted');
            }
            if (go) {
                var bad = n > DIARY_MAX;
                go.disabled = bad;
                go.className = 'bg-matn-emerald hover:bg-matn-emeraldLight text-white px-4 py-2.5 rounded-xl text-xs font-bold shadow transition ' + (bad ? 'opacity-40 cursor-not-allowed' : '');
            }
        }
        var todayEl = document.getElementById('diaryToday');
        if (todayEl) todayEl.textContent = 'اليوم ' + fmtDate(new Date().toISOString());
        ta.setAttribute('maxlength', String(DIARY_MAX));
        ta.addEventListener('input', upd);
        upd();
        if (go && !go.dataset.wired) {
            go.dataset.wired = '1';
            go.addEventListener('click', function () {
                var isPublic = !(priv && priv.checked);
                if (addDiary(ta.value, isPublic)) { ta.value = ''; upd(); }
            });
        }
        document.querySelectorAll('[data-action="diary-tab"]').forEach(function (b) {
            if (b.dataset.wired) return;
            b.dataset.wired = '1';
            b.addEventListener('click', function () { switchDiaryTab(b.getAttribute('data-tab')); });
        });
        switchDiaryTab(window.location.hash === '#diary' ? 'mine' : 'mine');
        if (window.location.hash === '#diary') {
            var box = document.getElementById('diaryCard');
            if (box) window.setTimeout(function () { box.scrollIntoView({ behavior: 'smooth', block: 'start' }); }, 400);
        }
    }

    function boot() { wireAccountPage(); wireDiaryForm(); wireArchive(); refresh(); startPresence(); }

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
