const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabasePublishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY

export const isSupabaseConfigured = Boolean(supabaseUrl && supabasePublishableKey)

if (!isSupabaseConfigured) {
  // Surfaced in the UI via <MissingSupabaseConfig />; logged once for local dev visibility.
  console.warn(
    '[NSS Blood Connect] Supabase environment variables are not set. ' +
      'Copy .env.example to .env and fill in VITE_SUPABASE_URL / VITE_SUPABASE_PUBLISHABLE_KEY.',
  )
}

export const env = {
  supabaseUrl: supabaseUrl ?? '',
  supabasePublishableKey: supabasePublishableKey ?? '',
}
