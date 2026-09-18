import { Link } from 'react-router-dom'
import { FileHeart } from 'lucide-react'
import { useMyBloodRequests } from '@/hooks/useMyBloodRequests'
import { RequestListItem } from '@/components/requests/RequestListItem'
import { Spinner } from '@/components/ui/Spinner'
import { ErrorMessage } from '@/components/ui/ErrorMessage'
import { EmptyState } from '@/components/ui/EmptyState'
import { Button } from '@/components/ui/Button'

export function RequestHistoryPage() {
  const { data: requests, isLoading, isError } = useMyBloodRequests()

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Request History</h1>
          <p className="text-sm text-gray-600">All blood requests you've created.</p>
        </div>
        <Link to="/requester/requests/new">
          <Button size="sm">New request</Button>
        </Link>
      </div>

      {isLoading && <Spinner label="Loading your requests…" />}
      {isError && <ErrorMessage message="Could not load your request history. Please refresh." />}

      {!isLoading && !isError && (!requests || requests.length === 0) && (
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

      {!isLoading && !isError && requests && requests.length > 0 && (
        <div className="flex flex-col divide-y divide-gray-200 rounded-xl border border-gray-200 bg-white">
          {requests.map((request) => (
            <RequestListItem key={request.id} request={request} />
          ))}
        </div>
      )}
    </div>
  )
}
