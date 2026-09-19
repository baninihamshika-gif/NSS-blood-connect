import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { ShieldCheck } from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { useDonorProfile } from '@/hooks/useDonorProfile'
import { useUpdateProfile } from '@/hooks/useUpdateProfile'
import { useUpdateDonorProfile } from '@/hooks/useUpdateDonorProfile'
import { basicProfileSchema, donorDetailsSchema, type BasicProfileFormValues, type DonorDetailsFormValues } from '@/lib/validation/profile'
import { Card } from '@/components/ui/Card'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { Button } from '@/components/ui/Button'
import { ErrorMessage } from '@/components/ui/ErrorMessage'
import { Spinner } from '@/components/ui/Spinner'
import { LocationPicker, type LatLng } from '@/components/map/LocationPicker'

function BasicInfoForm() {
  const { profile } = useAuth()
  const updateProfile = useUpdateProfile()
  const [saved, setSaved] = useState(false)

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<BasicProfileFormValues>({ resolver: zodResolver(basicProfileSchema) })

  useEffect(() => {
    if (profile) {
      reset({
        fullName: profile.full_name,
        phone: profile.phone ?? '',
        city: profile.city ?? '',
        area: profile.area ?? '',
      })
    }
  }, [profile, reset])

  const onSubmit = async (values: BasicProfileFormValues) => {
    setSaved(false)
    await updateProfile.mutateAsync(values)
    setSaved(true)
  }

  return (
    <Card>
      <h2 className="text-lg font-semibold text-gray-900">Basic Information</h2>
      <form className="mt-4 flex flex-col gap-4" onSubmit={handleSubmit(onSubmit)} noValidate>
        {updateProfile.isError && (
          <ErrorMessage
            message={updateProfile.error instanceof Error ? updateProfile.error.message : 'Could not save changes.'}
          />
        )}
        <Input label="Full name" error={errors.fullName?.message} {...register('fullName')} />
        <Input label="Phone" type="tel" error={errors.phone?.message} {...register('phone')} />
        <div className="grid grid-cols-2 gap-3">
          <Input label="City" error={errors.city?.message} {...register('city')} />
          <Input label="Area" error={errors.area?.message} {...register('area')} />
        </div>
        <div className="flex items-center gap-3">
          <Button type="submit" isLoading={updateProfile.isPending}>
            Save changes
          </Button>
          {saved && !updateProfile.isPending && <span className="text-sm text-green-700">Saved.</span>}
        </div>
      </form>
    </Card>
  )
}

function DonorDetailsForm() {
  const { data: donorProfile, isLoading, isError } = useDonorProfile()
  const updateDonorProfile = useUpdateDonorProfile()
  const [saved, setSaved] = useState(false)
  const [location, setLocation] = useState<LatLng | null>(null)

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<DonorDetailsFormValues>({ resolver: zodResolver(donorDetailsSchema) })

  useEffect(() => {
    // Syncing local edit state from an async query result once it arrives —
    // not derived-during-render state (donorProfile is undefined until the
    // query resolves), same justification as the reset() call right below.
    if (donorProfile) {
      reset({
        availabilityStatus: donorProfile.availability_status,
        dateOfBirth: donorProfile.date_of_birth ?? '',
        lastDonationDate: donorProfile.last_donation_date ?? '',
      })
      setLocation(
        donorProfile.approx_lat != null && donorProfile.approx_lng != null
          ? { lat: donorProfile.approx_lat, lng: donorProfile.approx_lng }
          : null,
      )
    }
  }, [donorProfile, reset])

  const onSubmit = async (values: DonorDetailsFormValues) => {
    setSaved(false)
    await updateDonorProfile.mutateAsync({ ...values, approxLat: location?.lat, approxLng: location?.lng })
    setSaved(true)
  }

  if (isLoading) return <Spinner label="Loading donor details…" />
  if (isError) return <ErrorMessage message="Could not load your donor details. Please refresh." />
  if (!donorProfile) {
    return <ErrorMessage title="Donor details missing" message="Your donor record could not be found. Please contact support." />
  }

  return (
    <Card>
      <h2 className="text-lg font-semibold text-gray-900">Donor Details</h2>

      <div className="mt-4 flex flex-col gap-1 rounded-lg bg-gray-50 p-3">
        <p className="text-xs uppercase tracking-wide text-gray-500">Blood Group</p>
        <p className="text-lg font-bold text-gray-900">{donorProfile.blood_group}</p>
        <p className="text-xs text-gray-500">
          Blood group can't be self-edited here — it's a safety-sensitive field. Contact support if this was entered
          incorrectly at registration.
        </p>
      </div>

      <form className="mt-4 flex flex-col gap-4" onSubmit={handleSubmit(onSubmit)} noValidate>
        {updateDonorProfile.isError && (
          <ErrorMessage
            message={
              updateDonorProfile.error instanceof Error ? updateDonorProfile.error.message : 'Could not save changes.'
            }
          />
        )}
        <Select label="Availability" error={errors.availabilityStatus?.message} {...register('availabilityStatus')}>
          <option value="AVAILABLE">Available</option>
          <option value="MAYBE">Maybe</option>
          <option value="UNAVAILABLE">Unavailable</option>
        </Select>
        <Input
          label="Date of birth (optional)"
          type="date"
          error={errors.dateOfBirth?.message}
          {...register('dateOfBirth')}
        />
        <Input
          label="Last donation date (optional)"
          type="date"
          error={errors.lastDonationDate?.message}
          {...register('lastDonationDate')}
        />
        <LocationPicker value={location} onChange={setLocation} label="Approximate location (optional)" />
        <div className="flex items-center gap-3">
          <Button type="submit" isLoading={updateDonorProfile.isPending}>
            Save changes
          </Button>
          {saved && !updateDonorProfile.isPending && <span className="text-sm text-green-700">Saved.</span>}
        </div>
      </form>
    </Card>
  )
}

export function DonorProfilePage() {
  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Your Profile</h1>
        <p className="text-sm text-gray-600">Manage your donor details and availability.</p>
      </div>

      <BasicInfoForm />
      <DonorDetailsForm />

      <Card className="flex items-start gap-3 bg-gray-50">
        <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-gray-500" aria-hidden="true" />
        <div>
          <p className="text-sm font-medium text-gray-900">Your privacy</p>
          <p className="text-sm text-gray-600">
            Your phone number and email are never shown to other users. Your location is only ever shared as an
            approximate area/distance, never exact coordinates. Contact details are shared only through a confirmed
            request flow. Setting your availability to "Unavailable" removes you from active matching.
          </p>
        </div>
      </Card>
    </div>
  )
}
