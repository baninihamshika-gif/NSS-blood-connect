import { DatabaseZap } from 'lucide-react'

export function MissingSupabaseConfig() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4">
      <div className="max-w-md rounded-xl border border-amber-200 bg-amber-50 p-6 text-center">
        <DatabaseZap className="mx-auto mb-3 h-8 w-8 text-amber-600" aria-hidden="true" />
        <h1 className="text-lg font-semibold text-amber-900">Supabase is not configured</h1>
        <p className="mt-2 text-sm text-amber-800">
          Copy <code className="rounded bg-amber-100 px-1 py-0.5">.env.example</code> to{' '}
          <code className="rounded bg-amber-100 px-1 py-0.5">.env</code> and set{' '}
          <code className="rounded bg-amber-100 px-1 py-0.5">VITE_SUPABASE_URL</code> and{' '}
          <code className="rounded bg-amber-100 px-1 py-0.5">VITE_SUPABASE_PUBLISHABLE_KEY</code>{' '}
          from your Supabase project's API settings, then restart the dev server.
        </p>
      </div>
    </div>
  )
}
