import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import type { BloodRequest, MatchStatus } from '@/types/database'

export interface IncomingMatch {
  id: string
  request_id: string
  match_score: number | null
  distance_km: number | null
  match_status: MatchStatus
  created_at: string
  blood_requests: BloodRequest
}

/** donor_matches.request_id has a real FK to blood_requests(id), so Postgrest
 * can auto-embed it in one query (unlike the donor_matches <-> donor_profiles
 * pairing used elsewhere, which has no direct FK and needs two queries). */
export function useIncomingMatches() {
  const { user } = useAuth()

  return useQuery({
    queryKey: ['incoming-matches', user?.id],
    queryFn: async (): Promise<IncomingMatch[]> => {
      const { data, error } = await supabase
        .from('donor_matches')
        .select('id, request_id, match_score, distance_km, match_status, created_at, blood_requests(*)')
        .eq('donor_id', user!.id)
        .order('created_at', { ascending: false })
      if (error) throw error
      // Our hand-maintained Database type (see src/types/database.ts) doesn't
      // model table relationships, so supabase-js can't infer the shape of
      // an embedded `blood_requests(*)` select — cast is the documented
      // workaround, not an unnoticed type hole.
      return (data ?? []) as unknown as IncomingMatch[]
    },
    enabled: Boolean(user),
  })
}
