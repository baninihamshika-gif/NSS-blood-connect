// Pure, dependency-free matching logic — no Deno/Supabase imports here on
// purpose, so this file can be unit-tested directly from Vitest (Node) AND
// imported unmodified by the Deno edge function at index.ts. Keeping the
// actual decision logic here (rather than scattered through the HTTP
// handler) is what makes "transparent ranking" and "configurable rules"
// verifiable — every number a match score depends on is named and
// documented in one place.

export type BloodGroup = 'A+' | 'A-' | 'B+' | 'B-' | 'O+' | 'O-' | 'AB+' | 'AB-'
export type AvailabilityStatus = 'AVAILABLE' | 'MAYBE' | 'UNAVAILABLE'

// ---------------------------------------------------------------------------
// SAFETY: blood-group compatibility gate
// ---------------------------------------------------------------------------
// This is the standard, widely-published ABO/Rh whole-blood-donation
// compatibility chart (O- universal donor, AB+ universal recipient). It is
// used ONLY as a software matching filter to surface plausible candidates —
// per the project's safety rule, it is NOT a substitute for clinical
// screening and cross-matching at the actual point of donation. The UI must
// never present a generated match as "verified compatible"; only as a
// candidate requiring confirmation by qualified medical staff.
const DONOR_CAN_GIVE_TO: Record<BloodGroup, BloodGroup[]> = {
  'O-': ['O-', 'O+', 'A-', 'A+', 'B-', 'B+', 'AB-', 'AB+'],
  'O+': ['O+', 'A+', 'B+', 'AB+'],
  'A-': ['A-', 'A+', 'AB-', 'AB+'],
  'A+': ['A+', 'AB+'],
  'B-': ['B-', 'B+', 'AB-', 'AB+'],
  'B+': ['B+', 'AB+'],
  'AB-': ['AB-', 'AB+'],
  'AB+': ['AB+'],
}

export function isBloodGroupCompatible(donorGroup: BloodGroup, recipientGroup: BloodGroup): boolean {
  return DONOR_CAN_GIVE_TO[donorGroup].includes(recipientGroup)
}

// ---------------------------------------------------------------------------
// SAFETY: donation eligibility window
// ---------------------------------------------------------------------------
// Minimum days between whole-blood donations before a donor is considered
// eligible again. Real intervals vary by country/regulation (commonly cited
// figures range roughly 56-120 days). This value is an explicit, named,
// documented placeholder — NOT a medically-reviewed rule — and must be
// replaced with a value from qualified medical/regulatory guidance before
// this system is used for real donation coordination. It gates candidacy
// (excludes recently-donated donors entirely); it is not part of the scored
// ranking below.
export const MIN_DAYS_SINCE_LAST_DONATION = 90

export function isWithinEligibilityWindow(lastDonationDate: string | null, asOf: Date): boolean {
  if (!lastDonationDate) return true // no recorded donation — nothing to gate on
  const last = new Date(`${lastDonationDate}T00:00:00Z`)
  const daysSince = Math.floor((asOf.getTime() - last.getTime()) / (1000 * 60 * 60 * 24))
  return daysSince >= MIN_DAYS_SINCE_LAST_DONATION
}

// ---------------------------------------------------------------------------
// Transparent prioritization weights
// ---------------------------------------------------------------------------
// These are software prioritization factors for ranking already-eligible
// candidates — NOT a medical fitness score. Values match the project spec's
// documented weights out of 100 (distance 25, availability 15, donation
// timing 10, response history 10 = 60). The remaining 40 is explicitly left
// unallocated per the spec ("must be finalized only if justified") rather
// than filled with an invented, unreviewed factor. The 0-100 "match
// relevance" shown in the UI renormalizes across only these four
// implemented factors (divides by 60), so it still reads as a clean
// percentage without fabricating additional criteria.
export const MATCH_WEIGHTS = {
  distance: 25,
  availability: 15,
  donationTiming: 10,
  responseHistory: 10,
} as const

const MAX_WEIGHT_TOTAL = MATCH_WEIGHTS.distance + MATCH_WEIGHTS.availability + MATCH_WEIGHTS.donationTiming + MATCH_WEIGHTS.responseHistory // 60

/** Distance beyond which the distance sub-score bottoms out at 0. Configurable. */
export const MAX_MATCH_DISTANCE_KM = 50

/** Haversine great-circle distance in km between two lat/lng points. */
export function calculateDistanceKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371
  const dLat = ((lat2 - lat1) * Math.PI) / 180
  const dLng = ((lng2 - lng1) * Math.PI) / 180
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

function distanceSubScore(distanceKm: number | null): number {
  // Unknown location (no coordinates captured yet — location capture UI is
  // Phase 8) — neutral half-credit rather than penalizing or favoring.
  if (distanceKm === null) return MATCH_WEIGHTS.distance / 2
  if (distanceKm <= 0) return MATCH_WEIGHTS.distance
  if (distanceKm >= MAX_MATCH_DISTANCE_KM) return 0
  return MATCH_WEIGHTS.distance * (1 - distanceKm / MAX_MATCH_DISTANCE_KM)
}

function availabilitySubScore(status: AvailabilityStatus): number {
  if (status === 'AVAILABLE') return MATCH_WEIGHTS.availability
  if (status === 'MAYBE') return MATCH_WEIGHTS.availability / 2
  return 0 // UNAVAILABLE donors are excluded from candidacy before scoring; defensive default.
}

/** Reference point beyond the eligibility window at which timing score reaches its max. Configurable. */
export const DONATION_TIMING_FULL_SCORE_DAYS = 180

function donationTimingSubScore(lastDonationDate: string | null, asOf: Date): number {
  if (!lastDonationDate) return MATCH_WEIGHTS.donationTiming // no history — treat as ready
  const last = new Date(`${lastDonationDate}T00:00:00Z`)
  const daysSince = Math.floor((asOf.getTime() - last.getTime()) / (1000 * 60 * 60 * 24))
  if (daysSince >= DONATION_TIMING_FULL_SCORE_DAYS) return MATCH_WEIGHTS.donationTiming
  if (daysSince <= MIN_DAYS_SINCE_LAST_DONATION) return 0 // at the eligibility boundary — minimal margin
  const span = DONATION_TIMING_FULL_SCORE_DAYS - MIN_DAYS_SINCE_LAST_DONATION
  return MATCH_WEIGHTS.donationTiming * ((daysSince - MIN_DAYS_SINCE_LAST_DONATION) / span)
}

function responseHistorySubScore(acceptedCount: number, totalResponseCount: number): number {
  // No response history yet (Phase 5 hasn't generated any) — neutral half-credit.
  if (totalResponseCount === 0) return MATCH_WEIGHTS.responseHistory / 2
  return MATCH_WEIGHTS.responseHistory * (acceptedCount / totalResponseCount)
}

export interface MatchScoreInput {
  distanceKm: number | null
  availabilityStatus: AvailabilityStatus
  lastDonationDate: string | null
  /** Past donor_responses for this donor across all requests, once Phase 5 exists. */
  acceptedResponseCount: number
  totalResponseCount: number
  asOf: Date
}

/** Returns a 0-100 "match relevance" score. Never treat as a medical fitness score. */
export function calculateMatchScore(input: MatchScoreInput): number {
  const raw =
    distanceSubScore(input.distanceKm) +
    availabilitySubScore(input.availabilityStatus) +
    donationTimingSubScore(input.lastDonationDate, input.asOf) +
    responseHistorySubScore(input.acceptedResponseCount, input.totalResponseCount)
  const normalized = (raw / MAX_WEIGHT_TOTAL) * 100
  return Math.round(normalized * 100) / 100 // 2 decimal places, matches donor_matches.match_score numeric(5,2)
}

/** Top-N candidates are matched per run — a single batch, not a wave/cascade (that's Phase 7). Configurable. */
export const MATCH_CANDIDATE_LIMIT = 20
