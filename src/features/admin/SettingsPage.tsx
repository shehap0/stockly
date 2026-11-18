import { useState } from 'react'
import { useSettings, useUpdateSettings, type CompanySettings } from './api'
import { describeError } from '@/lib/errors'

type SettingsData = {
  company: { id: string; name: string }
  settings: CompanySettings
}

function SettingsForm({ data }: { data: SettingsData }) {
  const update = useUpdateSettings()

  const [name, setName] = useState(data.company.name)
  const [currency, setCurrency] = useState(data.settings.currency)
  const [maxDiscount, setMaxDiscount] = useState(String(data.settings.max_discount_percent))
  const [threshold, setThreshold] = useState(
    data.settings.default_low_stock_threshold === null
      ? ''
      : String(data.settings.default_low_stock_threshold),
  )
  const [message, setMessage] = useState<string | null>(null)

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setMessage(null)
    const discount = Number(maxDiscount)
    if (!Number.isFinite(discount) || discount < 0 || discount > 100) {
      setMessage('Max discount must be between 0 and 100.')
      return
    }
    try {
      await update.mutateAsync({
        companyId: data.company.id,
        name,
        currency,
        maxDiscountPercent: discount,
        defaultLowStockThreshold: threshold === '' ? null : Math.max(0, Math.trunc(Number(threshold))),
      })
      setMessage('Settings saved.')
    } catch (err) {
      setMessage(describeError(err))
    }
  }

  return (
    <section>
      <h2>Company settings</h2>
      <form onSubmit={onSubmit} style={{ display: 'grid', gap: 12, maxWidth: 420 }}>
        <label>Company name<br /><input value={name} onChange={(e) => setName(e.target.value)} required /></label>
        <label>
          Currency<br />
          <select value={currency} onChange={(e) => setCurrency(e.target.value)}>
            <option value="EGP">EGP</option>
            <option value="USD">USD</option>
            <option value="EUR">EUR</option>
            <option value="SAR">SAR</option>
            <option value="AED">AED</option>
          </select>
        </label>
        <label>
          Max discount (%)
          <br />
          <input type="number" min={0} max={100} step="0.01" value={maxDiscount} onChange={(e) => setMaxDiscount(e.target.value)} required />
        </label>
        <label>
          Default low-stock threshold (blank = none)
          <br />
          <input type="number" min={0} step={1} value={threshold} onChange={(e) => setThreshold(e.target.value)} />
        </label>
        <button type="submit" disabled={update.isPending}>
          {update.isPending ? 'Saving…' : 'Save settings'}
        </button>
        {message && <p style={{ color: message.startsWith('Settings saved') ? 'green' : 'crimson' }}>{message}</p>}
      </form>
    </section>
  )
}

export default function SettingsPage() {
  const { data, isLoading, error } = useSettings()
  if (isLoading) return <p>Loading settings…</p>
  if (error) return <p role="alert" style={{ color: 'crimson' }}>{describeError(error)}</p>
  if (!data) return null
  return <SettingsForm key={`${data.company.id}:${data.settings.updated_at}`} data={data} />
}
