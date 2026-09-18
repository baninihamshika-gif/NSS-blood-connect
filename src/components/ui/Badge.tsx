import type { ReactNode } from 'react'

type Tone = 'critical' | 'urgent' | 'normal' | 'success' | 'neutral'

const toneClasses: Record<Tone, string> = {
  critical: 'bg-red-100 text-red-700',
  urgent: 'bg-orange-100 text-orange-700',
  normal: 'bg-blue-100 text-blue-700',
  success: 'bg-green-100 text-green-700',
  neutral: 'bg-gray-100 text-gray-700',
}

export function Badge({ tone = 'neutral', children }: { tone?: Tone; children: ReactNode }) {
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${toneClasses[tone]}`}>
      {children}
    </span>
  )
}
