export type Category = { id: number; name: string }

export type Expense = {
  id: number
  amount: number
  note: string | null
  payment_method: string
  spent_on: string
  category_id: number
  category: string
  has_receipt: boolean
}

export type Dashboard = {
  month: string
  total: number
  count: number
  by_category: { category: string; total: number }[]
  recent: { id: number; amount: number; note: string | null; spent_on: string; category: string }[]
}

export type ExpenseInput = {
  amount: number
  category_id: number
  note: string | null
  payment_method: string
  spent_on: string
}
