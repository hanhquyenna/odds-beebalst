import type { ArtKind } from "@/content/research/types"

const ink = "currentColor"
const brand = "var(--brand)"
const soft = "var(--secondary)"

/** Line illustrations in ink with one orange mark each. They carry no data; they sit between sections to give the eye a rest. */
export function Art({ kind, className }: { kind: ArtKind; className?: string }): React.JSX.Element {
  return (
    <svg viewBox="0 0 480 240" role="img" aria-hidden="true" className={className} fill="none" stroke={ink} strokeWidth={3} strokeLinecap="round" strokeLinejoin="round">
      {SHAPES[kind]}
    </svg>
  )
}

const SHAPES: Record<ArtKind, React.ReactNode> = {
  funnel: (
    <>
      <path d="M90 50 H390 L300 110 H180 Z" fill={soft} />
      <path d="M180 110 H300 L268 160 H212 Z" fill={soft} />
      <path d="M212 160 H268 V200 H212 Z" fill={soft} />
      {[130, 175, 220, 265, 310, 350].map((x, i) => (
        <circle key={x} cx={x} cy={28 + (i % 2) * 8} r={5} fill={ink} stroke="none" />
      ))}
      <circle cx={240} cy={226} r={8} fill={brand} stroke="none" />
    </>
  ),
  stairs: (
    <>
      <path d="M50 200 H130 V160 H210 V120 H290 V80 H370 V40 H430" fill={soft} />
      <path d="M60 184 C120 140 170 150 230 104 C290 60 340 70 392 26" stroke={brand} strokeDasharray="2 10" />
      <circle cx={392} cy={24} r={9} fill={brand} stroke="none" />
    </>
  ),
  door: (
    <>
      <rect x={160} y={30} width={160} height={180} rx={6} fill={soft} />
      <path d="M320 30 L380 56 V196 L320 210" />
      <path d="M320 70 L392 210 H320" stroke="none" fill={brand} opacity={0.22} />
      <circle cx={300} cy={124} r={6} fill={ink} stroke="none" />
      <path d="M100 210 H420" />
    </>
  ),
  scales: (
    <>
      <path d="M240 40 V200 M190 200 H290" />
      <path d="M120 70 H360" />
      <path d="M120 70 L90 140 H150 Z M360 70 L330 140 H390 Z" fill={soft} />
      <circle cx={240} cy={40} r={9} fill={brand} stroke="none" />
      <circle cx={120} cy={122} r={8} fill={ink} stroke="none" />
    </>
  ),
  compass: (
    <>
      <circle cx={240} cy={120} r={92} fill={soft} />
      <circle cx={240} cy={120} r={70} />
      <path d="M240 50 L262 120 L240 190 L218 120 Z" fill="var(--background)" />
      <path d="M240 50 L262 120 H218 Z" fill={brand} stroke="none" />
      <circle cx={240} cy={120} r={6} fill={ink} stroke="none" />
    </>
  ),
  bridge: (
    <>
      <path d="M40 140 H440" />
      <path d="M90 140 C90 90 190 90 190 140 M190 140 C190 90 290 90 290 140 M290 140 C290 90 390 90 390 140" fill={soft} />
      <path d="M30 180 C80 168 110 192 160 180 S240 168 290 180 S380 192 450 178" stroke={brand} />
      <path d="M30 204 C80 192 110 216 160 204 S240 192 290 204 S380 216 450 202" opacity={0.5} />
    </>
  ),
  map: (
    <>
      <rect x={60} y={30} width={360} height={180} rx={10} fill={soft} />
      {[0, 1, 2, 3, 4, 5].map((c) => [0, 1, 2, 3].map((r) => <circle key={`${c}${r}`} cx={105 + c * 57} cy={65 + r * 45} r={3.5} fill={ink} stroke="none" />))}
      <path d="M105 155 C170 155 162 110 219 110 S276 65 333 65 S390 110 390 110" stroke={brand} strokeWidth={4} />
      <circle cx={390} cy={110} r={9} fill={brand} stroke="none" />
    </>
  ),
  receipt: (
    <>
      <path d="M150 20 H330 V214 L310 202 L290 214 L270 202 L250 214 L230 202 L210 214 L190 202 L170 214 L150 202 Z" fill={soft} />
      <path d="M180 62 H300 M180 92 H280 M180 122 H300 M180 152 H250" />
      <path d="M180 184 H300" stroke={brand} strokeWidth={5} />
    </>
  ),
  lens: (
    <>
      <path d="M70 70 H300 M70 110 H260 M70 150 H290 M70 190 H220" opacity={0.55} />
      <circle cx={300} cy={110} r={58} fill="var(--background)" />
      <circle cx={300} cy={110} r={58} stroke={brand} strokeWidth={5} />
      <path d="M342 152 L400 210" strokeWidth={8} />
      <path d="M268 100 H332 M268 122 H318" />
    </>
  ),
  thread: (
    <>
      <path d="M60 170 C120 60 180 60 240 120 S360 190 420 70" stroke={brand} strokeWidth={4} />
      {[[60, 170], [150, 82], [240, 120], [330, 170], [420, 70]].map(([x, y]) => (
        <circle key={x} cx={x} cy={y} r={11} fill="var(--background)" />
      ))}
      <circle cx={420} cy={70} r={11} fill={brand} stroke="none" />
    </>
  ),
  clock: (
    <>
      <circle cx={240} cy={120} r={88} fill={soft} />
      {Array.from({ length: 12 }, (_, i) => {
        const a = (i / 12) * Math.PI * 2
        return <path key={i} d={`M${240 + Math.sin(a) * 76} ${120 - Math.cos(a) * 76} L${240 + Math.sin(a) * 84} ${120 - Math.cos(a) * 84}`} />
      })}
      <path d="M240 120 V70" strokeWidth={5} />
      <path d="M240 120 L282 144" stroke={brand} strokeWidth={5} />
      <circle cx={240} cy={120} r={6} fill={ink} stroke="none" />
    </>
  ),
  seed: (
    <>
      <path d="M60 200 H420" />
      <path d="M240 200 V110" />
      <path d="M240 130 C240 80 190 70 160 80 C160 120 200 138 240 130 Z" fill={soft} />
      <path d="M240 110 C240 60 290 40 330 50 C330 96 290 118 240 110 Z" fill={soft} />
      <circle cx={330} cy={50} r={8} fill={brand} stroke="none" />
    </>
  ),
}
