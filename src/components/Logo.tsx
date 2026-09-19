/** The official mascot — a blindfolded football. Used in the header, onboarding, and as favicon. */
const mascotUrl = new URL('../assets/mascot.webp', import.meta.url).href

export function Logo({ size = 32 }: { size?: number }) {
  return (
    <img
      src={mascotUrl}
      alt=""
      width={size}
      height={size}
      className="app-logo"
      draggable={false}
    />
  )
}
