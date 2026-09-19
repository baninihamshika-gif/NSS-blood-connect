import { Link } from 'react-router-dom'
import { Droplet } from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { Button } from '@/components/ui/Button'
import { NotificationBell } from '@/components/notifications/NotificationBell'
import { APP_NAME } from '@/constants'

export function Navbar() {
  const { user, profile, logout, actionLoading } = useAuth()

  const dashboardHref = profile?.role === 'DONOR' ? '/donor/dashboard' : '/requester/dashboard'

  return (
    <header className="border-b border-gray-200 bg-white">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-3">
        <Link to="/" className="flex items-center gap-2 whitespace-nowrap font-bold text-gray-900">
          <Droplet className="h-6 w-6 shrink-0 text-brand-600" aria-hidden="true" />
          {APP_NAME}
        </Link>
        <nav className="flex flex-wrap items-center gap-3">
          {user ? (
            <>
              <Link to={dashboardHref} className="whitespace-nowrap text-sm font-medium text-gray-700 hover:text-gray-900">
                Dashboard
              </Link>
              <NotificationBell />
              <Button variant="outline" size="sm" className="whitespace-nowrap" onClick={() => void logout()} isLoading={actionLoading}>
                Log out
              </Button>
            </>
          ) : (
            <>
              <Link to="/login" className="whitespace-nowrap text-sm font-medium text-gray-700 hover:text-gray-900">
                Login
              </Link>
              <Link to="/register">
                <Button size="sm" className="whitespace-nowrap">Register</Button>
              </Link>
            </>
          )}
        </nav>
      </div>
    </header>
  )
}
