/* ==========================================================================
   إعدادات Supabase — املأ القيم ثم أعد رفع هذا الملف.
   تجدها في: Supabase → Project Settings → API

   ⚠️ ضع هنا مفتاح anon (المفتاح العام) فقط.
      لا تضع service_role أبداً في ملف يُرسل للمتصفح.

   ما دامت url و anonKey فارغتين، يعمل الموقع بالوضع المحلي
   (localStorage) كما كان تماماً.
   ========================================================================== */
window.MATN_CLOUD = {
    url: '',            // مثال: https://abcdefghijklm.supabase.co
    anonKey: '',        // مثال: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...

    // الجلسة المشتركة في قاعدة البيانات
    sessionKey: 'gharnata',

    // اجعلها true فقط بعد نشر دالة send-ticket (supabase/functions/send-ticket)
    // وإضافة RESEND_API_KEY — عندها يُطلب البريد عند الحجز وتُرسل التذكرة.
    emailTickets: false
};
