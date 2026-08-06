import { createClient } from '@supabase/supabase-js';

function getEnv(key: string, fallback: string): string {
  try {
    if (typeof import.meta !== 'undefined') {
      const env = (import.meta as { env?: Record<string, string> }).env;
      if (env && env[key]) return env[key];
    }
  } catch { /* not in Vite */ }
  try {
    if (typeof globalThis !== 'undefined') {
      const p = (globalThis as { process?: { env: Record<string, string | undefined> } }).process;
      if (p && p.env && p.env[key]) return p.env[key] as string;
    }
  } catch { /* no process */ }
  return fallback;
}

const supabaseUrl = getEnv('VITE_SUPABASE_URL', 'https://cijkovguyemtrkyjopnx.supabase.co');
const supabaseAnonKey = getEnv('VITE_SUPABASE_ANON_KEY', 'sb_publishable_zmOp24-B-YdTm3c9A_lpxw_E92s4-MV');

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});

export async function testSupabaseConnection(): Promise<boolean> {
  try {
    const { error } = await supabase
      .from('companies')
      .select('id')
      .limit(1);

    if (error) {
      console.error('Supabase connection test failed:', error.message);
      return false;
    }

    console.log('✅ Supabase connected');
    return true;
  } catch (err) {
    console.error('Supabase connection error:', err);
    return false;
  }
}
