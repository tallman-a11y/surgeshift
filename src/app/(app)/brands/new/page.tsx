import BrandForm from '../_components/BrandForm'

export const metadata = { title: 'Add Brand — SurgeShift' }

export default function NewBrandPage() {
  return (
    <div className="p-6 max-w-2xl mx-auto">
      <h1 className="text-2xl font-bold mb-1" style={{ color: 'var(--color-text)' }}>Add Brand</h1>
      <p className="text-sm mb-6" style={{ color: 'var(--color-text-muted)' }}>Configure your brand profile to start scanning for opportunities</p>
      <BrandForm />
    </div>
  )
}
