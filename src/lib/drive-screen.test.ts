import { describe, expect, test } from "bun:test"
import { shotCrop, shotMarks, shotPoint, shotSize, type ShotFrame } from "../../supabase/functions/_shared/drive-screen"

/** A Retina laptop's tab: 1440 x 900 CSS pixels, captured at 2x, shown to Broods at 1280 x 800. */
const RETINA: ShotFrame = { width: 1280, height: 800, viewportWidth: 1440, frameX: 0, frameY: 0 }

describe("the screenshot Broods gets", () => {
  test("is at most 1280 wide and keeps the tab's shape, never enlarged", () => {
    expect(shotSize(2880, 1800)).toEqual({ width: 1280, height: 800 })
    expect(shotSize(1024, 768)).toEqual({ width: 1024, height: 768 })
  })
})

describe("click_at points", () => {
  test("map back to the tab's CSS pixels through the picture's scale", () => {
    expect(shotPoint(640, 400, RETINA)).toEqual({ x: 720, y: 450, tabX: 720, tabY: 450 })
  })
  test("use one scale for both axes, also when the capture shows less height than the viewport (Chrome's debugging bar)", () => {
    expect(shotPoint(640, 600, { ...RETINA, height: 650 })).toEqual({ x: 720, y: 675, tabX: 720, tabY: 675 })
  })
  test("in an embedded form's frame land in the frame's own pixels, and the tab's for the real mouse", () => {
    const framed = { ...RETINA, frameX: 100, frameY: 150 }
    expect(shotPoint(640, 400, framed)).toEqual({ x: 620, y: 300, tabX: 720, tabY: 450 })
  })
  test("outside the picture, or not numbers, are refused", () => {
    expect(shotPoint(1300, 10, RETINA)).toBeNull()
    expect(shotPoint(-1, 10, RETINA)).toBeNull()
    expect(shotPoint(Number.NaN, 10, RETINA)).toBeNull()
  })
})

describe("marks (the read_page ids drawn on the picture)", () => {
  test("sit where click_at presses them: a mark's centre maps back to the element's centre", () => {
    const framed = { ...RETINA, frameX: 100, frameY: 150 }
    const [mark] = shotMarks([{ id: "b3", label: "  Next\n step ", left: 200, top: 300, width: 90, height: 36 }], framed)
    expect(mark).toEqual({ id: "b3", label: "Next step", x: 307, y: 416, box: [267, 400, 347, 432] })
    const back = shotPoint(mark!.x, mark!.y, framed)!
    expect(Math.abs(back.x - 245)).toBeLessThan(1)
    expect(Math.abs(back.y - 318)).toBeLessThan(1)
  })
  test("only what is on the picture and big enough to press, cut to its edge, at most 40", () => {
    const rects = [
      { id: "f0", label: "Below the fold", left: 10, top: 950, width: 200, height: 30 },
      { id: "f1", label: "A hidden box", left: 10, top: 10, width: 2, height: 2 },
      { id: "f2", label: "Half off the top", left: 10, top: -20, width: 200, height: 40 },
    ]
    expect(shotMarks(rects, RETINA).map((m) => [m.id, m.box[1]])).toEqual([["f2", 0]])
    const many = Array.from({ length: 60 }, (_, i) => ({ id: `b${i}`, label: "x", left: 0, top: i * 10, width: 50, height: 8 }))
    expect(shotMarks(many, RETINA)).toHaveLength(40)
  })
})

describe("a zoom", () => {
  test("crops the capture's own pixels of that region and enlarges it to fit the full picture's size, at most 3x", () => {
    // 400 x 200 picture pixels of a 2880-wide capture: 900 x 450 capture pixels, shown at 1280 x 640.
    expect(shotCrop([100, 100, 500, 300], RETINA, 2880, 1800)).toEqual({ sx: 225, sy: 225, sw: 900, sh: 450, width: 1280, height: 640 })
    // A small region of a 1x capture is enlarged 3x, no more.
    const flat = { ...RETINA, viewportWidth: 1280 }
    expect(shotCrop([0, 0, 100, 50], flat, 1280, 800)).toEqual({ sx: 0, sy: 0, sw: 100, sh: 50, width: 300, height: 150 })
  })
  test("of nothing, or not four numbers, is refused", () => {
    expect(shotCrop([10, 10, 12, 12], RETINA, 2880, 1800)).toBeNull()
    expect(shotCrop([2000, 2000, 2400, 2400], RETINA, 2880, 1800)).toBeNull()
    expect(shotCrop([1, 2, 3], RETINA, 2880, 1800)).toBeNull()
    expect(shotCrop("all", RETINA, 2880, 1800)).toBeNull()
  })
})
