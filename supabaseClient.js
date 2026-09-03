// ==========================================
// SUPABASE CLIENT CONFIGURATION
// ==========================================
const SUPABASE_URL = 'https://kwclblvplovxtkmbxaym.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt3Y2xibHZwbG92eHRrbWJ4YXltIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODc4Mzg2OTAsImV4cCI6MjEwMzQxNDY5MH0.3jgJkicnOtHYPiEyZPdNMwklEO1S5mUkb_e7NlDXO7Y';

// Inisialisasi Supabase Client (memerlukan script CDN supabase di index.html)
let supabaseClient = null;

if (window.supabase) {
    supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
} else {
    console.error('Supabase SDK belum dimuat.');
}
