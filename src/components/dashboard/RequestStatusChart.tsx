import { Bar, BarChart, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { Spinner } from '@/components/ui/Spinner'
import { ErrorMessage } from '@/components/ui/ErrorMessage'
import { EmptyState } from '@/components/ui/EmptyState'
import { statusLabel, statusTone } from '@/lib/utilities/requestDisplay'
import { toneHex } from '@/lib/utilities/chartColors'
import { BarChart3 } from 'lucide-react'
import type { BloodRequest, RequestStatus } from '@/types/database'

/** Takes the requester's own requests as a prop rather than fetching them
 * again — the dashboard page already calls useMyBloodRequests() for its
 * stat tiles, and that hook holds a realtime subscription keyed by a fixed
 * channel name; a second concurrent call from here previously crashed the
 * page (Supabase throws adding postgres_changes callbacks to an
 * already-subscribed channel of the same name), caught only by live
 * browser testing since neither TypeScript nor unit tests exercise two
 * hook instances mounted at once. */
export function RequestStatusChart({
  requests,
  isLoading,
  isError,
}: {
  requests: BloodRequest[] | undefined
  isLoading: boolean
  isError: boolean
}) {
  if (isLoading) return <Spinner label="Loading request analytics…" />
  if (isError) return <ErrorMessage message="Could not load request analytics. Please refresh." />
  if (!requests || requests.length === 0) {
    return (
      <EmptyState
        icon={BarChart3}
        title="Nothing to chart yet"
        description="Once you've created a blood request, its status breakdown will appear here."
      />
    )
  }

  const counts = new Map<RequestStatus, number>()
  for (const request of requests) {
    counts.set(request.status, (counts.get(request.status) ?? 0) + 1)
  }
  const data = Array.from(counts.entries()).map(([status, count]) => ({
    status,
    label: statusLabel[status],
    count,
  }))

  const summary = data.map((d) => `${d.label}: ${d.count}`).join(', ')

  return (
    <div>
      <div aria-hidden="true" className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 8 }} accessibilityLayer={false}>
            <XAxis dataKey="label" tick={{ fontSize: 12 }} interval={0} angle={-20} textAnchor="end" height={50} />
            <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
            <Tooltip formatter={(value) => [value, 'Requests']} />
            <Bar dataKey="count" radius={[4, 4, 0, 0]}>
              {data.map((entry) => (
                <Cell key={entry.status} fill={toneHex[statusTone[entry.status]]} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
      <p className="sr-only">Your requests by status: {summary}.</p>
    </div>
  )
}
