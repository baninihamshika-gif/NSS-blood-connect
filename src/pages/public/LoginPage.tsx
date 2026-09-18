import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { Card } from '@/components/ui/Card'
import { Input } from '@/components/ui/Input'
import { Button } from '@/components/ui/Button'
import { ErrorMessage } from '@/components/ui/ErrorMessage'
import { useAuth } from '@/hooks/useAuth'
import { loginSchema, type LoginFormValues } from '@/lib/validation/auth'

export function LoginPage() {
  const { login, actionLoading } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [submitError, setSubmitError] = useState<string | null>(null)

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginFormValues>({ resolver: zodResolver(loginSchema) })

  const onSubmit = async (values: LoginFormValues) => {
    setSubmitError(null)
    try {
      const loggedInProfile = await login(values.email, values.password)
      const from = (location.state as { from?: Location })?.from?.pathname
      if (from) {
        navigate(from, { replace: true })
      } else if (loggedInProfile?.role === 'DONOR') {
        navigate('/donor/dashboard', { replace: true })
      } else if (loggedInProfile?.role === 'REQUESTER') {
        navigate('/requester/dashboard', { replace: true })
      } else {
        // No profile row could be resolved (see useAuth's ensureProfile) — send
        // them home rather than to a dashboard we can't pick a role for.
        navigate('/', { replace: true })
      }
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Unable to log in. Please try again.')
    }
  }

  return (
    <div className="mx-auto flex min-h-[70vh] max-w-md flex-col justify-center px-4 py-12">
      <Card>
        <h1 className="text-xl font-bold text-gray-900">Log in</h1>
        <p className="mt-1 text-sm text-gray-600">Welcome back to NSS Blood Connect.</p>

        <form className="mt-6 flex flex-col gap-4" onSubmit={handleSubmit(onSubmit)} noValidate>
          {submitError && <ErrorMessage message={submitError} />}
          <Input
            label="Email"
            type="email"
            autoComplete="email"
            error={errors.email?.message}
            {...register('email')}
          />
          <Input
            label="Password"
            type="password"
            autoComplete="current-password"
            error={errors.password?.message}
            {...register('password')}
          />
          <Button type="submit" isLoading={actionLoading} className="mt-2 w-full">
            Log in
          </Button>
        </form>

        <p className="mt-4 text-center text-sm text-gray-600">
          Don't have an account?{' '}
          <Link to="/register" className="font-medium text-brand-600 hover:underline">
            Register
          </Link>
        </p>
      </Card>
    </div>
  )
}
