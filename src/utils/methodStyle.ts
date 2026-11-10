import type { HttpMethod } from '@/types'

export function getMethodTextColor(method: HttpMethod | string): string {
  switch (method?.toUpperCase()) {
    case 'GET':
      return 'text-emerald-400'
    case 'POST':
      return 'text-amber-400'
    case 'PUT':
      return 'text-blue-400'
    case 'DELETE':
      return 'text-rose-400'
    case 'PATCH':
      return 'text-purple-400'
    case 'HEAD':
      return 'text-teal-400'
    case 'OPTIONS':
      return 'text-indigo-400'
    default:
      return 'text-muted-foreground'
  }
}

export function getMethodBadgeClass(method: HttpMethod | string): string {
  switch (method?.toUpperCase()) {
    case 'GET':
      return 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
    case 'POST':
      return 'bg-amber-500/10 text-amber-400 border-amber-500/30'
    case 'PUT':
      return 'bg-blue-500/10 text-blue-400 border-blue-500/30'
    case 'DELETE':
      return 'bg-rose-500/10 text-rose-400 border-rose-500/30'
    case 'PATCH':
      return 'bg-purple-500/10 text-purple-400 border-purple-500/30'
    case 'HEAD':
      return 'bg-teal-500/10 text-teal-400 border-teal-500/30'
    case 'OPTIONS':
      return 'bg-indigo-500/10 text-indigo-400 border-indigo-500/30'
    default:
      return 'bg-muted text-muted-foreground border-border'
  }
}

