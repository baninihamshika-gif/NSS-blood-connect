import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

export interface EmergencyCascadeResult {
  done: boolean
  reason?: 'fulfilled' | 'closed' | 'exhausted'
  wave: number | null
  radiusKm?: number
  newMatches?: number
  timedOutExpired: number
}

/** Invokes the emergency-search Edge Function — one cascade "step" per call
 * (notify more donors at the current radius tier, or expand to the next
 * tier, or report done/why). Not auto-polled; the requester drives it. */
export function useEmergencyCascade(requestId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (): Promise<EmergencyCascadeResult> => {
      const { data, error } = await supabase.functions.invoke('emergency-search', { body: { requestId } })
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
      return data as EmergencyCascadeResult
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['donor-matches', requestId] })
      queryClient.invalidateQueries({ queryKey: ['blood-request', requestId] })
      queryClient.invalidateQueries({ queryKey: ['request-status-history', requestId] })
    },
  })
}
