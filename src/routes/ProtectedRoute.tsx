import type { ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '@/hooks/useAuth'
import { Spinner } from '@/components/ui/Spinner'
import type { UserRole } from '@/types/database'

export function ProtectedRoute({
  children,
  allowedRole,
}: {
  children: ReactNode
  /** Restrict this route to a single role; omit to allow any authenticated user. */
  allowedRole?: UserRole
}) {
  const { user, profile, loading } = useAuth()
  const location = useLocation()

  if (loading) {
    return <Spinner label="Checking your session…" />
  }

  if (!user) {
    return <Navigate to="/login" replace state={{ from: location }} />
  }

  if (allowedRole && profile && profile.role !== allowedRole) {
    const redirectTo = profile.role === 'DONOR' ? '/donor/dashboard' : '/requester/dashboard'
    return <Navigate to={redirectTo} replace />
  }

  return <>{children}</>
}
