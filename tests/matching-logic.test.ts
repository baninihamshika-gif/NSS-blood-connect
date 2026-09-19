import { describe, expect, it } from 'vitest'
import {
  calculateDistanceKm,
  calculateMatchScore,
  CASCADE_WAVE_TIMEOUT_MINUTES,
  EMERGENCY_CASCADE_RADII_KM,
  isBloodGroupCompatible,
  isNotifiedMatchTimedOut,
  isWithinEligibilityWindow,
  isWithinRadius,
  MATCH_WEIGHTS,
  MAX_MATCH_DISTANCE_KM,
  MIN_DAYS_SINCE_LAST_DONATION,
  nextCascadeTierIndex,
  type BloodGroup,
} from '../supabase/functions/_shared/matching-logic'

const ALL_GROUPS: BloodGroup[] = ['A+', 'A-', 'B+', 'B-', 'O+', 'O-', 'AB+', 'AB-']

describe('isBloodGroupCompatible', () => {
  it('O- is a universal donor (compatible with every recipient group)', () => {
    for (const recipient of ALL_GROUPS) {
      expect(isBloodGroupCompatible('O-', recipient)).toBe(true)
    }
  })

  it('AB+ can only donate to AB+ recipients', () => {
    for (const recipient of ALL_GROUPS) {
      expect(isBloodGroupCompatible('AB+', recipient)).toBe(recipient === 'AB+')
    }
  })

  it('every group can donate to itself', () => {
    for (const group of ALL_GROUPS) {
      expect(isBloodGroupCompatible(group, group)).toBe(true)
    }
  })

  it('rejects a known-incompatible pair (A+ donor cannot give to B- recipient)', () => {
    expect(isBloodGroupCompatible('A+', 'B-')).toBe(false)
  })

  it('Rh-positive donor cannot give to Rh-negative recipient of the same ABO group', () => {
    expect(isBloodGroupCompatible('A+', 'A-')).toBe(false)
    expect(isBloodGroupCompatible('B+', 'B-')).toBe(false)
    expect(isBloodGroupCompatible('O+', 'O-')).toBe(false)
    expect(isBloodGroupCompatible('AB+', 'AB-')).toBe(false)
  })

  it('Rh-negative donor CAN give to Rh-positive recipient of the same ABO group', () => {
    expect(isBloodGroupCompatible('A-', 'A+')).toBe(true)
    expect(isBloodGroupCompatible('B-', 'B+')).toBe(true)
    expect(isBloodGroupCompatible('O-', 'O+')).toBe(true)
    expect(isBloodGroupCompatible('AB-', 'AB+')).toBe(true)
  })
})

describe('isWithinEligibilityWindow', () => {
  const asOf = new Date('2026-06-01T00:00:00Z')

  it('treats no donation history as eligible', () => {
    expect(isWithinEligibilityWindow(null, asOf)).toBe(true)
  })

  it('is ineligible the day after the last donation', () => {
    expect(isWithinEligibilityWindow('2026-05-31', asOf)).toBe(false)
  })

  it('is ineligible one day before the window closes', () => {
    const oneDayShort = new Date(asOf)
    oneDayShort.setUTCDate(oneDayShort.getUTCDate() - (MIN_DAYS_SINCE_LAST_DONATION - 1))
    const dateStr = oneDayShort.toISOString().slice(0, 10)
    expect(isWithinEligibilityWindow(dateStr, asOf)).toBe(false)
  })

  it('is eligible exactly at the boundary (MIN_DAYS_SINCE_LAST_DONATION days ago)', () => {
    const exactBoundary = new Date(asOf)
    exactBoundary.setUTCDate(exactBoundary.getUTCDate() - MIN_DAYS_SINCE_LAST_DONATION)
    const dateStr = exactBoundary.toISOString().slice(0, 10)
    expect(isWithinEligibilityWindow(dateStr, asOf)).toBe(true)
  })

  it('is eligible well beyond the window', () => {
    expect(isWithinEligibilityWindow('2020-01-01', asOf)).toBe(true)
  })
})

describe('calculateDistanceKm', () => {
  it('returns 0 for identical coordinates', () => {
    expect(calculateDistanceKm(12.9716, 77.5946, 12.9716, 77.5946)).toBeCloseTo(0, 5)
  })

  it('returns a sensible positive distance for two known points (~roughly correct magnitude)', () => {
    // Bangalore to Chennai, actual distance is ~290km
    const km = calculateDistanceKm(12.9716, 77.5946, 13.0827, 80.2707)
    expect(km).toBeGreaterThan(250)
    expect(km).toBeLessThan(330)
  })

  it('is symmetric', () => {
    const a = calculateDistanceKm(12.9716, 77.5946, 13.0827, 80.2707)
    const b = calculateDistanceKm(13.0827, 80.2707, 12.9716, 77.5946)
    expect(a).toBeCloseTo(b, 6)
  })
})

describe('calculateMatchScore', () => {
  const asOf = new Date('2026-06-01T00:00:00Z')

  it('scores a maximally-favorable candidate near 100', () => {
    const score = calculateMatchScore({
      distanceKm: 0,
      availabilityStatus: 'AVAILABLE',
      lastDonationDate: null,
      acceptedResponseCount: 10,
      totalResponseCount: 10,
      asOf,
    })
    expect(score).toBe(100)
  })

  it('scores a maximally-unfavorable-but-still-candidate near 0', () => {
    const score = calculateMatchScore({
      distanceKm: MAX_MATCH_DISTANCE_KM,
      availabilityStatus: 'MAYBE',
      lastDonationDate: '2026-03-03', // exactly at eligibility boundary from asOf
      acceptedResponseCount: 0,
      totalResponseCount: 10,
      asOf,
    })
    // availability=MAYBE contributes half its weight, so this isn't literally 0.
    expect(score).toBeGreaterThanOrEqual(0)
    expect(score).toBeLessThan(30)
  })

  it('never exceeds 100 or drops below 0 across a range of inputs', () => {
    const distances = [0, 5, 25, 50, 100, null]
    const statuses: Array<'AVAILABLE' | 'MAYBE' | 'UNAVAILABLE'> = ['AVAILABLE', 'MAYBE', 'UNAVAILABLE']
    for (const distanceKm of distances) {
      for (const availabilityStatus of statuses) {
        const score = calculateMatchScore({
          distanceKm,
          availabilityStatus,
          lastDonationDate: null,
          acceptedResponseCount: 3,
          totalResponseCount: 5,
          asOf,
        })
        expect(score).toBeGreaterThanOrEqual(0)
        expect(score).toBeLessThanOrEqual(100)
      }
    }
  })

  it('gives a closer donor a strictly higher score than a farther one, all else equal', () => {
    const near = calculateMatchScore({
      distanceKm: 2,
      availabilityStatus: 'AVAILABLE',
      lastDonationDate: null,
      acceptedResponseCount: 5,
      totalResponseCount: 5,
      asOf,
    })
    const far = calculateMatchScore({
      distanceKm: 40,
      availabilityStatus: 'AVAILABLE',
      lastDonationDate: null,
      acceptedResponseCount: 5,
      totalResponseCount: 5,
      asOf,
    })
    expect(near).toBeGreaterThan(far)
  })

  it('gives an AVAILABLE donor a strictly higher score than a MAYBE donor, all else equal', () => {
    const available = calculateMatchScore({
      distanceKm: 10,
      availabilityStatus: 'AVAILABLE',
      lastDonationDate: null,
      acceptedResponseCount: 5,
      totalResponseCount: 5,
      asOf,
    })
    const maybe = calculateMatchScore({
      distanceKm: 10,
      availabilityStatus: 'MAYBE',
      lastDonationDate: null,
      acceptedResponseCount: 5,
      totalResponseCount: 5,
      asOf,
    })
    expect(available).toBeGreaterThan(maybe)
  })

  it('treats missing distance/response-history data as neutral, not penalized to zero', () => {
    const withData = calculateMatchScore({
      distanceKm: MAX_MATCH_DISTANCE_KM, // worst-case known distance
      availabilityStatus: 'AVAILABLE',
      lastDonationDate: null,
      acceptedResponseCount: 0,
      totalResponseCount: 10, // worst-case known history
      asOf,
    })
    const withoutData = calculateMatchScore({
      distanceKm: null, // unknown — neutral
      availabilityStatus: 'AVAILABLE',
      lastDonationDate: null,
      acceptedResponseCount: 0,
      totalResponseCount: 0, // unknown — neutral
      asOf,
    })
    expect(withoutData).toBeGreaterThan(withData)
  })
})

describe('MATCH_WEIGHTS', () => {
  it('matches the documented spec weights (distance 25, availability 15, donationTiming 10, responseHistory 10)', () => {
    expect(MATCH_WEIGHTS).toEqual({
      distance: 25,
      availability: 15,
      donationTiming: 10,
      responseHistory: 10,
    })
  })
})

describe('emergency cascade helpers', () => {
  describe('nextCascadeTierIndex', () => {
    it('starts at tier 0 when the cascade has never run', () => {
      expect(nextCascadeTierIndex(null)).toBe(0)
    })

    it('advances one tier at a time', () => {
      expect(nextCascadeTierIndex(0)).toBe(1)
      expect(nextCascadeTierIndex(1)).toBe(2)
    })

    it('returns null once every tier has been examined (exhausted)', () => {
      const lastTierIndex = EMERGENCY_CASCADE_RADII_KM.length - 1
      expect(nextCascadeTierIndex(lastTierIndex)).toBeNull()
    })
  })

  describe('isWithinRadius', () => {
    it('treats an unknown distance as within every radius (neutral, not excluded)', () => {
      expect(isWithinRadius(null, EMERGENCY_CASCADE_RADII_KM[0])).toBe(true)
    })

    it('includes a donor exactly at the radius boundary', () => {
      expect(isWithinRadius(10, 10)).toBe(true)
    })

    it('excludes a donor beyond the radius', () => {
      expect(isWithinRadius(11, 10)).toBe(false)
    })
  })

  describe('isNotifiedMatchTimedOut', () => {
    const asOf = new Date('2026-06-01T12:00:00Z')

    it('is not timed out immediately after notification', () => {
      expect(isNotifiedMatchTimedOut('2026-06-01T11:59:00Z', asOf)).toBe(false)
    })

    it('is timed out once CASCADE_WAVE_TIMEOUT_MINUTES has elapsed', () => {
      const notifiedAt = new Date(asOf.getTime() - CASCADE_WAVE_TIMEOUT_MINUTES * 60 * 1000).toISOString()
      expect(isNotifiedMatchTimedOut(notifiedAt, asOf)).toBe(true)
    })

    it('is not timed out one minute short of the threshold', () => {
      const notifiedAt = new Date(asOf.getTime() - (CASCADE_WAVE_TIMEOUT_MINUTES - 1) * 60 * 1000).toISOString()
      expect(isNotifiedMatchTimedOut(notifiedAt, asOf)).toBe(false)
    })
  })
})
