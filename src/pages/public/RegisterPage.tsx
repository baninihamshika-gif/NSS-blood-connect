import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { Card } from '@/components/ui/Card'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { Button } from '@/components/ui/Button'
import { ErrorMessage } from '@/components/ui/ErrorMessage'
import { useAuth } from '@/hooks/useAuth'
import { registerSchema, type RegisterFormValues } from '@/lib/validation/auth'
import { BLOOD_GROUPS } from '@/constants'
import type { UserRole } from '@/types/database'

export function RegisterPage() {
  const { register: registerUser, actionLoading } = useAuth()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [confirmationSent, setConfirmationSent] = useState(false)

  const defaultRole: UserRole = searchParams.get('role') === 'DONOR' ? 'DONOR' : 'REQUESTER'

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors },
  } = useForm<RegisterFormValues>({
    resolver: zodResolver(registerSchema),
    defaultValues: { role: defaultRole },
  })

  const role = watch('role')

  const onSubmit = async (values: RegisterFormValues) => {
    setSubmitError(null)
    try {
      const hasSession = await registerUser({
        email: values.email,
        password: values.password,
        fullName: values.fullName,
        role: values.role,
        phone: values.phone || undefined,
        city: values.city || undefined,
        area: values.area || undefined,
        bloodGroup: values.role === 'DONOR' ? values.bloodGroup : undefined,
      })
      if (hasSession) {
        navigate(values.role === 'DONOR' ? '/donor/dashboard' : '/requester/dashboard', { replace: true })
      } else {
        setConfirmationSent(true)
      }
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Unable to register. Please try again.')
    }
  }

  if (confirmationSent) {
    return (
      <div className="mx-auto max-w-md px-4 py-16 text-center">
        <Card>
          <h1 className="text-xl font-bold text-gray-900">Check your email</h1>
          <p className="mt-2 text-sm text-gray-600">
            We sent a confirmation link to finish setting up your account. Once confirmed, log in to continue.
          </p>
          <Link to="/login" className="mt-4 inline-block text-sm font-medium text-brand-600 hover:underline">
            Go to login
          </Link>
        </Card>
      </div>
    )
  }

  return (
    <div className="mx-auto flex max-w-md flex-col justify-center px-4 py-12">
      <Card>
        <h1 className="text-xl font-bold text-gray-900">Create your account</h1>
        <p className="mt-1 text-sm text-gray-600">Join as a donor or a requester.</p>

        <form className="mt-6 flex flex-col gap-4" onSubmit={handleSubmit(onSubmit)} noValidate>
          {submitError && <ErrorMessage message={submitError} />}

          <div>
            <span className="text-sm font-medium text-gray-700">I am a...</span>
            <div className="mt-2 grid grid-cols-2 gap-2">
              <label
                className={`flex cursor-pointer items-center justify-center rounded-lg border px-3 py-2 text-sm font-medium ${
                  role === 'REQUESTER' ? 'border-brand-500 bg-brand-50 text-brand-700' : 'border-gray-300 text-gray-600'
                }`}
              >
                <input type="radio" value="REQUESTER" className="sr-only" {...register('role')} />
                Requester
              </label>
              <label
                className={`flex cursor-pointer items-center justify-center rounded-lg border px-3 py-2 text-sm font-medium ${
                  role === 'DONOR' ? 'border-brand-500 bg-brand-50 text-brand-700' : 'border-gray-300 text-gray-600'
                }`}
              >
                <input type="radio" value="DONOR" className="sr-only" {...register('role')} />
                Donor
              </label>
            </div>
          </div>

          <Input label="Full name" error={errors.fullName?.message} {...register('fullName')} />
          <Input label="Email" type="email" autoComplete="email" error={errors.email?.message} {...register('email')} />
          <Input
            label="Password"
            type="password"
            autoComplete="new-password"
            error={errors.password?.message}
            {...register('password')}
          />
          <Input
            label="Confirm password"
            type="password"
            autoComplete="new-password"
            error={errors.confirmPassword?.message}
            {...register('confirmPassword')}
          />
          <Input label="Phone (optional)" type="tel" error={errors.phone?.message} {...register('phone')} />
          <div className="grid grid-cols-2 gap-3">
            <Input label="City (optional)" error={errors.city?.message} {...register('city')} />
            <Input label="Area (optional)" error={errors.area?.message} {...register('area')} />
          </div>

          {role === 'DONOR' && (
            <Select label="Blood group" error={errors.bloodGroup?.message} defaultValue="" {...register('bloodGroup')}>
              <option value="" disabled>
                Select blood group
              </option>
              {BLOOD_GROUPS.map((group) => (
                <option key={group} value={group}>
                  {group}
                </option>
              ))}
            </Select>
          )}

          <Button type="submit" isLoading={actionLoading} className="mt-2 w-full">
            Create account
          </Button>
        </form>

        <p className="mt-4 text-center text-sm text-gray-600">
          Already have an account?{' '}
          <Link to="/login" className="font-medium text-brand-600 hover:underline">
            Log in
          </Link>
        </p>
      </Card>
    </div>
  )
}
