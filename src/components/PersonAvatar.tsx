import { useState } from "react"
import { hueOf, initialsOf } from "@/lib/initials"

const SIZES = { sm: "size-8 text-xs", lg: "size-24 text-3xl border-4 border-card" } as const

/**
 * The round picture of a person. Their photo when there is one and it loads; otherwise their initials on a colour that comes from their name,
 * so every person, found or added by hand, always has an avatar and the same person always looks the same.
 */
export function PersonAvatar({ name, photo, size = "sm" }: { name: string; photo?: string; size?: keyof typeof SIZES }): React.JSX.Element {
  const [broken, setBroken] = useState<boolean>(false)
  const cls = `${SIZES[size]} flex shrink-0 items-center justify-center overflow-hidden rounded-full font-semibold`

  return photo && !broken ? (
    <span className={`${cls} bg-secondary`}>
      <img src={photo} alt="" loading="lazy" decoding="async" referrerPolicy="no-referrer" onError={() => setBroken(true)} className="size-full object-cover" />
    </span>
  ) : (
    <span aria-hidden="true" className={cls} style={{ backgroundColor: `oklch(0.93 0.045 ${hueOf(name)})`, color: `oklch(0.38 0.09 ${hueOf(name)})` }}>
      {initialsOf(name)}
    </span>
  )
}
