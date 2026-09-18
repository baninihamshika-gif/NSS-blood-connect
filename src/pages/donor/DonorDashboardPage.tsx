import { Link } from 'react-router-dom'
import { AlertTriangle, Droplet, HeartHandshake, Inbox, Settings } from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { useDonorProfile } from '@/hooks/useDonorProfile'
import { useUpdateAvailability } from '@/hooks/useUpdateAvailability'
import { useDonationRecords } from '@/hooks/useDonationRecords'
import { Card } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Spinner } from '@/components/ui/Spinner'
import { ErrorMessage } from '@/components/ui/ErrorMessage'
import { EmptyState } from '@/components/ui/EmptyState'
import type { AvailabilityStatus } from '@/types/database'

const availabilityTone = {
  AVAILABLE: 'success',
  MAYBE: 'urgent',
  UNAVAILABLE: 'neutral',
} as const

const availabilityOptions: { value: AvailabilityStatus; label: string }[] = [
  { value: 'AVAILABLE', label: 'Available' },
  { value: 'MAYBE', label: 'Maybe' },
  { value: 'UNAVAILABLE', label: 'Unavailable' },
]

function AvailabilityToggle({ current }: { current: AvailabilityStatus }) {
  const updateAvailability = useUpdateAvailability()

  return (
    <div className="flex flex-wrap items-center gap-2">
      {availabilityOptions.map((option) => (
        <Button
          key={option.value}
          type="button"
          size="sm"
          variant={current === option.value ? 'primary' : 'outline'}
          isLoading={updateAvailability.isPending && updateAvailability.variables === option.value}
          disabled={updateAvailability.isPending && updateAvailability.variables !== option.value}
          onClick={() => updateAvailability.mutate(option.value)}
        >
          {option.label}
        </Button>
      ))}
      {updateAvailability.isError && (
        <span className="text-sm text-red-600">Could not update availability. Try again.</span>
      )}
    </div>
  )
}

function DonationHistorySection() {
  const { data: records, isLoading, isError } = useDonationRecords()

  if (isLoading) return <Spinner label="Loading donation history…" />
  if (isError) return <ErrorMessage message="Could not load your donation history. Please refresh." />
  if (!records || records.length === 0) {
    return (
      <EmptyState
        icon={HeartHandshake}
        title="No donations recorded yet"
        description="Your completed donations will be listed here."
      />
    )
  }

  return (
    <div className="flex flex-col divide-y divide-gray-200 rounded-xl border border-gray-200 bg-white">
      {records.map((record) => (
        <div key={record.id} className="flex items-center justify-between gap-4 px-4 py-3">
          <div>
            <p className="text-sm font-medium text-gray-900">{record.donation_date}</p>
            <p className="text-xs text-gray-500">{record.facility ?? 'Facility not recorded'}</p>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-sm text-gray-700">{record.units} unit{record.units === 1 ? '' : 's'}</span>
            <Badge tone={record.status === 'COMPLETED' ? 'success' : 'neutral'}>{record.status}</Badge>
          </div>
        </div>
      ))}
    </div>
  )
}

export function DonorDashboardPage() {
  const { profile } = useAuth()
  const { data: donorProfile, isLoading, isError } = useDonorProfile()

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Welcome, {profile?.full_name ?? 'Donor'}</h1>
          <p className="text-sm text-gray-600">Your donor dashboard.</p>
        </div>
        <Link to="/donor/profile">
          <Button variant="outline" size="sm">
            <Settings className="h-4 w-4" aria-hidden="true" />
            Edit profile
          </Button>
        </Link>
      </div>

      {isLoading && <Spinner label="Loading your profile…" />}
      {isError && <ErrorMessage message="Could not load your donor profile. Please refresh." />}

      {!isLoading && !isError && donorProfile && (
        <Card className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center gap-6">
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-brand-100">
                <Droplet className="h-6 w-6 text-brand-600" aria-hidden="true" />
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide text-gray-500">Blood Group</p>
                <p className="text-lg font-bold text-gray-900">{donorProfile.blood_group}</p>
              </div>
            </div>
            <div>
              <p className="text-xs uppercase tracking-wide text-gray-500">Current Status</p>
              <Badge tone={availabilityTone[donorProfile.availability_status]}>
                {donorProfile.availability_status}
              </Badge>
            </div>
            <div>
              <p className="text-xs uppercase tracking-wide text-gray-500">Last Donation</p>
              <p className="text-sm font-medium text-gray-900">
                {donorProfile.last_donation_date ?? 'Not recorded'}
              </p>
            </div>
          </div>
          <div>
            <p className="mb-2 text-xs uppercase tracking-wide text-gray-500">Set Availability</p>
            <AvailabilityToggle current={donorProfile.availability_status} />
          </div>
        </Card>
      )}

      {!isLoading && !isError && !donorProfile && (
        <EmptyState
          icon={AlertTriangle}
          title="No donor profile found"
          description="Your account is missing its donor details (blood group, availability). This can happen if registration was interrupted — please contact support or try registering again."
        />
      )}

      <div>
        <h2 className="mb-3 text-lg font-semibold text-gray-900">Incoming Requests</h2>
        <EmptyState
          icon={Inbox}
          title="No incoming requests yet"
          description="Blood requests matched to your profile will appear here once the matching engine is live."
        />
      </div>

      <div>
        <h2 className="mb-3 text-lg font-semibold text-gray-900">Donation History</h2>
        <DonationHistorySection />
      </div>
    </div>
  )
}
