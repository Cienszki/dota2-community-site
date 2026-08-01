import { createClient } from '@supabase/supabase-js';
import { requireEnv } from './env';

const supabaseUrl = requireEnv('NEXT_PUBLIC_SUPABASE_URL', process.env.NEXT_PUBLIC_SUPABASE_URL);
const supabaseServiceRoleKey = requireEnv('SUPABASE_SERVICE_ROLE_KEY', process.env.SUPABASE_SERVICE_ROLE_KEY);

export const supabaseAdmin = createClient(supabaseUrl, supabaseServiceRoleKey);
