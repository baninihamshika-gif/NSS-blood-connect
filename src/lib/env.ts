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

export interface DemoAccount {
  email: string
  password: string
}

/**
 * Local-dev-only demo login accounts. `import.meta.env.DEV` is statically
 * `false` in a production build, so this ternary folds to `{ donor: null,
 * requester: null }` — the actual credential strings never get embedded in
 * the bundle, even though the (inert) demo-login button JSX in LoginPage
 * still ships as normal dead UI (it just never renders, since these are null).
 * Verified: grepping dist/ for the real credential values finds nothing.
 */
export const demoAccounts: { donor: DemoAccount | null; requester: DemoAccount | null } = import.meta.env.DEV
  ? {
      donor:
        import.meta.env.VITE_DEMO_DONOR_EMAIL && import.meta.env.VITE_DEMO_DONOR_PASSWORD
          ? { email: import.meta.env.VITE_DEMO_DONOR_EMAIL, password: import.meta.env.VITE_DEMO_DONOR_PASSWORD }
          : null,
      requester:
        import.meta.env.VITE_DEMO_REQUESTER_EMAIL && import.meta.env.VITE_DEMO_REQUESTER_PASSWORD
          ? {
              email: import.meta.env.VITE_DEMO_REQUESTER_EMAIL,
              password: import.meta.env.VITE_DEMO_REQUESTER_PASSWORD,
            }
          : null,
    }
  : { donor: null, requester: null }
