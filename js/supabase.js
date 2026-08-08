// js/supabase.js
// -------------------------------------------------
// Supabase client initialization.
// Loads the Supabase JS SDK from CDN and exposes the client
// on window.supabaseClient for use by storage.js and other scripts.
//
// The GitHub Actions workflow will replace the placeholder values
// in index.html (window.SUPABASE_URL / window.SUPABASE_ANON_KEY)
// with the real secrets before deployment.
// -------------------------------------------------
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/esm/index.js';

const supabaseUrl = window.SUPABASE_URL || "YOUR_SUPABASE_URL";
const supabaseAnonKey = window.SUPABASE_ANON_KEY || "YOUR_SUPABASE_ANON_KEY";

// Create the client and expose it globally so non-module scripts can use it
const supabase = createClient(supabaseUrl, supabaseAnonKey);
window.supabaseClient = supabase;

console.log('[Supabase] Cliente inicializado:', supabaseUrl);
