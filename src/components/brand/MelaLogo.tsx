import { MELA_COLORS, MELA_LOCKUP, MELA_MARK } from './logo-data'

function MarkShapes() {
  return (
    <>
      <path
        d={MELA_MARK.line}
        fill="none"
        stroke={MELA_COLORS.teal}
        strokeWidth={MELA_MARK.stroke}
        strokeLinejoin="round"
      />
      <circle cx={MELA_MARK.node.x} cy={MELA_MARK.node.y} r={MELA_MARK.nodeRadius} fill={MELA_COLORS.teal} />
      <path d={MELA_MARK.shaft} fill="none" stroke={MELA_COLORS.amber} strokeWidth={MELA_MARK.stroke} />
      <path
        d={MELA_MARK.head}
        fill={MELA_COLORS.amber}
        stroke={MELA_COLORS.amber}
        strokeWidth={MELA_MARK.headRounding}
        strokeLinejoin="round"
      />
    </>
  )
}

/** The Mela lockup: the M mark, with "MELA" over "መላ" (branding/build.mjs). Size it by height. */
export function MelaLogo({ className }: { className?: string }) {
  return (
    <svg viewBox={MELA_LOCKUP.viewBox} className={className} role="img" aria-label="Mela">
      <MarkShapes />
      <path d={MELA_LOCKUP.latin} fill={MELA_COLORS.navy} />
      <path d={MELA_LOCKUP.ethiopic} fill={MELA_COLORS.navy} />
    </svg>
  )
}
