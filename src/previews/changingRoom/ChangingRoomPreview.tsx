import { useState } from 'react'
import { createRoot } from 'react-dom/client'
import AppearanceCarousel from '../../appearance/AppearanceCarousel'
import { getAppearanceAsset, SELECTABLE_LOOKS } from '../../appearance/catalog'
import { hasAppearanceLookAccess, isFreeAppearanceLook } from '../../appearance/lookAccess'
import { LookAccessBadges, LookMarket, type LookMarketOption } from '../../appearance/LookMarket'
import { joinPublicAssetPath } from '../../utils/avatar'
import '../../screens/Profile/DressingRoom.css'
import './ChangingRoomPreview.css'

/** No application store, native purchases, persistence, analytics or player data. */
function ChangingRoomPreview() {
  const [selectedId, setSelectedId] = useState('pc-006')
  const [balance, setBalance] = useState(45_000)
  const [vip, setVip] = useState(false)
  const [owned, setOwned] = useState<string[]>([])
  const [market, setMarket] = useState<LookMarketOption | null>(null)
  const [notice, setNotice] = useState('')
  const [scenario, setScenario] = useState('Standard')
  const look = SELECTABLE_LOOKS.find((entry) => entry.id === selectedId)!
  const available = hasAppearanceLookAccess(selectedId, { unlockedAppearanceLookIds: owned }, vip)

  function reset(name: string) {
    setScenario(name)
    setMarket(null)
    setNotice('')
    setVip(name === 'VIP')
    setOwned(name === 'Owned' ? ['pc-006'] : [])
    setBalance(name === 'Low balance' ? 12_000 : 45_000)
    setSelectedId(name === 'Free' ? 'pc-001' : 'pc-006')
  }

  return (
    <div className="room-preview">
      <aside className="room-preview__controls">
        <p className="room-preview__eyebrow">THE BIG EYE / DESIGN REVIEW</p>
        <h1>The changing room.</h1>
        <p className="room-preview__intro">Try the wardrobe, then tap the crown or Eyeros badge to enter the market.</p>
        <span className="room-preview__label">TEST A PLAYER STATE</span>
        <div className="room-preview__scenarios" role="group" aria-label="Test scenarios">
          {['Standard', 'Free', 'Low balance', 'VIP', 'Owned'].map((name) => (
            <button key={name} type="button" aria-pressed={scenario === name} onClick={() => reset(name)}>
              {name}
            </button>
          ))}
        </div>
        <div className="room-preview__wallet">
          <span>Demo wallet</span>
          <strong data-testid="demo-balance">{balance.toLocaleString('en-US')} Eyeros</strong>
        </div>
        <p className="room-preview__safe">Interactive sandbox. All 35 real looks. No real payments or saved-game changes.</p>
        <button type="button" className="room-preview__reset" onClick={() => reset('Standard')}>Reset demo</button>
        <p className="room-preview__result" role="status">{notice || 'Ready to explore.'}</p>
      </aside>
      <section className="room-preview__device" aria-label="Changing room preview">
        <div className="room-preview__device-caption">LIVE INTERACTIVE PREVIEW</div>
        <main className="dressing-room placeholder-screen">
          <div className="dressing-room__topbar">
            <span className="room-preview__back" aria-hidden="true">‹</span>
            <span>Changing room</span>
          </div>
          <h1>Choose your look</h1>
          <p className="dressing-room__subtitle">Your name. Your story. Your style.</p>
          <AppearanceCarousel
            selectedId={selectedId}
            onSelect={(id) => { setSelectedId(id); setNotice('') }}
            onConfirm={available ? () => setNotice(`${look.label} selected. In the game, the existing lock-in reveal plays here.`) : undefined}
            confirmLabel="Use this look"
            accessContent={
              <LookAccessBadges
                isFree={isFreeAppearanceLook(selectedId)}
                isVip={vip}
                isOwned={available}
                onOpen={setMarket}
              />
            }
          />
          <p className="dressing-room__season-note">Your first character replaces the guest silhouette now. Changing an existing character takes effect next season.</p>
        </main>
      </section>
      {market && (
        <LookMarket
          key={`${selectedId}:${market}`}
          look={look}
          portraitUrl={joinPublicAssetPath(getAppearanceAsset({ kind: 'catalog', lookId: selectedId, revision: 1 }, 'main') ?? '')}
          balance={balance}
          isAvailable={available}
          canSpend
          initialOption={market}
          vipLabel="Activate demo VIP"
          onClose={() => setMarket(null)}
          onVip={() => { setVip(true); setScenario('VIP'); setNotice('Demo VIP activated. Every look is now available; no Eyeros were spent.') }}
          onPurchase={() => {
            if (available) return 'owned'
            if (balance < 30_000) return 'insufficient'
            setBalance((value) => value - 30_000)
            setOwned((ids) => [...new Set([...ids, selectedId])])
            setNotice(`${look.label} unlocked for 30,000 demo Eyeros.`)
            return 'purchased'
          }}
        />
      )}
    </div>
  )
}

const root = document.getElementById('root')
if (root) createRoot(root).render(<ChangingRoomPreview />)
