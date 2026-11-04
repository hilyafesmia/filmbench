// Shared test helpers. Fixtures are generated in the browser so the repo
// carries no binary test images.

/** Render a synthetic scan in the page and return its encoded bytes. */
async function makeImage(page, { width, height, type = 'image/jpeg', dot = null }) {
  const bytes = await page.evaluate(
    async ({ width, height, type, dot }) => {
      const c = document.createElement('canvas');
      c.width = width;
      c.height = height;
      const ctx = c.getContext('2d');
      const g = ctx.createLinearGradient(0, 0, width, height);
      g.addColorStop(0, '#3a3a3a');
      g.addColorStop(1, '#8a8a8a');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, width, height);
      // a static "background" object
      ctx.fillStyle = '#2050c0';
      ctx.fillRect(width * 0.1, height * 0.1, width * 0.1, height * 0.1);
      if (dot) {
        ctx.fillStyle = '#ff0000';
        ctx.beginPath();
        ctx.arc(dot.x, dot.y, dot.r || 14, 0, Math.PI * 2);
        ctx.fill();
      }
      const blob = await new Promise((r) => c.toBlob(r, type, 0.92));
      return Array.from(new Uint8Array(await blob.arrayBuffer()));
    },
    { width, height, type, dot }
  );
  return Buffer.from(bytes);
}

/** Pixel size from PNG IHDR or JPEG SOF. */
function imageSize(buf) {
  if (buf[0] === 0x89 && buf.toString('ascii', 1, 4) === 'PNG') {
    return { type: 'png', width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
  }
  if (buf[0] === 0xff && buf[1] === 0xd8) {
    let i = 2;
    while (i < buf.length) {
      if (buf[i] !== 0xff) { i++; continue; }
      const marker = buf[i + 1];
      const len = buf.readUInt16BE(i + 2);
      if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
        return { type: 'jpeg', height: buf.readUInt16BE(i + 5), width: buf.readUInt16BE(i + 7) };
      }
      i += 2 + len;
    }
  }
  throw new Error('Unknown image format');
}

/**
 * Decode every frame of a GIF in the page (WebCodecs ImageDecoder) and
 * return its size plus the centroid of the red "subject" dot in each frame.
 */
async function analyseGif(page, gifBytes) {
  return page.evaluate(async (arr) => {
    const data = new Uint8Array(arr);
    const dec = new ImageDecoder({ data, type: 'image/gif' });
    await dec.tracks.ready;
    const count = dec.tracks.selectedTrack.frameCount;
    const frames = [];
    let width = 0, height = 0;
    for (let i = 0; i < count; i++) {
      const { image } = await dec.decode({ frameIndex: i });
      width = image.displayWidth;
      height = image.displayHeight;
      const c = new OffscreenCanvas(width, height);
      const ctx = c.getContext('2d');
      ctx.drawImage(image, 0, 0);
      const px = ctx.getImageData(0, 0, width, height).data;
      let sx = 0, sy = 0, n = 0;
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          const o = (y * width + x) * 4;
          if (px[o] > 180 && px[o + 1] < 90 && px[o + 2] < 90) { sx += x; sy += y; n++; }
        }
      }
      frames.push(n ? { x: sx / n, y: sy / n } : null);
      image.close();
    }
    return { width, height, count, frames };
  }, Array.from(gifBytes));
}

/** Click a point given in source-image pixels on a canvas displayed scaled. */
async function clickSourcePoint(page, selector, srcW, srcH, x, y) {
  const box = await page.locator(selector).boundingBox();
  await page.mouse.click(box.x + (x / srcW) * box.width, box.y + (y / srcH) * box.height);
}

module.exports = { makeImage, imageSize, analyseGif, clickSourcePoint };
