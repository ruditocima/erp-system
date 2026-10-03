import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/+esm';
import { APP_CONFIG } from '../config.js';

let client = null;

try {
    if (typeof createClient === 'function' && APP_CONFIG?.SUPABASE_URL && APP_CONFIG?.SUPABASE_ANON_KEY) {
        client = createClient(APP_CONFIG.SUPABASE_URL, APP_CONFIG.SUPABASE_ANON_KEY);
    }
} catch (error) {
    console.error('Gagal menginisialisasi Supabase Client:', error);
}

export const supabaseClient = client;
