import type { Category, Dashboard, Expense, ExpenseInput } from './types'

// Relative URLs throughout. Locally the Vite dev server proxies /api to the
// backend; in production CloudFront routes /api/* to the ALB. Same code both
// times, and the browser only ever sees one origin — so there is no CORS.
const BASE = import.meta.env.VITE_API_URL ?? ''

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}/api${path}`, {
    ...init,
    headers: init?.body ? { 'Content-Type': 'application/json' } : undefined,
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error((body as { error?: string }).error ?? `${res.status} ${res.statusText}`)
  }
  return res.status === 204 ? (undefined as T) : ((await res.json()) as T)
}

export const api = {
  categories: () => req<Category[]>('/categories'),
  dashboard: (month: string) => req<Dashboard>(`/dashboard?month=${month}`),
  list: (params: { month: string; category_id?: string; q?: string }) => {
    const qs = new URLSearchParams({ month: params.month })
    if (params.category_id) qs.set('category_id', params.category_id)
    if (params.q) qs.set('q', params.q)
    return req<Expense[]>(`/expenses?${qs}`)
  },
  create: (body: ExpenseInput) => req<Expense>('/expenses', { method: 'POST', body: JSON.stringify(body) }),
  update: (id: number, body: ExpenseInput) =>
    req<Expense>(`/expenses/${id}`, { method: 'PUT', body: JSON.stringify(body) }),
  remove: (id: number) => req<void>(`/expenses/${id}`, { method: 'DELETE' }),

  // FormData must NOT get an explicit Content-Type — the browser sets it along
  // with the multipart boundary, and overriding it breaks the upload.
  uploadReceipt: async (id: number, file: File) => {
    const body = new FormData()
    body.append('file', file)
    const res = await fetch(`${BASE}/api/expenses/${id}/receipt`, { method: 'POST', body })
    if (!res.ok) {
      const e = await res.json().catch(() => ({}))
      throw new Error((e as { error?: string }).error ?? 'upload failed')
    }
  },

  // Returns a short-lived signed link; the bucket itself stays private.
  receiptUrl: (id: number) => req<{ url: string; expires_in: number }>(`/expenses/${id}/receipt`),
}
