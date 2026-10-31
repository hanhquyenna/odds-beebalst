/**
 * Where a screenshot's pixels are on the page. The extension's background takes the picture of the tab, draws the read_page ids on
 * it and crops a zoom; the frame that drives the form (the page, or an embedded ATS frame) turns a click_at point back into its own
 * CSS pixels. Both use these functions (built into extension/job-sites.js), so what Broods sees and where it clicks agree.
 */

/** The widest picture Broods gets: about 1,200 image tokens, the size computer-use guides recommend for web pages (1280x720 to 1280x800). */
export const SHOT_MAX_WIDTH = 1280
/** A zoom fits in this box (the full picture's size). */
const ZOOM_MAX_HEIGHT = 800
/** A zoom is enlarged at most this much: past that a small crop only shows bigger pixels. */
const ZOOM_MAX_SCALE = 3
/** At most this many read_page ids are drawn on one picture. */
const MAX_MARKS = 40
/** Smaller boxes than this (CSS pixels) are not drawn: nothing to press there. */
const MIN_MARK_SIZE = 4

/**
 * One full screenshot: its size in pixels, the tab's viewport width in CSS pixels, and where the driving frame's (0, 0) sits in that
 * viewport. Pixels are square, so the width alone gives the scale: the capture can show less height than the viewport claims (Chrome's
 * debugging bar while Odds clicks for real).
 */
export interface ShotFrame {
  width: number
  height: number
  viewportWidth: number
  frameX: number
  frameY: number
}

/** An element's box in the driving frame's CSS pixels (getBoundingClientRect), with its read_page id and words. */
export interface MarkRect {
  id: string
  label: string
  left: number
  top: number
  width: number
  height: number
}

/** A read_page id as drawn on the picture: its box [x1, y1, x2, y2] in image pixels and its centre (where click_at presses it). */
export interface ShotMark {
  id: string
  label: string
  x: number
  y: number
  box: [number, number, number, number]
}

/** The part of the capture (device pixels) a zoom shows, and the zoomed picture's size. */
export interface ShotCrop {
  sx: number
  sy: number
  sw: number
  sh: number
  width: number
  height: number
}

/** A point in the tab, in the driving frame's CSS pixels (for elementFromPoint) and the tab's (for Chrome's real mouse). */
export interface ShotPoint {
  x: number
  y: number
  tabX: number
  tabY: number
}

/**
 * The capture's part a zoom of `region` ([x1, y1, x2, y2] in pixels of the last full screenshot) shows, enlarged to fit the full
 * picture's size (at most 3x). Null when the region is not four numbers or holds almost nothing of that screenshot.
 */
export function shotCrop(region: unknown, shot: ShotFrame, captureWidth: number, captureHeight: number): ShotCrop | null {
  if (!Array.isArray(region) || region.length !== 4 || !region.every((n) => typeof n === "number" && Number.isFinite(n))) return null
  const [x1, y1, x2, y2] = region as [number, number, number, number]
  const left = clamp(Math.min(x1, x2), 0, shot.width)
  const right = clamp(Math.max(x1, x2), 0, shot.width)
  const top = clamp(Math.min(y1, y2), 0, shot.height)
  const bottom = clamp(Math.max(y1, y2), 0, shot.height)
  if (right - left < MIN_MARK_SIZE || bottom - top < MIN_MARK_SIZE) return null
  const k = captureWidth / shot.width
  const sw = (right - left) * k
  const sh = Math.min(bottom * k, captureHeight) - top * k
  if (sh < MIN_MARK_SIZE) return null
  const scale = Math.min(SHOT_MAX_WIDTH / sw, ZOOM_MAX_HEIGHT / sh, ZOOM_MAX_SCALE)

  return { sx: left * k, sy: top * k, sw: sw, sh: sh, width: Math.round(sw * scale), height: Math.round(sh * scale) }
}

/** The read_page ids to draw on a picture: each box in image pixels, cut to the picture, and only those on it (at most 40). */
export function shotMarks(rects: ReadonlyArray<MarkRect>, shot: ShotFrame): ShotMark[] {
  const k = shot.width / shot.viewportWidth
  const out: ShotMark[] = []
  for (const r of rects) {
    if (out.length >= MAX_MARKS) break
    if (!(r.width >= MIN_MARK_SIZE && r.height >= MIN_MARK_SIZE)) continue
    const x1 = (r.left + shot.frameX) * k
    const y1 = (r.top + shot.frameY) * k
    const x2 = x1 + r.width * k
    const y2 = y1 + r.height * k
    if (x2 <= 0 || y2 <= 0 || x1 >= shot.width || y1 >= shot.height) continue
    const box: [number, number, number, number] = [Math.round(clamp(x1, 0, shot.width)), Math.round(clamp(y1, 0, shot.height)), Math.round(clamp(x2, 0, shot.width)), Math.round(clamp(y2, 0, shot.height))]
    out.push({ id: r.id, label: r.label.replace(/\s+/g, " ").trim().slice(0, 40), x: Math.round((box[0] + box[2]) / 2), y: Math.round((box[1] + box[3]) / 2), box: box })
  }

  return out
}

/** A click_at point (pixels of the last full screenshot) as a point in the tab. Null when it is not on that screenshot. */
export function shotPoint(x: number, y: number, shot: ShotFrame): ShotPoint | null {
  if (!Number.isFinite(x) || !Number.isFinite(y) || x < 0 || y < 0 || x > shot.width || y > shot.height) return null
  const tabX = (x * shot.viewportWidth) / shot.width
  const tabY = (y * shot.viewportWidth) / shot.width

  return { x: tabX - shot.frameX, y: tabY - shot.frameY, tabX: tabX, tabY: tabY }
}

/** The picture's size for a capture of captureWidth x captureHeight device pixels: at most 1280 wide, never enlarged. */
export function shotSize(captureWidth: number, captureHeight: number): { width: number; height: number } {
  const width = Math.min(SHOT_MAX_WIDTH, captureWidth)

  return { width: width, height: Math.round((captureHeight * width) / captureWidth) }
}

function clamp(n: number, low: number, high: number): number {
  return Math.min(high, Math.max(low, n))
}
