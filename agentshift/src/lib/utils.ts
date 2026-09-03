import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function timeAgo(date: string | Date): string {
  const d = typeof date === 'string' ? new Date(date) : date
  const seconds = Math.floor((Date.now() - d.getTime()) / 1000)
  if (seconds < 60) return 'just now'
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`
  if (seconds < 86400 * 30) return `${Math.floor(seconds / 86400)}d ago`
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

/** "in 3 days", "today", "4 days ago" — how every deadline in the app reads. */
export function relativeDay(days: number): string {
  if (days === 0) return 'today'
  if (days === 1) return 'tomorrow'
  if (days === -1) return 'yesterday'
  if (days > 0) return `in ${days} days`
  return `${Math.abs(days)} days ago`
}

export function initials(name: string): string {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map(p => p[0]!.toUpperCase()).join('')
}

export function truncate(str: string, len: number): string {
  return str.length <= len ? str : str.slice(0, len).trimEnd() + '…'
}
