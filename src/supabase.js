import { createClient } from '@supabase/supabase-js';

export function assertSupabaseEnv() {
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_PUBLISHABLE_KEY) {
    throw new Error('Faltan SUPABASE_URL o SUPABASE_PUBLISHABLE_KEY.');
  }
}

export function supabaseForRequest(req) {
  assertSupabaseEnv();

  const authorization = req.headers.authorization || '';
  if (!authorization.startsWith('Bearer ')) {
    const error = new Error('Necesitás iniciar sesión.');
    error.statusCode = 401;
    throw error;
  }

  return createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_PUBLISHABLE_KEY,
    {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { headers: { Authorization: authorization } },
    },
  );
}

export async function authenticatedUser(req) {
  const supabase = supabaseForRequest(req);
  const token = req.headers.authorization.slice('Bearer '.length);
  const { data, error } = await supabase.auth.getUser(token);

  if (error || !data?.user) {
    const authError = new Error('La sesión no es válida o venció.');
    authError.statusCode = 401;
    throw authError;
  }

  return { supabase, user: data.user };
}
