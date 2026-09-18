// End-to-end RLS verification against the live Supabase project (Phase 1 Definition
// of Done: "RLS / Authorization Verified"). Each table's policies are exercised
// through real authenticated clients — exactly what the app's calls look like —
// rather than asserted by reading the SQL. Tests are intentionally sequential
// (not `test.concurrent`) because later tests build on rows earlier tests create;
// see vitest.config.ts's `fileParallelism: false`.
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { adminClient, createTestUser, deleteTestUser, type TestUser } from './setup/testClient'

describe('Row Level Security', () => {
  let donorA: TestUser
  let donorB: TestUser
  let requesterA: TestUser
  let requesterB: TestUser

  let requestAId: string
  let matchAId: string
  let responseAId: string

  beforeAll(async () => {
    ;[donorA, donorB, requesterA, requesterB] = await Promise.all([
      createTestUser('DONOR'),
      createTestUser('DONOR'),
      createTestUser('REQUESTER'),
      createTestUser('REQUESTER'),
    ])
  })

  afterAll(async () => {
    await Promise.all([donorA, donorB, requesterA, requesterB].map((u) => deleteTestUser(u.id)))
  })

  describe('profiles', () => {
    it('lets each user insert their own profile row', async () => {
      const { error: dA } = await donorA.client
        .from('profiles')
        .insert({ id: donorA.id, full_name: 'Donor A', role: 'DONOR' })
      expect(dA).toBeNull()

      const { error: dB } = await donorB.client
        .from('profiles')
        .insert({ id: donorB.id, full_name: 'Donor B', role: 'DONOR' })
      expect(dB).toBeNull()

      const { error: rA } = await requesterA.client
        .from('profiles')
        .insert({ id: requesterA.id, full_name: 'Requester A', role: 'REQUESTER' })
      expect(rA).toBeNull()

      const { error: rB } = await requesterB.client
        .from('profiles')
        .insert({ id: requesterB.id, full_name: 'Requester B', role: 'REQUESTER' })
      expect(rB).toBeNull()
    })

    it('rejects inserting a profile row under a different id', async () => {
      const { error } = await donorA.client
        .from('profiles')
        .insert({ id: donorB.id, full_name: 'Hijack Attempt', role: 'DONOR' })
      expect(error).not.toBeNull()
      expect(error?.code).toBe('42501')
    })

    it('lets a user select their own profile, but not another user\'s (phone/email must not leak)', async () => {
      const { data: own, error } = await donorA.client.from('profiles').select('id, full_name').eq('id', donorA.id)
      expect(error).toBeNull()
      expect(own).toHaveLength(1)

      const { data: other } = await donorA.client.from('profiles').select('id, full_name').eq('id', requesterA.id)
      expect(other).toEqual([])
    })

    it('lets a user update their own profile', async () => {
      const { error } = await donorA.client.from('profiles').update({ city: 'Testville' }).eq('id', donorA.id)
      expect(error).toBeNull()

      const { data } = await donorA.client.from('profiles').select('city').eq('id', donorA.id).single()
      expect(data?.city).toBe('Testville')
    })

    it('silently drops an update to another user\'s profile (RLS filters the row, no error)', async () => {
      const { data } = await donorA.client
        .from('profiles')
        .update({ city: 'Hijacked' })
        .eq('id', requesterA.id)
        .select()
      // RLS on UPDATE filters rows via USING rather than throwing — 0 rows affected is the signal.
      expect(data).toEqual([])

      const { data: unchanged } = await requesterA.client.from('profiles').select('city').eq('id', requesterA.id).single()
      expect(unchanged?.city).not.toBe('Hijacked')
    })
  })

  describe('donor_profiles', () => {
    it('lets a DONOR insert their own donor_profiles row', async () => {
      const { error } = await donorA.client
        .from('donor_profiles')
        .insert({ user_id: donorA.id, blood_group: 'O+', availability_status: 'AVAILABLE' })
      expect(error).toBeNull()

      const { error: errB } = await donorB.client
        .from('donor_profiles')
        .insert({ user_id: donorB.id, blood_group: 'A+', availability_status: 'AVAILABLE' })
      expect(errB).toBeNull()
    })

    it('rejects a REQUESTER inserting a donor_profiles row (current_user_role() gate)', async () => {
      const { error } = await requesterA.client
        .from('donor_profiles')
        .insert({ user_id: requesterA.id, blood_group: 'B+', availability_status: 'AVAILABLE' })
      expect(error).not.toBeNull()
      expect(error?.code).toBe('42501')
    })

    it('rejects inserting a donor_profiles row for another user_id', async () => {
      const { error } = await donorA.client
        .from('donor_profiles')
        .insert({ user_id: donorB.id, blood_group: 'AB-', availability_status: 'AVAILABLE' })
      expect(error).not.toBeNull()
      expect(error?.code).toBe('42501')
    })

    it('lets any authenticated user select donor_profiles (needed for matching/discovery)', async () => {
      const { data, error } = await requesterA.client.from('donor_profiles').select('blood_group').eq('user_id', donorA.id)
      expect(error).toBeNull()
      expect(data).toHaveLength(1)
    })

    it('lets a donor update their own donor_profiles row, but not another donor\'s', async () => {
      const { error } = await donorA.client
        .from('donor_profiles')
        .update({ availability_status: 'MAYBE' })
        .eq('user_id', donorA.id)
      expect(error).toBeNull()

      const { data: hijackAttempt } = await donorA.client
        .from('donor_profiles')
        .update({ availability_status: 'UNAVAILABLE' })
        .eq('user_id', donorB.id)
        .select()
      expect(hijackAttempt).toEqual([])
    })

    it('rejects a future last_donation_date or date_of_birth at the database level (defense in depth beyond client validation)', async () => {
      const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10)

      const { error: futureDonation } = await donorA.client
        .from('donor_profiles')
        .update({ last_donation_date: tomorrow })
        .eq('user_id', donorA.id)
      expect(futureDonation).not.toBeNull()
      expect(futureDonation?.code).toBe('23514') // check_violation

      const { error: futureDob } = await donorA.client
        .from('donor_profiles')
        .update({ date_of_birth: tomorrow })
        .eq('user_id', donorA.id)
      expect(futureDob).not.toBeNull()
      expect(futureDob?.code).toBe('23514')
    })
  })

  describe('blood_requests', () => {
    it('lets a REQUESTER insert their own blood_requests row', async () => {
      const { data, error } = await requesterA.client
        .from('blood_requests')
        .insert({ requester_id: requesterA.id, blood_group: 'O+', units_required: 2, priority: 'CRITICAL' })
        .select()
        .single()
      expect(error).toBeNull()
      expect(data?.id).toBeTruthy()
      requestAId = data!.id
    })

    it('rejects a DONOR inserting a blood_requests row (current_user_role() gate)', async () => {
      const { error } = await donorA.client
        .from('blood_requests')
        .insert({ requester_id: donorA.id, blood_group: 'O+', units_required: 1 })
      expect(error).not.toBeNull()
      expect(error?.code).toBe('42501')
    })

    it('rejects inserting a blood_requests row under a different requester_id', async () => {
      const { error } = await requesterA.client
        .from('blood_requests')
        .insert({ requester_id: requesterB.id, blood_group: 'A-', units_required: 1 })
      expect(error).not.toBeNull()
      expect(error?.code).toBe('42501')
    })

    it('lets any authenticated user select blood_requests (donors must see active requests)', async () => {
      const { data, error } = await donorA.client.from('blood_requests').select('id').eq('id', requestAId)
      expect(error).toBeNull()
      expect(data).toHaveLength(1)
    })

    it('lets the owning requester update their request, but not another requester', async () => {
      const { error } = await requesterA.client
        .from('blood_requests')
        .update({ status: 'MATCHING' })
        .eq('id', requestAId)
      expect(error).toBeNull()

      const { data: hijackAttempt } = await requesterB.client
        .from('blood_requests')
        .update({ status: 'CANCELLED' })
        .eq('id', requestAId)
        .select()
      expect(hijackAttempt).toEqual([])

      const { data: unchanged } = await requesterA.client.from('blood_requests').select('status').eq('id', requestAId).single()
      expect(unchanged?.status).toBe('MATCHING')
    })

    it('rejects units_required outside 1-50 at the database level (Phase 3 form validation is defense in depth, not the boundary)', async () => {
      const { error: zeroUnits } = await requesterA.client
        .from('blood_requests')
        .insert({ requester_id: requesterA.id, blood_group: 'O+', units_required: 0 })
      expect(zeroUnits).not.toBeNull()
      expect(zeroUnits?.code).toBe('23514')

      const { error: tooManyUnits } = await requesterA.client
        .from('blood_requests')
        .insert({ requester_id: requesterA.id, blood_group: 'O+', units_required: 51 })
      expect(tooManyUnits).not.toBeNull()
      expect(tooManyUnits?.code).toBe('23514')
    })
  })

  describe('donor_matches (writes reserved for trusted server-side logic)', () => {
    it('rejects a client inserting a donor_matches row directly, even for their own request/donor pair', async () => {
      const { error: fromDonor } = await donorA.client
        .from('donor_matches')
        .insert({ request_id: requestAId, donor_id: donorA.id })
      expect(fromDonor).not.toBeNull()

      const { error: fromRequester } = await requesterA.client
        .from('donor_matches')
        .insert({ request_id: requestAId, donor_id: donorA.id })
      expect(fromRequester).not.toBeNull()
    })

    it('seeds a match via the service-role client (stand-in for the Phase 4 matching engine)', async () => {
      const { data, error } = await adminClient
        .from('donor_matches')
        .insert({ request_id: requestAId, donor_id: donorA.id, match_score: 91.5, distance_km: 2.4 })
        .select()
        .single()
      expect(error).toBeNull()
      matchAId = data!.id
    })

    it('rejects a duplicate match for the same (request, donor) pair — duplicate-match prevention', async () => {
      const { error } = await adminClient.from('donor_matches').insert({ request_id: requestAId, donor_id: donorA.id })
      expect(error).not.toBeNull()
      expect(error?.code).toBe('23505') // unique_violation
    })

    it('lets the matched donor and the owning requester select the match; blocks unrelated users', async () => {
      const { data: asDonor } = await donorA.client.from('donor_matches').select('id').eq('id', matchAId)
      expect(asDonor).toHaveLength(1)

      const { data: asRequester } = await requesterA.client.from('donor_matches').select('id').eq('id', matchAId)
      expect(asRequester).toHaveLength(1)

      const { data: asUnrelatedDonor } = await donorB.client.from('donor_matches').select('id').eq('id', matchAId)
      expect(asUnrelatedDonor).toEqual([])

      const { data: asUnrelatedRequester } = await requesterB.client.from('donor_matches').select('id').eq('id', matchAId)
      expect(asUnrelatedRequester).toEqual([])
    })
  })

  describe('donor_responses', () => {
    it('rejects a donor inserting a response for a match that is not theirs', async () => {
      const { error } = await donorB.client
        .from('donor_responses')
        .insert({ match_id: matchAId, request_id: requestAId, donor_id: donorB.id })
      expect(error).not.toBeNull()
    })

    it('lets the matched donor insert their own response for their own match', async () => {
      const { data, error } = await donorA.client
        .from('donor_responses')
        .insert({ match_id: matchAId, request_id: requestAId, donor_id: donorA.id, response: 'ACCEPTED' })
        .select()
        .single()
      expect(error).toBeNull()
      responseAId = data!.id
    })

    it('rejects a second response row for the same match — duplicate-response prevention', async () => {
      const { error } = await donorA.client
        .from('donor_responses')
        .insert({ match_id: matchAId, request_id: requestAId, donor_id: donorA.id })
      expect(error).not.toBeNull()
      expect(error?.code).toBe('23505')
    })

    it('lets the donor and the owning requester select the response; blocks unrelated users', async () => {
      const { data: asDonor } = await donorA.client.from('donor_responses').select('id').eq('id', responseAId)
      expect(asDonor).toHaveLength(1)

      const { data: asRequester } = await requesterA.client.from('donor_responses').select('id').eq('id', responseAId)
      expect(asRequester).toHaveLength(1)

      const { data: asUnrelated } = await donorB.client.from('donor_responses').select('id').eq('id', responseAId)
      expect(asUnrelated).toEqual([])
    })

    it('lets the donor update their own response, but not another donor\'s response', async () => {
      const { error } = await donorA.client
        .from('donor_responses')
        .update({ response: 'DECLINED' })
        .eq('id', responseAId)
      expect(error).toBeNull()

      const { data: hijackAttempt } = await donorB.client
        .from('donor_responses')
        .update({ response: 'ACCEPTED' })
        .eq('id', responseAId)
        .select()
      expect(hijackAttempt).toEqual([])
    })
  })

  describe('donation_records', () => {
    it('lets a donor insert their own donation_records row', async () => {
      const { error } = await donorA.client.from('donation_records').insert({
        donor_id: donorA.id,
        request_id: requestAId,
        donation_date: new Date().toISOString().slice(0, 10),
        units: 1,
      })
      expect(error).toBeNull()
    })

    it('rejects inserting a donation_records row under another donor_id', async () => {
      const { error } = await donorA.client.from('donation_records').insert({
        donor_id: donorB.id,
        donation_date: new Date().toISOString().slice(0, 10),
        units: 1,
      })
      expect(error).not.toBeNull()
    })

    it('lets the donor and the related request\'s requester select it; blocks unrelated users', async () => {
      const { data: asDonor } = await donorA.client.from('donation_records').select('id').eq('donor_id', donorA.id)
      expect(asDonor?.length).toBeGreaterThan(0)

      const { data: asRequester } = await requesterA.client
        .from('donation_records')
        .select('id')
        .eq('donor_id', donorA.id)
      expect(asRequester?.length).toBeGreaterThan(0)

      const { data: asUnrelated } = await donorB.client.from('donation_records').select('id').eq('donor_id', donorA.id)
      expect(asUnrelated).toEqual([])
    })
  })

  describe('request_status_history (append-only audit trail; no client writes)', () => {
    it('rejects a client inserting a status history row directly', async () => {
      const { error } = await requesterA.client
        .from('request_status_history')
        .insert({ request_id: requestAId, status: 'FULFILLED' })
      expect(error).not.toBeNull()
    })

    it('seeds a history row via the service-role client (stand-in for Phase 6 logic)', async () => {
      const { error } = await adminClient
        .from('request_status_history')
        .insert({ request_id: requestAId, status: 'MATCHING', notes: 'seeded for RLS test' })
      expect(error).toBeNull()
    })

    it('lets the owning requester and matched donor select history; blocks unrelated users', async () => {
      const { data: asRequester } = await requesterA.client
        .from('request_status_history')
        .select('id')
        .eq('request_id', requestAId)
      expect(asRequester?.length).toBeGreaterThan(0)

      const { data: asDonor } = await donorA.client
        .from('request_status_history')
        .select('id')
        .eq('request_id', requestAId)
      expect(asDonor?.length).toBeGreaterThan(0)

      const { data: asUnrelated } = await requesterB.client
        .from('request_status_history')
        .select('id')
        .eq('request_id', requestAId)
      expect(asUnrelated).toEqual([])
    })
  })

  describe('notifications (writes reserved for trusted server-side logic)', () => {
    let notificationId: string

    it('rejects a client inserting their own notification directly', async () => {
      const { error } = await donorA.client
        .from('notifications')
        .insert({ user_id: donorA.id, type: 'TEST', title: 'Hi', message: 'Hi' })
      expect(error).not.toBeNull()
    })

    it('seeds a notification via the service-role client (stand-in for Phase 5+ logic)', async () => {
      const { data, error } = await adminClient
        .from('notifications')
        .insert({ user_id: donorA.id, type: 'MATCH_REQUEST', title: 'New request nearby', message: 'O+ needed' })
        .select()
        .single()
      expect(error).toBeNull()
      notificationId = data!.id
    })

    it('lets the owner select their notification; blocks everyone else', async () => {
      const { data: asOwner } = await donorA.client.from('notifications').select('id').eq('id', notificationId)
      expect(asOwner).toHaveLength(1)

      const { data: asOther } = await donorB.client.from('notifications').select('id').eq('id', notificationId)
      expect(asOther).toEqual([])
    })

    it('lets the owner mark their notification read, but blocks another user from doing so', async () => {
      const { data: hijackAttempt } = await donorB.client
        .from('notifications')
        .update({ is_read: true })
        .eq('id', notificationId)
        .select()
      expect(hijackAttempt).toEqual([])

      const { error } = await donorA.client.from('notifications').update({ is_read: true }).eq('id', notificationId)
      expect(error).toBeNull()

      const { data } = await donorA.client.from('notifications').select('is_read').eq('id', notificationId).single()
      expect(data?.is_read).toBe(true)
    })
  })

  describe('unauthenticated access', () => {
    it('returns no rows from sensitive tables for an unauthenticated (anon) client', async () => {
      const { createClient } = await import('@supabase/supabase-js')
      const anonClient = createClient(process.env.VITE_SUPABASE_URL!, process.env.VITE_SUPABASE_PUBLISHABLE_KEY!)

      const { data: notifications } = await anonClient.from('notifications').select('id')
      expect(notifications).toEqual([])

      const { data: responses } = await anonClient.from('donor_responses').select('id')
      expect(responses).toEqual([])

      const { data: matches } = await anonClient.from('donor_matches').select('id')
      expect(matches).toEqual([])
    })
  })
})
