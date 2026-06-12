import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function scoreColor(score: number): string {
  if (score >= 80) return 'score-high'
  if (score >= 60) return 'score-mid'
  return 'score-low'
}

export function scoreBg(score: number): string {
  if (score >= 80) return 'rgba(34,197,94,0.1)'
  if (score >= 60) return 'rgba(245,158,11,0.1)'
  return 'rgba(100,116,139,0.1)'
}

export function scoreBorder(score: number): string {
  if (score >= 80) return 'rgba(34,197,94,0.3)'
  if (score >= 60) return 'rgba(245,158,11,0.3)'
  return 'rgba(100,116,139,0.3)'
}

export function timeAgo(date: string): string {
  const d = new Date(date)
  const seconds = Math.floor((Date.now() - d.getTime()) / 1000)
  if (seconds < 60) return 'just now'
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`
  return `${Math.floor(seconds / 86400)}d ago`
}

export function truncate(str: string, len: number): string {
  if (str.length <= len) return str
  return str.slice(0, len).trimEnd() + '…'
}
