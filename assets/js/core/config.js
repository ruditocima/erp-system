// ============================================================
// KONFIGURASI WMS - Edit sesuai environment Anda
// ============================================================

// Versi Database (untuk migrasi schema lokal)
export const DB_VERSION = '2.0';

// --- SUPABASE CONFIG ---
// Ganti dengan kredensial dari Project Settings -> API di Supabase
export const SUPABASE_URL = 'https://kwclblvplovxtkmbxaym.supabase.co';
export const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt3Y2xibHZwbG92eHRrbWJ4YXltIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODc4Mzg2OTAsImV4cCI6MjEwMzQxNDY5MH0.3jgJkicnOtHYPiEyZPdNMwklEO1S5mUkb_e7NlDXO7Y';

// Set ke true untuk menggunakan Supabase, false = localStorage only
export const USE_SUPABASE = false;

// --- APP CONFIG ---
export const IDLE_TIMEOUT = 25 * 60 * 1000; // 25 menit
export const IDLE_COUNTDOWN = 300; // 5 menit dalam detik
