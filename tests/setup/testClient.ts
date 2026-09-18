import { createClient } from '@supabase/supabase-js'
import type { Database, UserRole } from '../../src/types/database'

function requireEnv(name: string, value: string | undefined): string {
  if (!value) {
    throw new Error(
      `Missing required test env var ${name}. Ensure .env has VITE_SUPABASE_URL / ` +
        'VITE_SUPABASE_PUBLISHABLE_KEY and .env.test.local has SUPABASE_SERVICE_ROLE_KEY.',
    )
  }
  return value
}

const url = requireEnv('VITE_SUPABASE_URL', process.env.VITE_SUPABASE_URL)
const anonKey = requireEnv('VITE_SUPABASE_PUBLISHABLE_KEY', process.env.VITE_SUPABASE_PUBLISHABLE_KEY)
const serviceKey = requireEnv('SUPABASE_SERVICE_ROLE_KEY', process.env.SUPABASE_SERVICE_ROLE_KEY)

/** Service-role client — test setup/teardown only, never used to assert RLS behavior. */
export const adminClient = createClient<Database>(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
})

/** Matches createClient<Database>'s actual inferred return type exactly (see below). */
type AppSupabaseClient = ReturnType<typeof createClient<Database>>

export interface TestUser {
  id: string
  email: string
  /** Authenticated as this user via the anon key — exactly what the app's RLS-bound calls see. */
  client: AppSupabaseClient
}

let counter = 0

/** Creates a pre-confirmed disposable auth user and returns a client signed in as them. */
export async function createTestUser(role: UserRole): Promise<TestUser> {
  counter += 1
  const email = `nss-rls-test-${Date.now()}-${counter}@gmail.com`
  const password = 'Test-Password-123!'

  const { data, error } = await adminClient.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { role },
  })
  if (error || !data.user) {
    throw new Error(`Failed to create test user: ${error?.message}`)
  }

  const client = createClient<Database>(url, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
  const { error: signInError } = await client.auth.signInWithPassword({ email, password })
  if (signInError) {
    throw new Error(`Failed to sign in test user: ${signInError.message}`)
  }

  return { id: data.user.id, email, client }
}

/** Deletes the auth user; profiles/donor_profiles/etc. cascade-delete via FK. */
export async function deleteTestUser(id: string) {
  await adminClient.auth.admin.deleteUser(id)
}
