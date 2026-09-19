import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { Spinner } from '@/components/ui/Spinner'
import { ErrorMessage } from '@/components/ui/ErrorMessage'
import { EmptyState } from '@/components/ui/EmptyState'
import { useDonationRecords } from '@/hooks/useDonationRecords'
import { toneHex } from '@/lib/utilities/chartColors'
import { HeartHandshake } from 'lucide-react'

const MONTH_LABEL = new Intl.DateTimeFormat('en-US', { month: 'short', year: '2-digit' })

/** Every donation_records row is written server-side with status COMPLETED
 * (see migration 0006) when a request is marked completed with this donor's
 * match ACCEPTED — so there's no separate "completed only" filter to apply
 * here, every row already represents a real donation that happened. */
export function DonationsOverTimeChart() {
  const { data: records, isLoading, isError } = useDonationRecords()

  if (isLoading) return <Spinner label="Loading donation analytics…" />
  if (isError) return <ErrorMessage message="Could not load donation analytics. Please refresh." />
  if (!records || records.length === 0) {
    return (
      <EmptyState
        icon={HeartHandshake}
        title="Nothing to chart yet"
        description="Once you've completed a donation, your history over time will appear here."
      />
    )
  }

  const unitsByMonth = new Map<string, number>()
  for (const record of records) {
    const date = new Date(record.donation_date)
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
    unitsByMonth.set(key, (unitsByMonth.get(key) ?? 0) + record.units)
  }
  const data = Array.from(unitsByMonth.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, units]) => {
      const [year, month] = key.split('-').map(Number)
      return { key, label: MONTH_LABEL.format(new Date(year!, month! - 1, 1)), units }
    })

  const summary = data.map((d) => `${d.label}: ${d.units} unit${d.units === 1 ? '' : 's'}`).join(', ')

  return (
    <div>
      <div aria-hidden="true" className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 8 }} accessibilityLayer={false}>
            <XAxis dataKey="label" tick={{ fontSize: 12 }} />
            <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
            <Tooltip formatter={(value) => [value, 'Units donated']} />
            <Bar dataKey="units" radius={[4, 4, 0, 0]} fill={toneHex.critical} />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <p className="sr-only">Your donated units by month: {summary}.</p>
    </div>
  )
}
