import { useCallback, useEffect, useMemo, useState } from 'react'
import { api } from './api'
import type { Category, Dashboard, Expense, ExpenseInput } from './types'

const PAYMENT_METHODS = ['cash', 'card', 'upi', 'netbanking', 'other']
const money = (n: number) =>
  n.toLocaleString(undefined, { style: 'currency', currency: 'INR', maximumFractionDigits: 0 })
const thisMonth = () => new Date().toISOString().slice(0, 7)
const today = () => new Date().toISOString().slice(0, 10)

const blankForm = (): ExpenseInput => ({
  amount: 0, category_id: 0, note: '', payment_method: 'cash', spent_on: today(),
})

export default function App() {
  const [month, setMonth] = useState(thisMonth)
  const [categories, setCategories] = useState<Category[]>([])
  const [dash, setDash] = useState<Dashboard | null>(null)
  const [items, setItems] = useState<Expense[]>([])
  const [form, setForm] = useState<ExpenseInput>(blankForm)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [q, setQ] = useState('')
  const [filterCat, setFilterCat] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const refresh = useCallback(async () => {
    try {
      setError('')
      const [d, list] = await Promise.all([
        api.dashboard(month),
        api.list({ month, category_id: filterCat, q }),
      ])
      setDash(d)
      setItems(list)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'request failed')
    }
  }, [month, filterCat, q])

  useEffect(() => {
    api.categories()
      .then((c) => {
        setCategories(c)
        setForm((f) => (f.category_id ? f : { ...f, category_id: c[0]?.id ?? 0 }))
      })
      .catch((e) => setError(e instanceof Error ? e.message : 'could not load categories'))
  }, [])

  useEffect(() => {
    const t = setTimeout(refresh, q ? 250 : 0)
    return () => clearTimeout(t)
  }, [refresh, q])

  const maxCat = useMemo(
    () => Math.max(1, ...(dash?.by_category ?? []).map((c) => c.total)),
    [dash],
  )

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.amount || !form.category_id) return setError('Amount and category are required')
    setBusy(true)
    try {
      const body = { ...form, note: form.note?.trim() || null }
      if (editingId) await api.update(editingId, body)
      else await api.create(body)
      setForm({ ...blankForm(), category_id: categories[0]?.id ?? 0 })
      setEditingId(null)
      await refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'save failed')
    } finally {
      setBusy(false)
    }
  }

  function startEdit(x: Expense) {
    setEditingId(x.id)
    setForm({
      amount: x.amount, category_id: x.category_id, note: x.note ?? '',
      payment_method: x.payment_method, spent_on: x.spent_on,
    })
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  async function uploadReceipt(id: number, file: File | undefined) {
    if (!file) return
    setBusy(true)
    try {
      await api.uploadReceipt(id, file)
      await refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'upload failed')
    } finally {
      setBusy(false)
    }
  }

  async function viewReceipt(id: number) {
    try {
      const { url } = await api.receiptUrl(id)
      // Opens the object straight from S3 using a signed link valid for a few
      // minutes. Nothing in the bucket is public.
      window.open(url, '_blank', 'noopener')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'could not open receipt')
    }
  }

  async function remove(id: number) {
    if (!confirm('Delete this expense?')) return
    try {
      await api.remove(id)
      if (editingId === id) { setEditingId(null); setForm(blankForm()) }
      await refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'delete failed')
    }
  }

  return (
    <div className="app">
      <header className="top">
        <h1>Expense Tracker</h1>
        <input
          type="month" value={month} onChange={(e) => setMonth(e.target.value)}
          style={{ width: 'auto' }} aria-label="Month"
        />
      </header>

      {error && <div className="error">{error}</div>}

      <section className="card">
        <div className="label">Spent in {month}</div>
        <p className="total">{money(dash?.total ?? 0)}</p>
        <div className="label" style={{ textTransform: 'none', letterSpacing: 0, marginTop: 2 }}>
          {dash?.count ?? 0} {dash?.count === 1 ? 'expense' : 'expenses'}
        </div>
        {dash?.by_category.map((c) => (
          <div className="bar-row" key={c.category}>
            <span>{c.category}</span>
            <span className="bar-track">
              <span className="bar-fill" style={{ width: `${(c.total / maxCat) * 100}%` }} />
            </span>
            <span className="li-amt">{money(c.total)}</span>
          </div>
        ))}
      </section>

      <section className="card">
        <div className="label" style={{ marginBottom: 10 }}>
          {editingId ? `Editing #${editingId}` : 'Add expense'}
        </div>
        <form className="add" onSubmit={submit}>
          <label className="field">
            <span>Amount</span>
            <input
              type="number" min="0.01" step="0.01" inputMode="decimal" required
              value={form.amount || ''}
              onChange={(e) => setForm({ ...form, amount: Number(e.target.value) })}
            />
          </label>
          <label className="field">
            <span>Date</span>
            <input
              type="date" required value={form.spent_on}
              onChange={(e) => setForm({ ...form, spent_on: e.target.value })}
            />
          </label>
          <label className="field">
            <span>Category</span>
            <select
              value={form.category_id}
              onChange={(e) => setForm({ ...form, category_id: Number(e.target.value) })}
            >
              {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </label>
          <label className="field">
            <span>Payment</span>
            <select
              value={form.payment_method}
              onChange={(e) => setForm({ ...form, payment_method: e.target.value })}
            >
              {PAYMENT_METHODS.map((m) => <option key={m} value={m}>{m}</option>)}
            </select>
          </label>
          <label className="field wide">
            <span>Note</span>
            <input
              type="text" placeholder="optional" value={form.note ?? ''}
              onChange={(e) => setForm({ ...form, note: e.target.value })}
            />
          </label>
          <div className="wide" style={{ display: 'flex', gap: 10 }}>
            <button className="primary" type="submit" disabled={busy}>
              {busy ? 'Saving…' : editingId ? 'Save changes' : 'Add expense'}
            </button>
            {editingId && (
              <button type="button" className="ghost" onClick={() => { setEditingId(null); setForm(blankForm()) }}>
                Cancel
              </button>
            )}
          </div>
        </form>
      </section>

      <section className="card">
        <div className="filters" style={{ marginBottom: 12 }}>
          <input placeholder="Search notes…" value={q} onChange={(e) => setQ(e.target.value)} />
          <select value={filterCat} onChange={(e) => setFilterCat(e.target.value)}>
            <option value="">All categories</option>
            {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>

        {items.length === 0 ? (
          <p className="empty">No expenses match.</p>
        ) : (
          <ul className="list">
            {items.map((x) => (
              <li key={x.id}>
                <div className="li-main">
                  <div className="li-note">{x.note || x.category}</div>
                  <div className="li-meta">
                    <span className="pill">{x.category}</span>{' '}
                    {x.spent_on} · {x.payment_method}
                  </div>
                </div>
                <span className="li-amt">{money(x.amount)}</span>
                {x.has_receipt ? (
                  <button className="link" onClick={() => viewReceipt(x.id)} title="View receipt">
                    Receipt
                  </button>
                ) : (
                  <label className="link" style={{ cursor: 'pointer' }} title="Attach a receipt">
                    + Receipt
                    <input
                      type="file" hidden accept="image/*,application/pdf" disabled={busy}
                      onChange={(e) => uploadReceipt(x.id, e.target.files?.[0])}
                    />
                  </label>
                )}
                <button className="link" onClick={() => startEdit(x)}>Edit</button>
                <button className="link danger" onClick={() => remove(x.id)}>Delete</button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
