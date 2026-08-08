// js/supabase.js
// -------------------------------------------------
// Supabase client configuration (placeholders).
// The GitHub Actions workflow will replace the placeholders
// with the values from the repository secrets (SUPABASE_URL and SUPABASE_ANON_KEY).
// -------------------------------------------------
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/esm/index.js';

const supabaseUrl = window.SUPABASE_URL || "YOUR_SUPABASE_URL";
const supabaseAnonKey = window.SUPABASE_ANON_KEY || "YOUR_SUPABASE_ANON_KEY";

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
