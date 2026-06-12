'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, X, Loader2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

type Brand = {
  id: string
  name: string
  tagline: string
  description: string
  url: string
  keywords: string[]
  subreddits: string[]
  voice_notes: string
  active: boolean
}

export default function BrandForm({ brand }: { brand?: Brand }) {
  const router = useRouter()
  const [name, setName] = useState(brand?.name ?? '')
  const [tagline, setTagline] = useState(brand?.tagline ?? '')
  const [description, setDescription] = useState(brand?.description ?? '')
  const [url, setUrl] = useState(brand?.url ?? '')
  const [keywords, setKeywords] = useState<string[]>(brand?.keywords ?? [])
  const [subreddits, setSubreddits] = useState<string[]>(brand?.subreddits ?? [])
  const [voiceNotes, setVoiceNotes] = useState(brand?.voice_notes ?? '')
  const [active, setActive] = useState(brand?.active ?? true)
  const [kwInput, setKwInput] = useState('')
  const [subInput, setSubInput] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  function addKeyword() {
    const kw = kwInput.trim()
    if (kw && !keywords.includes(kw)) setKeywords([...keywords, kw])
    setKwInput('')
  }

  function addSubreddit() {
    const sub = subInput.trim().replace(/^r\//, '')
    if (sub && !subreddits.includes(sub)) setSubreddits([...subreddits, sub])
    setSubInput('')
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError('')
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setError('Not authenticated'); setSaving(false); return }

    const payload = { name, tagline, description, url, keywords, subreddits, voice_notes: voiceNotes, active, user_id: user.id }

    if (brand) {
      const { error: err } = await supabase.from('brands').update(payload).eq('id', brand.id)
      if (err) { setError(err.message); setSaving(false); return }
    } else {
      const { error: err } = await supabase.from('brands').insert(payload)
      if (err) { setError(err.message); setSaving(false); return }
    }

    router.push('/brands')
    router.refresh()
  }

  function TagInput({
    items, onRemove, input, setInput, onAdd, placeholder,
  }: {
    items: string[]
    onRemove: (i: string) => void
    input: string
    setInput: (v: string) => void
    onAdd: () => void
    placeholder: string
  }) {
    return (
      <div>
        <div className="flex flex-wrap gap-1.5 mb-2">
          {items.map(item => (
            <span key={item} className="flex items-center gap-1 text-xs px-2.5 py-1 rounded-full font-medium" style={{ background: 'var(--color-accent-muted)', color: 'var(--color-accent)', border: '1px solid rgba(99,102,241,0.2)' }}>
              {item}
              <button type="button" onClick={() => onRemove(item)} style={{ color: 'var(--color-accent)' }}><X size={10} /></button>
            </span>
          ))}
        </div>
        <div className="flex gap-2">
          <input
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); onAdd() } }}
            placeholder={placeholder}
            className="flex-1"
          />
          <button type="button" onClick={onAdd} className="btn-ghost px-3 py-2 shrink-0">
            <Plus size={14} />
          </button>
        </div>
      </div>
    )
  }

  return (
    <form onSubmit={handleSave} className="flex flex-col gap-5">
      <div>
        <label className="block text-xs font-semibold mb-1.5" style={{ color: 'var(--color-text-muted)' }}>Brand Name *</label>
        <input value={name} onChange={e => setName(e.target.value)} placeholder="WeldShift Academy" required />
      </div>

      <div>
        <label className="block text-xs font-semibold mb-1.5" style={{ color: 'var(--color-text-muted)' }}>Tagline</label>
        <input value={tagline} onChange={e => setTagline(e.target.value)} placeholder="AI-powered CWI exam prep & welding knowledge platform" />
      </div>

      <div>
        <label className="block text-xs font-semibold mb-1.5" style={{ color: 'var(--color-text-muted)' }}>Description *</label>
        <textarea
          value={description}
          onChange={e => setDescription(e.target.value)}
          rows={4}
          placeholder="Describe what your product does, who it's for, and what problems it solves. The AI uses this to match and draft replies."
          required
        />
      </div>

      <div>
        <label className="block text-xs font-semibold mb-1.5" style={{ color: 'var(--color-text-muted)' }}>Website URL *</label>
        <input value={url} onChange={e => setUrl(e.target.value)} placeholder="https://weldshiftacademy.com" type="url" required />
      </div>

      <div>
        <label className="block text-xs font-semibold mb-2" style={{ color: 'var(--color-text-muted)' }}>Target Keywords</label>
        <p className="text-xs mb-2" style={{ color: 'var(--color-text-dim)' }}>Phrases people search for when they need your product</p>
        <TagInput
          items={keywords}
          onRemove={kw => setKeywords(keywords.filter(k => k !== kw))}
          input={kwInput}
          setInput={setKwInput}
          onAdd={addKeyword}
          placeholder='e.g. "CWI exam prep" — press Enter to add'
        />
      </div>

      <div>
        <label className="block text-xs font-semibold mb-2" style={{ color: 'var(--color-text-muted)' }}>Subreddits to Monitor</label>
        <p className="text-xs mb-2" style={{ color: 'var(--color-text-dim)' }}>Community subreddits where your audience hangs out</p>
        <TagInput
          items={subreddits}
          onRemove={sub => setSubreddits(subreddits.filter(s => s !== sub))}
          input={subInput}
          setInput={setSubInput}
          onAdd={addSubreddit}
          placeholder='e.g. "welding" — press Enter to add'
        />
      </div>

      <div>
        <label className="block text-xs font-semibold mb-1.5" style={{ color: 'var(--color-text-muted)' }}>Voice / Tone Notes (optional)</label>
        <textarea
          value={voiceNotes}
          onChange={e => setVoiceNotes(e.target.value)}
          rows={2}
          placeholder="e.g. 'Knowledgeable welding professional, casual but authoritative. Mention practice tests naturally.'"
        />
      </div>

      {brand && (
        <label className="flex items-center gap-3 cursor-pointer">
          <input type="checkbox" checked={active} onChange={e => setActive(e.target.checked)} className="w-auto" style={{ width: 'auto' }} />
          <span className="text-sm" style={{ color: 'var(--color-text)' }}>Brand active (will be included in scans)</span>
        </label>
      )}

      {error && (
        <p className="text-xs px-3 py-2 rounded-lg" style={{ color: 'var(--color-red)', background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)' }}>
          {error}
        </p>
      )}

      <div className="flex gap-3 pt-2">
        <button type="submit" className="btn-accent" disabled={saving}>
          {saving ? <><Loader2 size={14} className="animate-spin" /> Saving…</> : brand ? 'Save Changes' : 'Add Brand'}
        </button>
        <button type="button" onClick={() => router.back()} className="btn-ghost">Cancel</button>
      </div>
    </form>
  )
}
