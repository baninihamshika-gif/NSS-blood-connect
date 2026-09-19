import { Link } from 'react-router-dom'
import { AlertTriangle, Droplet, ArrowRight } from 'lucide-react'
import { useLandingStats } from '@/hooks/useLandingStats'
import { APP_NAME } from '@/constants'

function StatPill({ icon, label, value, loading }: { icon: string; label: string; value: number; loading: boolean }) {
  return (
    <div className="flex items-center gap-2 rounded-full border border-gray-200 bg-white px-4 py-2 text-sm">
      <span aria-hidden="true">{icon}</span>
      <span className="font-semibold text-gray-900">{loading ? '—' : value.toLocaleString()}</span>
      <span className="text-gray-600">{label}</span>
    </div>
  )
}

export function LandingPage() {
  const { data, isLoading, isError } = useLandingStats()

  return (
    <div className="mx-auto max-w-5xl px-4 py-16 text-center">
      <p className="text-sm font-semibold uppercase tracking-wide text-brand-600">{APP_NAME}</p>
      <h1 className="mt-3 text-4xl font-extrabold tracking-tight text-gray-900 sm:text-5xl">
        Find Blood. Save Time. Save Lives.
      </h1>
      <p className="mx-auto mt-4 max-w-2xl text-gray-600">
        A coordinated blood emergency platform that matches requesters with available, eligible donors
        and tracks every request from creation to completion.
      </p>

      <div className="mx-auto mt-10 grid max-w-2xl gap-4 sm:grid-cols-2">
        <Link
          to="/register?role=REQUESTER"
          className="group flex flex-col items-start gap-2 rounded-xl border-2 border-red-200 bg-red-50 p-6 text-left transition-colors hover:border-red-400"
        >
          <AlertTriangle className="h-7 w-7 text-red-600" aria-hidden="true" />
          <span className="text-lg font-bold text-red-900">Need Blood</span>
          <span className="inline-flex items-center gap-1 text-sm font-medium text-red-700">
            Request Blood <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" aria-hidden="true" />
          </span>
        </Link>

        <Link
          to="/register?role=DONOR"
          className="group flex flex-col items-start gap-2 rounded-xl border-2 border-brand-200 bg-brand-50 p-6 text-left transition-colors hover:border-brand-400"
        >
          <Droplet className="h-7 w-7 text-brand-600" aria-hidden="true" />
          <span className="text-lg font-bold text-brand-900">Become a Donor</span>
          <span className="inline-flex items-center gap-1 text-sm font-medium text-brand-700">
            Register <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" aria-hidden="true" />
          </span>
        </Link>
      </div>

      <div className="mx-auto mt-10 flex flex-wrap items-center justify-center gap-3">
        {isError ? (
          <p className="text-sm text-gray-500">Live network stats are unavailable right now.</p>
        ) : (
          <>
            <StatPill icon="🔴" label="Critical Requests" value={data?.criticalRequests ?? 0} loading={isLoading} />
            <StatPill icon="🟢" label="Available Donors" value={data?.availableDonors ?? 0} loading={isLoading} />
          </>
        )}
      </div>
    </div>
  )
}
