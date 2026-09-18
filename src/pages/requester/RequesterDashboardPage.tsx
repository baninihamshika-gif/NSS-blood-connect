import { FileHeart } from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { EmptyState } from '@/components/ui/EmptyState'

export function RequesterDashboardPage() {
  const { profile } = useAuth()

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Good to see you, {profile?.full_name ?? 'Coordinator'}</h1>
        <p className="text-sm text-gray-600">Your requester dashboard.</p>
      </div>

      <div>
        <h2 className="mb-3 text-lg font-semibold text-gray-900">Your Requests</h2>
        <EmptyState
          icon={FileHeart}
          title="No blood requests yet"
          description="Create your first blood request to start matching with nearby donors."
        />
      </div>
    </div>
  )
}
