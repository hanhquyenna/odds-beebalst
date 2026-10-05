import { useState } from "react"
import { logoFor, monogram } from "@/lib/companies"

interface CompanyLogoProps {
  employer: string
  name: string
  /** Height of the logo box, in pixels. The logo keeps its own proportions inside it. */
  size: number
  /** Widest the logo may get, as a multiple of the height. Wordmarks are wide. */
  wide: number
  /** A link to one of the employer's jobs. When there is no logo on file, its site gives one. */
  url?: string | null
}

/**
 * The employer's logo, floating: no tile, no border, no background. The picture
 * has its own background cut out ahead of time, so it sits straight on whatever
 * is behind it. With no logo on file, the company's own site icon is used when the job link gives one; with neither, or a picture that fails to load, its initials show in a soft circle of the same size.
 */
export function CompanyLogo({ employer, name, size, wide, url }: CompanyLogoProps): React.JSX.Element {
  const src = logoFor(employer, url)
  const [failed, setFailed] = useState<boolean>(false)

  if (src === null || failed) {
    return (
      <span
        aria-hidden="true"
        style={{ width: size, height: size, fontSize: size * 0.36 }}
        className="flex shrink-0 items-center justify-center rounded-full bg-accent font-semibold tracking-tight text-primary"
      >
        {monogram(name)}
      </span>
    )
  }

  return (
    <img
      src={src}
      alt={`${name} logo`}
      height={size}
      loading="lazy"
      decoding="async"
      onError={() => setFailed(true)}
      style={{ height: size, maxWidth: size * wide }}
      className="w-auto shrink-0 object-contain object-center"
    />
  )
}
