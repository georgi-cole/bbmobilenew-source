export default function TribunalCinematicLoading({
  label = 'Your next chapter',
}: {
  label?: string
}) {
  return (
    <div
      role="status"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 13000,
        display: 'grid',
        placeItems: 'center',
        background: '#121016',
        color: '#d9c5a0',
        fontFamily: 'inherit',
        fontSize: 20,
        fontWeight: 600,
      }}
    >
      {label}
    </div>
  )
}
