import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'

export interface RespondToMatchInput {
  matchId: string
  requestId: string
  response: 'ACCEPTED' | 'DECLINED'
}

/** Inserts the donor's response directly with the final decision — there's
 * no intermediate PENDING donor_responses row (the "pending" state before a
 * decision is represented by the match simply having no response yet).
 * donor_matches.match_status is updated by a DB trigger (see migration 0005)
 * from this insert, not by the client — donor_matches has no client update
 * policy, by design (Phase 1). */
export function useRespondToMatch() {
  const { user } = useAuth()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (input: RespondToMatchInput) => {
      if (!user) throw new Error('Not signed in')
      const { error } = await supabase.from('donor_responses').insert({
        match_id: input.matchId,
        request_id: input.requestId,
        donor_id: user.id,
        response: input.response,
      })
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['incoming-matches', user?.id] })
      queryClient.invalidateQueries({ queryKey: ['donor-matches'] })
    },
  })
}
