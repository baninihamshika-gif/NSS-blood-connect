// Live tests against the real database for Phase 6: the blood_requests
// status state machine (migration 0006) — invalid-transition rejection,
// automatic audit history, automatic fulfillment progression from donor
// acceptances, and automatic donation_records creation on completion.
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { adminClient, createTestUser, deleteTestUser, type TestUser } from './setup/testClient'

describe('blood_requests status state machine', () => {
  let requester: TestUser
  let donorA: TestUser
  let donorB: TestUser

  beforeAll(async () => {
    ;[requester, donorA, donorB] = await Promise.all([
      createTestUser('REQUESTER'),
      createTestUser('DONOR'),
      createTestUser('DONOR'),
    ])
    await Promise.all([
      requester.client.from('profiles').insert({ id: requester.id, full_name: 'State Machine Requester', role: 'REQUESTER' }),
      donorA.client.from('profiles').insert({ id: donorA.id, full_name: 'State Machine Donor A', role: 'DONOR' }),
      donorB.client.from('profiles').insert({ id: donorB.id, full_name: 'State Machine Donor B', role: 'DONOR' }),
    ])
    await Promise.all([
      donorA.client.from('donor_profiles').insert({ user_id: donorA.id, blood_group: 'O-', availability_status: 'AVAILABLE' }),
      donorB.client.from('donor_profiles').insert({ user_id: donorB.id, blood_group: 'O-', availability_status: 'AVAILABLE' }),
    ])
  }, 30000)

  afterAll(async () => {
    await Promise.all([requester, donorA, donorB].map((u) => deleteTestUser(u.id)))
  })

  describe('transition validation', () => {
    let requestId: string

    beforeAll(async () => {
      const { data } = await requester.client
        .from('blood_requests')
        .insert({ requester_id: requester.id, blood_group: 'O+', units_required: 1 })
        .select()
        .single()
      requestId = data!.id
    })

    it('rejects a client setting status to a system-only value (e.g. MATCHING), even though it would be a legal edge for service role', async () => {
      const { error } = await requester.client.from('blood_requests').update({ status: 'MATCHING' }).eq('id', requestId)
      expect(error).not.toBeNull()
      expect(error?.code).toBe('42501')
    })

    it('rejects an illegal edge even for service role (CREATED -> COMPLETED skips the whole graph)', async () => {
      const { error } = await adminClient.from('blood_requests').update({ status: 'COMPLETED' }).eq('id', requestId)
      expect(error).not.toBeNull()
    })

    it('allows a legal client-initiated transition: CREATED -> CANCELLED', async () => {
      const { error } = await requester.client.from('blood_requests').update({ status: 'CANCELLED' }).eq('id', requestId)
      expect(error).toBeNull()

      const { data } = await requester.client.from('blood_requests').select('status').eq('id', requestId).single()
      expect(data?.status).toBe('CANCELLED')
    })

    it('rejects any transition out of a terminal state', async () => {
      const { error } = await requester.client.from('blood_requests').update({ status: 'CREATED' }).eq('id', requestId)
      expect(error).not.toBeNull()
    })

    it('auto-logged the CREATED -> CANCELLED transition in request_status_history', async () => {
      const { data } = await requester.client
        .from('request_status_history')
        .select('status, changed_by')
        .eq('request_id', requestId)
        .eq('status', 'CANCELLED')
      expect(data).toHaveLength(1)
      expect(data?.[0]?.changed_by).toBe(requester.id)
    })
  })

  describe('automatic fulfillment progression', () => {
    let requestId: string
    let matchAId: string
    let matchBId: string

    beforeAll(async () => {
      const { data: request } = await requester.client
        .from('blood_requests')
        .insert({ requester_id: requester.id, blood_group: 'O+', units_required: 2 })
        .select()
        .single()
      requestId = request!.id

      // Service role stands in for match-donors — sets MATCHING (a
      // system-only transition) and seeds two matches, same as Phase 4/5.
      await adminClient.from('blood_requests').update({ status: 'MATCHING' }).eq('id', requestId)
      const { data: matchA } = await adminClient
        .from('donor_matches')
        .insert({ request_id: requestId, donor_id: donorA.id, match_status: 'NOTIFIED' })
        .select()
        .single()
      matchAId = matchA!.id
      const { data: matchB } = await adminClient
        .from('donor_matches')
        .insert({ request_id: requestId, donor_id: donorB.id, match_status: 'NOTIFIED' })
        .select()
        .single()
      matchBId = matchB!.id
    }, 15000)

    it('moves to PARTIALLY_FULFILLED when one of two required donors accepts', async () => {
      const { error } = await donorA.client
        .from('donor_responses')
        .insert({ match_id: matchAId, request_id: requestId, donor_id: donorA.id, response: 'ACCEPTED' })
      expect(error).toBeNull()

      const { data } = await requester.client.from('blood_requests').select('status').eq('id', requestId).single()
      expect(data?.status).toBe('PARTIALLY_FULFILLED')
    })

    it('moves to FULFILLED once accepted donors cover units_required', async () => {
      const { error } = await donorB.client
        .from('donor_responses')
        .insert({ match_id: matchBId, request_id: requestId, donor_id: donorB.id, response: 'ACCEPTED' })
      expect(error).toBeNull()

      const { data } = await requester.client.from('blood_requests').select('status').eq('id', requestId).single()
      expect(data?.status).toBe('FULFILLED')
    })

    it('lets the requester complete a FULFILLED request, which creates donation_records for each accepted donor', async () => {
      const { error } = await requester.client.from('blood_requests').update({ status: 'COMPLETED' }).eq('id', requestId)
      expect(error).toBeNull()

      const { data: recordA } = await donorA.client
        .from('donation_records')
        .select('id, status, units')
        .eq('donor_id', donorA.id)
        .eq('request_id', requestId)
      expect(recordA).toHaveLength(1)
      expect(recordA?.[0]?.status).toBe('COMPLETED')

      const { data: recordB } = await donorB.client
        .from('donation_records')
        .select('id, status')
        .eq('donor_id', donorB.id)
        .eq('request_id', requestId)
      expect(recordB).toHaveLength(1)
    })

    it('is terminal: COMPLETED cannot transition anywhere else', async () => {
      const { error } = await requester.client.from('blood_requests').update({ status: 'CANCELLED' }).eq('id', requestId)
      expect(error).not.toBeNull()
    })
  })
}, 60000)
