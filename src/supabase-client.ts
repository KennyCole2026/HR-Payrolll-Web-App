import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://cijkovguyemtrkyjopnx.supabase.co';
const supabaseAnonKey = 'sb_publishable_zmOp24-B-YdTm3c9A_lpxw_E92s4-MV';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

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
