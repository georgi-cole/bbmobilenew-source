import StoreProductIcon from '../../components/StoreProductModal/StoreProductIcon'
import './VipMarketplacePreview.css'

/** A clearly labelled navigation stand-in, not the production billing screen. */
export default function VipMarketplacePreview({
  active,
  onBack,
  onActivate,
}: {
  active: boolean
  onBack: () => void
  onActivate: () => void
}) {
  return (
    <main className="room-vip-preview" aria-label="VIP marketplace preview">
      <header>
        <button type="button" onClick={onBack} aria-label="Back to changing room" autoFocus>
          ‹
        </button>
        <h1>BIGEYE MARKETFACE</h1>
      </header>
      <nav aria-label="Store categories">
        <span aria-current="page">VIP</span>
      </nav>
      <section className="room-vip-preview__card">
        <StoreProductIcon name="vip" />
        <p className="room-vip-preview__eyebrow">VIP MARKETPLACE</p>
        <h2>Every look. Yours.</h2>
        <p>All changing-room looks, with VIP.</p>
        <button type="button" className="room-vip-preview__activate" onClick={onActivate} disabled={active}>
          {active ? 'Demo VIP active' : 'Activate demo VIP'}
        </button>
      </section>
      <p className="room-vip-preview__note">
        Navigation demo only. The game opens its existing marketplace with VIP selected. This
        stand-in has no checkout and does not reproduce the full store.
      </p>
    </main>
  )
}
