// Runs before the page loads so Safari reads the right manifest: iPhones get
// one without a start address, so the Home Screen app opens the address it
// was added from, which carries the one-time code that signs it in.
document.write('<link rel="manifest" href="/manifest' + (/iPhone|iPad|iPod/.test(navigator.userAgent) || (/Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints > 1) ? "-ios" : "") + '.webmanifest" />')
