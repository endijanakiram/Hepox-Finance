import { createClient } from '@supabase/supabase-js';

const supabaseUrl  = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnon) {
  throw new Error('Missing Supabase environment variables. Check your .env.local file.');
}

export const supabase = createClient(supabaseUrl, supabaseAnon);

// ─── Convenience helpers ───────────────────────────────────────

/** Fetch all global settings as a plain object: { key: value } */
export async function fetchSettings() {
  const { data, error } = await supabase
    .from('global_settings')
    .select('key, value');

  if (error) throw error;

  return data.reduce((acc, row) => {
    acc[row.key] = parseFloat(row.value);
    return acc;
  }, {});
}

/** Update a single setting */
export async function updateSetting(key, value) {
  const { error } = await supabase
    .from('global_settings')
    .update({ value: parseFloat(value), updated_at: new Date().toISOString() })
    .eq('key', key);
  if (error) throw error;
}
