/** A square, small picture from whatever was chosen, made here so nothing big is stored. */
export function shrink(source: File | string): Promise<string> {
  return new Promise((resolve, reject) => {
    const url = typeof source === "string" ? source : URL.createObjectURL(source)
    const img = new Image()
    img.onload = () => {
      const side = Math.min(img.width, img.height)
      const canvas = document.createElement("canvas")
      canvas.width = canvas.height = 256
      canvas.getContext("2d")?.drawImage(img, (img.width - side) / 2, (img.height - side) / 2, side, side, 0, 0, 256, 256)
      if (typeof source !== "string") {
        URL.revokeObjectURL(url)
      }
      resolve(canvas.toDataURL("image/jpeg", 0.85))
    }
    img.onerror = () => reject(new Error("That file is not a picture we can read."))
    img.src = url
  })
}
