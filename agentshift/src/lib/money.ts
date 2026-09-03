/** Money and unit formatting shared by every AgentShift surface and artifact. */

export function usd(n: number, opts: { cents?: boolean } = {}): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: opts.cents ? 2 : 0,
    maximumFractionDigits: opts.cents ? 2 : 0,
  }).format(n)
}

/** Compact money for tiles and chips: $1.2M, $485K, $9.4K. */
export function usdShort(n: number): string {
  const abs = Math.abs(n)
  const sign = n < 0 ? '-' : ''
  if (abs >= 1_000_000) return `${sign}$${round(abs / 1_000_000, 2)}M`
  if (abs >= 1_000) return `${sign}$${round(abs / 1_000, abs >= 100_000 ? 0 : 1)}K`
  return `${sign}$${Math.round(abs)}`
}

export function pct(n: number, digits = 1): string {
  return `${round(n * 100, digits)}%`
}

export function round(n: number, digits = 0): number {
  const f = 10 ** digits
  return Math.round(n * f) / f
}

/** Round to the nearest marketing-friendly list price ($5k under $1M, $10k above). */
export function roundToListPrice(n: number): number {
  const step = n >= 1_000_000 ? 10_000 : n >= 250_000 ? 5_000 : 1_000
  return Math.round(n / step) * step
}

export function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n))
}
