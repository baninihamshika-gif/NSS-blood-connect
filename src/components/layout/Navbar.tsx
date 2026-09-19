import { Link } from 'react-router-dom'
import { Droplet } from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { Button } from '@/components/ui/Button'
import { NotificationBell } from '@/components/notifications/NotificationBell'

export function Navbar() {
  const { user, profile, logout, actionLoading } = useAuth()

  const dashboardHref = profile?.role === 'DONOR' ? '/donor/dashboard' : '/requester/dashboard'

  return (
    <header className="border-b border-gray-200 bg-white">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
        <Link to="/" className="flex items-center gap-2 font-bold text-gray-900">
          <Droplet className="h-6 w-6 text-brand-600" aria-hidden="true" />
          NSS Blood Connect
        </Link>
        <nav className="flex items-center gap-3">
          {user ? (
            <>
              <Link to={dashboardHref} className="text-sm font-medium text-gray-700 hover:text-gray-900">
                Dashboard
              </Link>
              <NotificationBell />
              <Button variant="outline" size="sm" onClick={() => void logout()} isLoading={actionLoading}>
                Log out
              </Button>
            </>
          ) : (
            <>
              <Link to="/login" className="text-sm font-medium text-gray-700 hover:text-gray-900">
                Login
              </Link>
              <Link to="/register">
                <Button size="sm">Register</Button>
              </Link>
            </>
          )}
        </nav>
      </div>
    </header>
  )
}
