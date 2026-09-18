import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { isSupabaseConfigured } from '@/lib/env'

export interface LandingStats {
  criticalRequests: number
  availableDonors: number
}

async function fetchLandingStats(): Promise<LandingStats> {
  const [criticalRes, donorsRes] = await Promise.all([
    supabase
      .from('blood_requests')
      .select('id', { count: 'exact', head: true })
      .eq('priority', 'CRITICAL')
      .in('status', ['CREATED', 'MATCHING', 'CONTACTING_DONORS', 'PARTIALLY_FULFILLED']),
    supabase
      .from('donor_profiles')
      .select('id', { count: 'exact', head: true })
      .eq('availability_status', 'AVAILABLE'),
  ])

  if (criticalRes.error) throw criticalRes.error
  if (donorsRes.error) throw donorsRes.error

  return {
    criticalRequests: criticalRes.count ?? 0,
    availableDonors: donorsRes.count ?? 0,
  }
}

export function useLandingStats() {
  return useQuery({
    queryKey: ['landing-stats'],
    queryFn: fetchLandingStats,
    enabled: isSupabaseConfigured,
    staleTime: 30_000,
  })
}
