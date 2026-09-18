import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'

export function useDonationRecords() {
  const { user } = useAuth()

  return useQuery({
    queryKey: ['donation-records', user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('donation_records')
        .select('*')
        .eq('donor_id', user!.id)
        .order('donation_date', { ascending: false })
      if (error) throw error
      return data
    },
    enabled: Boolean(user),
  })
}
