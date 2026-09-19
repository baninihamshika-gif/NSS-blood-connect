import { Link } from 'react-router-dom'
import { AlertTriangle, FileHeart, PlusCircle } from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { useMyBloodRequests } from '@/hooks/useMyBloodRequests'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Spinner } from '@/components/ui/Spinner'
import { ErrorMessage } from '@/components/ui/ErrorMessage'
import { EmptyState } from '@/components/ui/EmptyState'
import { RequestListItem } from '@/components/requests/RequestListItem'
import { RequestStatusChart } from '@/components/dashboard/RequestStatusChart'

const ACTIVE_STATUSES = ['CREATED', 'MATCHING', 'CONTACTING_DONORS', 'PARTIALLY_FULFILLED']

export function RequesterDashboardPage() {
  const { profile } = useAuth()
  const { data: requests, isLoading, isError } = useMyBloodRequests()

  const activeCount = requests?.filter((r) => ACTIVE_STATUSES.includes(r.status)).length ?? 0
  const emergencyCount = requests?.filter((r) => r.request_type === 'EMERGENCY' && ACTIVE_STATUSES.includes(r.status)).length ?? 0
  const recentRequests = requests?.slice(0, 5) ?? []

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Good to see you, {profile?.full_name ?? 'Coordinator'}</h1>
          <p className="text-sm text-gray-600">Your requester dashboard.</p>
        </div>
        <div className="flex gap-2">
          <Link to="/requester/requests/new">
            <Button variant="outline">
              <PlusCircle className="h-4 w-4" aria-hidden="true" />
              New Request
            </Button>
          </Link>
          <Link to="/requester/requests/emergency">
            <Button variant="danger">
              <AlertTriangle className="h-4 w-4" aria-hidden="true" />
              Emergency Request
            </Button>
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Card>
          <p className="text-xs uppercase tracking-wide text-gray-500">Active Requests</p>
          <p className="text-2xl font-bold text-gray-900">{isLoading ? '—' : activeCount}</p>
        </Card>
        <Card>
          <p className="text-xs uppercase tracking-wide text-gray-500">Emergency Requests</p>
          <p className="text-2xl font-bold text-red-600">{isLoading ? '—' : emergencyCount}</p>
        </Card>
        <Card>
          <p className="text-xs uppercase tracking-wide text-gray-500">Total Requests</p>
          <p className="text-2xl font-bold text-gray-900">{isLoading ? '—' : (requests?.length ?? 0)}</p>
        </Card>
        <Card>
          <p className="text-xs uppercase tracking-wide text-gray-500">Fulfilled</p>
          <p className="text-2xl font-bold text-green-700">
            {isLoading ? '—' : (requests?.filter((r) => r.status === 'FULFILLED' || r.status === 'COMPLETED').length ?? 0)}
          </p>
        </Card>
      </div>

      <div>
        <h2 className="mb-3 text-lg font-semibold text-gray-900">Requests by Status</h2>
        <Card>
          <RequestStatusChart requests={requests ?? undefined} isLoading={isLoading} isError={isError} />
        </Card>
      </div>

      <div>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-900">Recent Requests</h2>
          {requests && requests.length > 0 && (
            <Link to="/requester/requests" className="text-sm font-medium text-brand-600 hover:underline">
              View all
            </Link>
          )}
        </div>

        {isLoading && <Spinner label="Loading your requests…" />}
        {isError && <ErrorMessage message="Could not load your requests. Please refresh." />}
        {!isLoading && !isError && recentRequests.length === 0 && (
          <EmptyState
            icon={FileHeart}
            title="No blood requests yet"
            description="Create your first blood request to start matching with nearby donors."
            action={
              <Link to="/requester/requests/new">
                <Button size="sm" className="mt-2">
                  Create a request
                </Button>
              </Link>
            }
          />
        )}
        {!isLoading && !isError && recentRequests.length > 0 && (
          <div className="flex flex-col divide-y divide-gray-200 rounded-xl border border-gray-200 bg-white">
            {recentRequests.map((request) => (
              <RequestListItem key={request.id} request={request} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
