import { createClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
import { env, isSupabaseConfigured } from '@/lib/env'

// Fall back to a syntactically valid placeholder so the client can construct
// without throwing when env vars are missing; isSupabaseConfigured gates
// actual usage and the UI shows <MissingSupabaseConfig /> instead of calling it.
const url = isSupabaseConfigured ? env.supabaseUrl : 'https://placeholder.supabase.co'
const key = isSupabaseConfigured ? env.supabasePublishableKey : 'placeholder-key'

export const supabase = createClient<Database>(url, key, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
  },
})
