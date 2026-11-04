// Magnifier for precise pinning. On touch it floats above the finger (which
// would otherwise hide the point); with a mouse it sits up and to the right.

const SIZE = 132;

export function createLoupe() {
  const el = document.createElement('canvas');
  el.id = 'loupe';
  el.className = 'loupe';
  el.width = SIZE * devicePixelRatio;
  el.height = SIZE * devicePixelRatio;
  el.hidden = true;
  el.setAttribute('aria-hidden', 'true');
  document.body.append(el);
  const ctx = el.getContext('2d');

  /**
   * @param {number} clientX, clientY  pointer position
   * @param {string} pointerType
   * @param {CanvasImageSource} source  full-resolution image
   * @param {number} sx, sy  point in source pixels
   * @param {number} displayScale  displayed px per source px
   */
  function show(clientX, clientY, pointerType, source, sx, sy, displayScale) {
    const touch = pointerType !== 'mouse';
    let left = touch ? clientX - SIZE / 2 : clientX + 24;
    let top = touch ? clientY - SIZE - 48 : clientY - SIZE - 24;
    if (top < 8) top = touch ? clientY + 48 : clientY + 24;
    left = Math.min(Math.max(8, left), innerWidth - SIZE - 8);
    el.style.left = `${left}px`;
    el.style.top = `${top}px`;
    el.hidden = false;

    // Magnify ~4× relative to what's on screen, but never below 2 loupe px per source px.
    const zoom = Math.max(2, displayScale * 4);
    const region = SIZE / zoom;
    const d = devicePixelRatio;
    ctx.save();
    ctx.setTransform(d, 0, 0, d, 0, 0);
    ctx.fillStyle = '#0b0b0b';
    ctx.fillRect(0, 0, SIZE, SIZE);
    ctx.beginPath();
    ctx.arc(SIZE / 2, SIZE / 2, SIZE / 2, 0, Math.PI * 2);
    ctx.clip();
    ctx.imageSmoothingEnabled = zoom < 3;
    ctx.drawImage(source, sx - region / 2, sy - region / 2, region, region, 0, 0, SIZE, SIZE);
    // crosshair with a gap at the exact point
    ctx.strokeStyle = '#f2a53a';
    ctx.lineWidth = 1;
    const c = SIZE / 2, g = 5, l = 16;
    ctx.beginPath();
    ctx.moveTo(c - g - l, c); ctx.lineTo(c - g, c);
    ctx.moveTo(c + g, c); ctx.lineTo(c + g + l, c);
    ctx.moveTo(c, c - g - l); ctx.lineTo(c, c - g);
    ctx.moveTo(c, c + g); ctx.lineTo(c, c + g + l);
    ctx.stroke();
    ctx.restore();
  }

  function hide() {
    el.hidden = true;
  }

  return { show, hide, el };
}
