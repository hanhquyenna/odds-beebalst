/**
 * The odds mascot: a round body with one eye. It bobs, the eye blinks and looks around, and the orange dot hops.
 * All of it stops for someone who asked their system for less motion (see .buddy in index.css).
 */
export function Buddy({ size = 38, still = false }: { size?: number; still?: boolean }): React.JSX.Element {
  return (
    <svg className={still ? undefined : "buddy"} viewBox="0 0 32 32" width={size} height={size} aria-hidden="true">
      <circle cx="15" cy="17" r="13" fill="#2B2825" />
      <g className="lid">
        <circle cx="15" cy="17" r="8.2" fill="#FFFFFF" />
        <g className="pupil">
          <circle cx="15" cy="17" r="4.2" fill="#1C1A18" />
          <circle cx="16.4" cy="15.6" r="1.3" fill="#FFFFFF" />
        </g>
      </g>
      <ellipse cx="7.2" cy="22.6" rx="2.2" ry="1.4" fill="#EE7A2A" opacity=".85" />
      <ellipse cx="22.8" cy="22.6" rx="2.2" ry="1.4" fill="#EE7A2A" opacity=".85" />
      <g className="orb">
        <circle cx="25.5" cy="6.5" r="4" fill="#EE7A2A" stroke="#2B2825" strokeWidth="1.5" />
      </g>
    </svg>
  )
}
