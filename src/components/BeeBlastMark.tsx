import mark from "@/assets/beeblast-mark.png"

/** Where the footer mark points. */
const BEEBLAST_URL = "https://beeblast.co"

/** The footer attribution: the BeeBlast mark, a "B" over an "e" on a honey disc. Quiet on purpose. */
export function PoweredByBeeBlast(): React.JSX.Element {
  return (
    <span className="flex items-center gap-1.5">
      <span className="text-xs">Powered by</span>
      <a href={BEEBLAST_URL} target="_blank" rel="noreferrer noopener" aria-label="BeeBlast" className="transition-opacity hover:opacity-70">
        <img src={mark} alt="BeeBlast" width={24} height={24} className="block size-6 rounded-full ring-1 ring-border" />
      </a>
    </span>
  )
}
