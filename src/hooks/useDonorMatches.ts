import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { BloodGroup } from '@/types/database'

export interface DonorMatchWithBloodGroup {
  id: string
  donor_id: string
  match_score: number | null
  distance_km: number | null
  match_status: string
  created_at: string
  bloodGroup: BloodGroup | null
}

/** donor_matches.donor_id and donor_profiles.user_id both reference
 * profiles(id) independently (no direct FK between the two tables), so
 * Postgrest can't auto-embed one query — fetched and merged separately. */
export function useDonorMatches(requestId: string | undefined) {
  return useQuery({
    queryKey: ['donor-matches', requestId],
    queryFn: async (): Promise<DonorMatchWithBloodGroup[]> => {
      const { data: matches, error } = await supabase
        .from('donor_matches')
        .select('id, donor_id, match_score, distance_km, match_status, created_at')
        .eq('request_id', requestId!)
        .order('match_score', { ascending: false })
      if (error) throw error
      if (!matches || matches.length === 0) return []

      const donorIds = matches.map((m) => m.donor_id)
      const { data: donorProfiles, error: profilesError } = await supabase
        .from('donor_profiles')
        .select('user_id, blood_group')
        .in('user_id', donorIds)
      if (profilesError) throw profilesError

      const bloodGroupByDonor = new Map(donorProfiles?.map((d) => [d.user_id, d.blood_group]))
      return matches.map((m) => ({ ...m, bloodGroup: bloodGroupByDonor.get(m.donor_id) ?? null }))
    },
    enabled: Boolean(requestId),
  })
}
