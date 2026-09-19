/** Hex equivalents of the Tailwind shades already used by Badge/statusTone,
 * so chart fills stay visually consistent with the badges shown elsewhere
 * for the same statuses — not a separate, invented palette. */
export const toneHex = {
  critical: '#dc2626', // red-600
  urgent: '#ea580c', // orange-600
  normal: '#2563eb', // blue-600
  success: '#16a34a', // green-600
  neutral: '#9ca3af', // gray-400
} as const

export type Tone = keyof typeof toneHex
