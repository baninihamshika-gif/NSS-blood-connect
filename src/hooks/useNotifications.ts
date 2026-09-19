import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { useRealtimeInvalidate } from '@/hooks/useRealtimeInvalidate'

const RECENT_LIMIT = 20

export function useNotifications() {
  const { user } = useAuth()

  useRealtimeInvalidate({
    channelName: `notifications:${user?.id ?? 'anon'}`,
    table: 'notifications',
    filter: user ? `user_id=eq.${user.id}` : undefined,
    queryKeys: [['notifications', user?.id]],
    enabled: Boolean(user),
  })

  return useQuery({
    queryKey: ['notifications', user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('notifications')
        .select('*')
        .eq('user_id', user!.id)
        .order('created_at', { ascending: false })
        .limit(RECENT_LIMIT)
      if (error) throw error
      return data
    },
    enabled: Boolean(user),
  })
}

export function useMarkNotificationRead() {
  const { user } = useAuth()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (notificationId: string) => {
      const { error } = await supabase.from('notifications').update({ is_read: true }).eq('id', notificationId)
      if (error) throw error
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['notifications', user?.id] }),
  })
}

export function useMarkAllNotificationsRead() {
  const { user } = useAuth()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async () => {
      if (!user) throw new Error('Not signed in')
      const { error } = await supabase.from('notifications').update({ is_read: true }).eq('user_id', user.id).eq('is_read', false)
      if (error) throw error
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['notifications', user?.id] }),
  })
}
