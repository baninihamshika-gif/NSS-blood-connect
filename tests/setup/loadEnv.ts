import { config } from 'dotenv'

// .env holds VITE_SUPABASE_URL / VITE_SUPABASE_PUBLISHABLE_KEY (same values the
// app uses). .env.test.local holds SUPABASE_SERVICE_ROLE_KEY, used only here to
// create/confirm/delete disposable test users via the Admin API.
config({ path: '.env' })
config({ path: '.env.test.local' })
