import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/+esm';

const SUPABASE_URL = 'https://mwcdgumytjwhewkbbwge.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im13Y2RndW15dGp3aGV3a2Jid2dlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODkwMzAzODUsImV4cCI6MjEwNDYwNjM4NX0.DERPs4Gd_iMbn38aik9KKQG4Wc44QitUG1JaZya1gsI';

export const supabaseClient = (typeof createClient === 'function') 
    ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY) 
    : null;