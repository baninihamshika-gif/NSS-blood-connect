// Live integration tests against the DEPLOYED emergency-search Edge
// Function. Uses synthetic donor/request coordinates (1 degree latitude ≈
// 111km at the equator) so radius-tier progression is actually exercised
// now, even though real location-capture UI doesn't exist yet (Phase 8) and
// approx_lat/lng is null for virtually all real data today.
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { adminClient, createTestUser, deleteTestUser, type TestUser } from './setup/testClient'

interface InvokeResult {
  data: Record<string, unknown> | null
  status: number | null
}

async function invokeCascade(user: TestUser, requestId: string): Promise<InvokeResult> {
  const { data, error } = await user.client.functions.invoke('emergency-search', { body: { requestId } })
  if (error) {
    const context = (error as { context?: Response }).context
    return { data: null, status: context?.status ?? null }
  }
  return { data, status: 200 }
}

describe('emergency-search edge function', () => {
  let requester: TestUser
  let requesterB: TestUser
  let donorNear: TestUser // ~5km — within tier 0 (10km)
  let donorMid: TestUser // ~15km — outside tier 0, within tier 1 (25km)
  let donorFar: TestUser // ~40km — outside tier 0/1, within tier 2 (50km)
  let donorTooFar: TestUser // ~100km — outside every tier, must never match

  let requestId: string

  beforeAll(async () => {
    ;[requester, requesterB, donorNear, donorMid, donorFar, donorTooFar] = await Promise.all([
      createTestUser('REQUESTER'),
      createTestUser('REQUESTER'),
      createTestUser('DONOR'),
      createTestUser('DONOR'),
      createTestUser('DONOR'),
      createTestUser('DONOR'),
    ])

    await Promise.all([
      requester.client.from('profiles').insert({ id: requester.id, full_name: 'Cascade Requester', role: 'REQUESTER' }),
      requesterB.client.from('profiles').insert({ id: requesterB.id, full_name: 'Cascade Requester B', role: 'REQUESTER' }),
      donorNear.client.from('profiles').insert({ id: donorNear.id, full_name: 'Donor Near', role: 'DONOR' }),
      donorMid.client.from('profiles').insert({ id: donorMid.id, full_name: 'Donor Mid', role: 'DONOR' }),
      donorFar.client.from('profiles').insert({ id: donorFar.id, full_name: 'Donor Far', role: 'DONOR' }),
      donorTooFar.client.from('profiles').insert({ id: donorTooFar.id, full_name: 'Donor Too Far', role: 'DONOR' }),
    ])

    // 1 degree latitude ~= 111km at the equator. Request sits at (0, 0).
    await Promise.all([
      donorNear.client
        .from('donor_profiles')
        .insert({ user_id: donorNear.id, blood_group: 'O-', availability_status: 'AVAILABLE', approx_lat: 0.045, approx_lng: 0 }), // ~5km
      donorMid.client
        .from('donor_profiles')
        .insert({ user_id: donorMid.id, blood_group: 'O-', availability_status: 'AVAILABLE', approx_lat: 0.135, approx_lng: 0 }), // ~15km
      donorFar.client
        .from('donor_profiles')
        .insert({ user_id: donorFar.id, blood_group: 'O-', availability_status: 'AVAILABLE', approx_lat: 0.36, approx_lng: 0 }), // ~40km
      donorTooFar.client
        .from('donor_profiles')
        .insert({ user_id: donorTooFar.id, blood_group: 'O-', availability_status: 'AVAILABLE', approx_lat: 0.9, approx_lng: 0 }), // ~100km
    ])

    const { data: request } = await requester.client
      .from('blood_requests')
      .insert({
        requester_id: requester.id,
        blood_group: 'O+',
        units_required: 4, // matches the spec's own "CRITICAL O+ — 4 Units" example; unreachable with 3 real candidates, so we can observe exhaustion
        priority: 'CRITICAL',
        request_type: 'EMERGENCY',
        approx_lat: 0,
        approx_lng: 0,
      })
      .select()
      .single()
    requestId = request!.id
  }, 30000)

  afterAll(async () => {
    await Promise.all(
      [requester, requesterB, donorNear, donorMid, donorFar, donorTooFar].map((u) => deleteTestUser(u.id)),
    )
  })

  it('rejects a non-owner from triggering the cascade', async () => {
    const result = await invokeCascade(requesterB, requestId)
    expect(result.status).toBe(403)
  })

  // Assertions below check donor-specific membership rather than exact total
  // counts: this runs against the live, shared project, where other real
  // donors (e.g. a demo account with no location set) legitimately count as
  // "within every tier" too (a null distance is neutral-include by design)
  // and may be matched alongside the ones this test seeded — see the
  // Testing section of the README for why exact counts aren't safe here.

  it('wave 1: the near donor is matched at the first (10km) tier', async () => {
    const result = await invokeCascade(requester, requestId)
    expect(result.status).toBe(200)
    expect(result.data?.done).toBe(false)
    expect(result.data?.wave).toBe(0)
    expect(result.data?.radiusKm).toBe(10)
    expect(result.data?.newMatches as number).toBeGreaterThanOrEqual(1)

    const { data: matches } = await requester.client.from('donor_matches').select('donor_id').eq('request_id', requestId)
    const donorIds = new Set(matches?.map((m) => m.donor_id))
    expect(donorIds.has(donorNear.id)).toBe(true)
    expect(donorIds.has(donorMid.id)).toBe(false)
    expect(donorIds.has(donorFar.id)).toBe(false)
    expect(donorIds.has(donorTooFar.id)).toBe(false)
  })

  it('transitions the request from CREATED to MATCHING, same as match-donors would', async () => {
    const { data } = await requester.client.from('blood_requests').select('status').eq('id', requestId).single()
    expect(data?.status).toBe('MATCHING')
  })

  it('wave 2: expands to the 25km tier and finds the mid-distance donor, without re-matching the near one', async () => {
    const result = await invokeCascade(requester, requestId)
    expect(result.status).toBe(200)
    expect(result.data?.done).toBe(false)
    expect(result.data?.wave).toBe(1)
    expect(result.data?.radiusKm).toBe(25)
    expect(result.data?.newMatches as number).toBeGreaterThanOrEqual(1)

    const { data: matches } = await requester.client.from('donor_matches').select('donor_id').eq('request_id', requestId)
    const donorIds = new Set(matches?.map((m) => m.donor_id))
    expect(donorIds.has(donorNear.id)).toBe(true)
    expect(donorIds.has(donorMid.id)).toBe(true)
    expect(donorIds.has(donorFar.id)).toBe(false)
    expect(donorIds.has(donorTooFar.id)).toBe(false)
  })

  it('wave 3: expands to the 50km tier and finds the far donor', async () => {
    const result = await invokeCascade(requester, requestId)
    expect(result.status).toBe(200)
    expect(result.data?.wave).toBe(2)
    expect(result.data?.radiusKm).toBe(50)
    expect(result.data?.newMatches as number).toBeGreaterThanOrEqual(1)

    const { data: matches } = await requester.client.from('donor_matches').select('donor_id').eq('request_id', requestId)
    const donorIds = new Set(matches?.map((m) => m.donor_id))
    expect(donorIds.has(donorFar.id)).toBe(true)
    expect(donorIds.has(donorTooFar.id)).toBe(false)
  })

  it('is exhausted once every tier is examined — the too-far donor is never matched, at any wave', async () => {
    const result = await invokeCascade(requester, requestId)
    expect(result.status).toBe(200)
    expect(result.data?.done).toBe(true)
    expect(result.data?.reason).toBe('exhausted')

    const { data: matches } = await requester.client.from('donor_matches').select('donor_id').eq('request_id', requestId)
    expect(matches?.some((m) => m.donor_id === donorTooFar.id)).toBe(false)
  })

  it('is idempotent once exhausted: re-invoking creates no new matches and keeps returning exhausted', async () => {
    const { data: before } = await requester.client.from('donor_matches').select('id').eq('request_id', requestId)

    const result = await invokeCascade(requester, requestId)
    expect(result.data?.done).toBe(true)
    expect(result.data?.reason).toBe('exhausted')

    const { data: after } = await requester.client.from('donor_matches').select('id').eq('request_id', requestId)
    expect(after?.length).toBe(before?.length) // no growth
  })

  describe('timeout handling', () => {
    it('expires a NOTIFIED match that has exceeded the wave timeout', async () => {
      const { data: staleMatch } = await adminClient
        .from('donor_matches')
        .select('id')
        .eq('request_id', requestId)
        .eq('donor_id', donorNear.id)
        .single()

      // Backdate created_at past the timeout window directly via service role
      // (not a client-reachable operation) to simulate time having passed.
      await adminClient
        .from('donor_matches')
        .update({ created_at: new Date(Date.now() - 31 * 60 * 1000).toISOString() })
        .eq('id', staleMatch!.id)

      const result = await invokeCascade(requester, requestId)
      expect((result.data?.timedOutExpired as number) ?? 0).toBeGreaterThanOrEqual(1)

      const { data: refetched } = await requester.client
        .from('donor_matches')
        .select('match_status')
        .eq('id', staleMatch!.id)
        .single()
      expect(refetched?.match_status).toBe('EXPIRED')
    })
  })

  describe('stop when fulfilled', () => {
    let fulfillRequestId: string
    let soleDonor: TestUser

    beforeAll(async () => {
      soleDonor = await createTestUser('DONOR')
      await soleDonor.client.from('profiles').insert({ id: soleDonor.id, full_name: 'Sole Donor', role: 'DONOR' })
      await soleDonor.client
        .from('donor_profiles')
        .insert({ user_id: soleDonor.id, blood_group: 'O-', availability_status: 'AVAILABLE', approx_lat: 0.01, approx_lng: 0 })

      const { data: req } = await requester.client
        .from('blood_requests')
        .insert({ requester_id: requester.id, blood_group: 'O+', units_required: 1, approx_lat: 0, approx_lng: 0 })
        .select()
        .single()
      fulfillRequestId = req!.id

      await adminClient.from('blood_requests').update({ status: 'MATCHING' }).eq('id', fulfillRequestId)
      const { data: match } = await adminClient
        .from('donor_matches')
        .insert({ request_id: fulfillRequestId, donor_id: soleDonor.id, match_status: 'NOTIFIED' })
        .select()
        .single()

      // Accept — triggers the Phase 6 auto-fulfillment trigger.
      await soleDonor.client
        .from('donor_responses')
        .insert({ match_id: match!.id, request_id: fulfillRequestId, donor_id: soleDonor.id, response: 'ACCEPTED' })
    }, 15000)

    afterAll(async () => {
      await deleteTestUser(soleDonor.id)
    })

    it('returns done/fulfilled and creates no further matches, even though other compatible donors exist', async () => {
      const result = await invokeCascade(requester, fulfillRequestId)
      expect(result.status).toBe(200)
      expect(result.data?.done).toBe(true)
      expect(result.data?.reason).toBe('fulfilled')

      const { data: matches } = await requester.client.from('donor_matches').select('id').eq('request_id', fulfillRequestId)
      expect(matches).toHaveLength(1) // still just the one accepted donor
    })
  })
}, 90000)
