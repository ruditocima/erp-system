import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/+esm';
import { APP_CONFIG } from '../config.js'; // Import config

// [FIX] Bungkus pembuatan client dalam try/catch: bila inisialisasi gagal
// (URL invalid, jaringan, key salah), aplikasi tetap jalan dan otomatis
// memakai mode lokal (localStorage) alih-alih error modul yang menghentikan seluruh app.
let _client = null;
try {
    _client = (typeof createClient === 'function')
        ? createClient(APP_CONFIG.SUPABASE_URL, APP_CONFIG.SUPABASE_ANON_KEY)
        : null;
} catch (e) {
    console.error('Kesalahan saat menginisialisasi Supabase client:', e);
    _client = null;
}

export const supabaseClient = _client;
