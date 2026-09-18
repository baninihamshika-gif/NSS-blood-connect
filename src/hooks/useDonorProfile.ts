import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'

export function useDonorProfile() {
  const { user } = useAuth()

  return useQuery({
    queryKey: ['donor-profile', user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('donor_profiles')
        .select('*')
        .eq('user_id', user!.id)
        .maybeSingle()
      if (error) throw error
      return data
    },
    enabled: Boolean(user),
  })
}
