import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import type { IncomingMatch } from '@/hooks/useIncomingMatches'

/** Scoped to the current donor's own matches, same pattern as
 * useBloodRequestDetails on the requester side. */
export function useIncomingMatchDetails(matchId: string | undefined) {
  const { user } = useAuth()

  return useQuery({
    queryKey: ['incoming-match', matchId],
    queryFn: async (): Promise<IncomingMatch | null> => {
      const { data, error } = await supabase
        .from('donor_matches')
        .select('id, request_id, match_score, distance_km, match_status, created_at, blood_requests(*)')
        .eq('id', matchId!)
        .eq('donor_id', user!.id)
        .maybeSingle()
      if (error) throw error
      return data as unknown as IncomingMatch | null
    },
    enabled: Boolean(user) && Boolean(matchId),
  })
}
