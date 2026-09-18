import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

export interface FindMatchesResult {
  matchCount: number
  inserted: number
  updated: number
  candidatesConsidered: number
}

/** Invokes the match-donors Edge Function — all scoring/eligibility logic
 * runs server-side; the client only ever sends a requestId. */
export function useFindMatches(requestId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (): Promise<FindMatchesResult> => {
      const { data, error } = await supabase.functions.invoke('match-donors', { body: { requestId } })
      if (error) {
        const context = (error as { context?: Response }).context
        let message = error.message
        try {
          const body = (await context?.clone().json()) as { error?: string } | undefined
          if (body?.error) message = body.error
        } catch {
          // response body wasn't JSON — fall back to error.message
        }
        throw new Error(message)
      }
      return data as FindMatchesResult
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['donor-matches', requestId] })
      queryClient.invalidateQueries({ queryKey: ['blood-request', requestId] })
    },
  })
}
