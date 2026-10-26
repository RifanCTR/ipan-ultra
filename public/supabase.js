
(() => {
  "use strict";

  const SUPABASE_URL = "https://xcxqmisevemnwubvvyjk.supabase.co";
  const SUPABASE_PUBLISHABLE_KEY =
    "sb_publishable_hqCkAM3XPCn4esUlIRaTSQ_z8iBo9Cx";

  if (!window.supabase || typeof window.supabase.createClient !== "function") {
    console.error(
      "Supabase JS belum dimuat. Periksa urutan script di index.html."
    );
    return;
  }

  window.supabaseClient = window.supabase.createClient(
    SUPABASE_URL,
    SUPABASE_PUBLISHABLE_KEY,
    {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true
      }
    }
  );
})();

