import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react'
import type { Session, User } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import type { BloodGroup, Profile, UserRole } from '@/types/database'

export interface RegisterInput {
  email: string
  password: string
  fullName: string
  role: UserRole
  phone?: string
  city?: string
  area?: string
  /** Required when role === 'DONOR'. */
  bloodGroup?: BloodGroup
}

interface AuthContextValue {
  user: User | null
  session: Session | null
  profile: Profile | null
  /** True while the initial session/profile is being resolved. */
  loading: boolean
  /** True while a sign-in/sign-up/sign-out call is in flight. */
  actionLoading: boolean
  /** Resolves to false when email confirmation is required (no session yet). */
  register: (input: RegisterInput) => Promise<boolean>
  /** Returns the signed-in user's profile so callers can redirect by role
   * without waiting on a separate state update (the profile-loaded state
   * update from onAuthStateChange may not have landed yet when this resolves). */
  login: (email: string, password: string) => Promise<Profile | null>
  logout: () => Promise<void>
  requestPasswordReset: (email: string) => Promise<void>
  refreshProfile: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined)

async function fetchProfile(userId: string): Promise<Profile | null> {
  const { data, error } = await supabase.from('profiles').select('*').eq('id', userId).maybeSingle()
  if (error) {
    console.error('Failed to load profile', error)
    return null
  }
  return data
}

/**
 * Registration data is stashed in Supabase Auth's user_metadata at sign-up
 * time (see `register`). When email confirmation is required, no session
 * exists yet at sign-up, so the profile/donor_profile rows can't be created
 * then (RLS requires auth.uid() = id). Instead, the first time we see an
 * authenticated session for a user with no profile row, we backfill it from
 * their metadata here — covering both the immediate-session and
 * confirm-then-first-login paths with one code path.
 */
async function ensureProfile(user: User): Promise<Profile | null> {
  const existing = await fetchProfile(user.id)
  if (existing) return existing

  const meta = user.user_metadata as Record<string, unknown>
  const fullName = typeof meta.full_name === 'string' ? meta.full_name : null
  const role = meta.role === 'DONOR' || meta.role === 'REQUESTER' ? meta.role : null
  if (!fullName || !role) {
    // No pending registration metadata — nothing to backfill.
    return null
  }

  const { error: profileError } = await supabase.from('profiles').insert({
    id: user.id,
    full_name: fullName,
    role,
    phone: typeof meta.phone === 'string' ? meta.phone : null,
    email: user.email ?? null,
    city: typeof meta.city === 'string' ? meta.city : null,
    area: typeof meta.area === 'string' ? meta.area : null,
  })
  if (profileError) {
    console.error('Failed to create profile from metadata', profileError)
    return null
  }

  if (role === 'DONOR' && typeof meta.blood_group === 'string') {
    const { error: donorError } = await supabase.from('donor_profiles').insert({
      user_id: user.id,
      blood_group: meta.blood_group as BloodGroup,
      availability_status: 'MAYBE',
    })
    if (donorError) {
      console.error('Failed to create donor profile from metadata', donorError)
    }
  }

  return fetchProfile(user.id)
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [session, setSession] = useState<Session | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState(false)

  useEffect(() => {
    let isMounted = true

    supabase.auth.getSession().then(async ({ data }) => {
      if (!isMounted) return
      setSession(data.session)
      setUser(data.session?.user ?? null)
      if (data.session?.user) {
        setProfile(await ensureProfile(data.session.user))
      }
      setLoading(false)
    })

    const { data: listener } = supabase.auth.onAuthStateChange(async (_event, nextSession) => {
      if (!isMounted) return
      setSession(nextSession)
      setUser(nextSession?.user ?? null)
      if (nextSession?.user) {
        setProfile(await ensureProfile(nextSession.user))
      } else {
        setProfile(null)
      }
    })

    return () => {
      isMounted = false
      listener.subscription.unsubscribe()
    }
  }, [])

  async function register(input: RegisterInput): Promise<boolean> {
    if (input.role === 'DONOR' && !input.bloodGroup) {
      throw new Error('Blood group is required for donor registration.')
    }

    setActionLoading(true)
    try {
      // Registration details travel in user_metadata rather than being
      // inserted directly here: if the project requires email confirmation,
      // signUp() returns no session, and RLS (id = auth.uid()) would reject
      // an insert made without one. ensureProfile() backfills from this
      // metadata on the user's first authenticated session, whether that's
      // immediate (confirmation off) or after they click the email link.
      const { data, error } = await supabase.auth.signUp({
        email: input.email,
        password: input.password,
        options: {
          data: {
            full_name: input.fullName,
            role: input.role,
            phone: input.phone ?? null,
            city: input.city ?? null,
            area: input.area ?? null,
            blood_group: input.role === 'DONOR' ? input.bloodGroup : null,
          },
        },
      })
      if (error) throw error

      if (!data.session || !data.user) {
        return false
      }

      setProfile(await ensureProfile(data.user))
      return true
    } finally {
      setActionLoading(false)
    }
  }

  async function login(email: string, password: string): Promise<Profile | null> {
    setActionLoading(true)
    try {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password })
      if (error) throw error
      if (!data.user) return null
      const loggedInProfile = await ensureProfile(data.user)
      setProfile(loggedInProfile)
      return loggedInProfile
    } finally {
      setActionLoading(false)
    }
  }

  async function logout() {
    setActionLoading(true)
    try {
      const { error } = await supabase.auth.signOut()
      if (error) throw error
    } finally {
      setActionLoading(false)
    }
  }

  async function requestPasswordReset(email: string) {
    setActionLoading(true)
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/reset-password`,
      })
      if (error) throw error
    } finally {
      setActionLoading(false)
    }
  }

  async function refreshProfile() {
    if (!user) return
    setProfile(await ensureProfile(user))
  }

  return (
    <AuthContext.Provider
      value={{
        user,
        session,
        profile,
        loading,
        actionLoading,
        register,
        login,
        logout,
        requestPasswordReset,
        refreshProfile,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider')
  return ctx
}
