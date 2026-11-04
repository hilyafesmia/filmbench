import {
  openImage, OpenError, showError, clearNotice, acceptDrops,
  MIME_FOR, EXT_FOR, formatBytes, baseName,
} from '../assets/js/image-input.js';

const $ = (id) => document.getElementById(id);
const input = $('scan-input');
const stage = $('stage');
const empty = $('empty');
const wrap = $('crop-wrap');
const preview = $('preview');
const frame = $('crop-frame');
const fileLine = $('file-line');
const openNotice = $('open-notice');
const exportNotice = $('export-notice');
const downloadBtn = $('download-btn');
const customFields = $('custom-fields');

/** Currently loaded scan, or null. Crop is kept in SOURCE pixels. */
let scan = null; // { img, url, W, H, name, kind }
let ratio = 1.85;
let crop = { x: 0, y: 0, w: 0, h: 0 };
let openToken = 0;

const narrow = matchMedia('(max-width: 800px)');

// ---------- Opening ----------

input.addEventListener('change', () => {
  if (input.files[0]) open(input.files[0]);
  input.value = '';
});
acceptDrops(stage, (files) => open(files[0]));

async function open(file) {
  const token = ++openToken;
  clearNotice(openNotice);
  fileLine.innerHTML = '<span class="spinner" aria-hidden="true"></span>';
  fileLine.append(`Opening ${file.name}…`);
  try {
    const { img, url, kind } = await openImage(file);
    if (token !== openToken) return URL.revokeObjectURL(url);
    if (scan) URL.revokeObjectURL(scan.url);
    scan = { img, url, W: img.naturalWidth, H: img.naturalHeight, name: file.name, kind };
    preview.src = url;
    empty.hidden = true;
    wrap.hidden = false;
    downloadBtn.disabled = false;
    setExportNotice('');
    fileLine.textContent = file.name;
    fitCrop(true);
    layout();
  } catch (err) {
    if (token !== openToken) return;
    fileLine.textContent = scan ? scan.name : '';
    showError(openNotice, err instanceof OpenError ? err : new OpenError(file.name, String(err.message || err)));
  }
}

// ---------- Ratio ----------

$('ratios').addEventListener('change', (e) => {
  if (e.target.name !== 'ratio') return;
  const custom = e.target.value === 'custom';
  customFields.hidden = !custom;
  if (custom) applyCustom();
  else setRatio(parseFloat(e.target.value));
});

customFields.addEventListener('submit', (e) => {
  e.preventDefault();
  applyCustom();
});

function applyCustom() {
  const w = parseFloat($('custom-w').value);
  const h = parseFloat($('custom-h').value);
  if (w > 0 && h > 0) setRatio(w / h);
}

function setRatio(r) {
  ratio = r;
  if (scan) fitCrop(false);
}

/** Largest crop of the current ratio, centred (or kept around the old centre). */
function fitCrop(recenter) {
  const { W, H } = scan;
  let w = W;
  let h = Math.round(W / ratio);
  if (h > H) {
    h = H;
    w = Math.min(W, Math.round(H * ratio));
  }
  const cx = recenter ? W / 2 : crop.x + crop.w / 2;
  const cy = recenter ? H / 2 : crop.y + crop.h / 2;
  crop = { w, h, x: 0, y: 0 };
  moveTo(cx - w / 2, cy - h / 2);
}

function moveTo(x, y) {
  crop.x = Math.round(Math.min(Math.max(0, x), scan.W - crop.w));
  crop.y = Math.round(Math.min(Math.max(0, y), scan.H - crop.h));
  drawFrame();
}

// ---------- Display ----------

function layout() {
  if (!scan) return;
  const pad = narrow.matches ? 24 : 48;
  const availW = stage.clientWidth - pad;
  const availH = narrow.matches ? window.innerHeight * 0.62 : stage.clientHeight - pad;
  const fit = Math.min(availW / scan.W, availH / scan.H, 1);
  preview.style.width = `${Math.floor(scan.W * fit)}px`;
  preview.style.height = `${Math.floor(scan.H * fit)}px`;
  drawFrame();
}
new ResizeObserver(layout).observe(stage);

function drawFrame() {
  const { W, H } = scan;
  Object.assign(frame.style, {
    left: `${(crop.x / W) * 100}%`,
    top: `${(crop.y / H) * 100}%`,
    width: `${(crop.w / W) * 100}%`,
    height: `${(crop.h / H) * 100}%`,
  });
  $('ro-original').textContent = `${W}×${H}`;
  $('ro-crop').textContent = `${crop.w}×${crop.h}`;
  const out = outputFormat(scan.kind);
  $('ro-format').textContent = `${scan.kind.toUpperCase()} → ${out.ext === 'jpg' ? 'JPEG' : out.ext.toUpperCase()}`;
}

// ---------- Moving the frame (pointer + keyboard) ----------

let drag = null;
frame.addEventListener('pointerdown', (e) => {
  if (!scan) return;
  e.preventDefault();
  frame.setPointerCapture(e.pointerId);
  frame.classList.add('is-dragging');
  drag = { id: e.pointerId, sx: e.clientX, sy: e.clientY, x: crop.x, y: crop.y, k: scan.W / preview.clientWidth };
});
frame.addEventListener('pointermove', (e) => {
  if (!drag || e.pointerId !== drag.id) return;
  moveTo(drag.x + (e.clientX - drag.sx) * drag.k, drag.y + (e.clientY - drag.sy) * drag.k);
});
const endDrag = () => { drag = null; frame.classList.remove('is-dragging'); };
frame.addEventListener('pointerup', endDrag);
frame.addEventListener('pointercancel', endDrag);

frame.addEventListener('keydown', (e) => {
  const dirs = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
  const d = dirs[e.key];
  if (!d || !scan) return;
  e.preventDefault();
  const step = Math.max(1, Math.round(Math.max(scan.W, scan.H) * (e.shiftKey ? 0.05 : 0.005)));
  moveTo(crop.x + d[0] * step, crop.y + d[1] * step);
});

// ---------- Export ----------

function outputFormat(kind) {
  if (MIME_FOR[kind]) return { mime: MIME_FOR[kind], ext: EXT_FOR[kind] };
  // HEIC/AVIF (photos) → JPEG; TIFF/GIF/other (lossless sources) → PNG.
  if (kind === 'heic' || kind === 'avif') return { mime: 'image/jpeg', ext: 'jpg' };
  return { mime: 'image/png', ext: 'png' };
}

function ratioLabel() {
  return `${Math.round(ratio * 100) / 100}x1`;
}

function setExportNotice(text, isError = false) {
  exportNotice.className = isError ? 'notice notice-error' : 'notice';
  exportNotice.textContent = text;
}

downloadBtn.addEventListener('click', async () => {
  if (!scan) return;
  downloadBtn.disabled = true;
  downloadBtn.setAttribute('aria-busy', 'true');
  setExportNotice('Exporting…');
  try {
    const { mime, ext } = outputFormat(scan.kind);
    const canvas = document.createElement('canvas');
    canvas.width = crop.w;
    canvas.height = crop.h;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(scan.img, crop.x, crop.y, crop.w, crop.h, 0, 0, crop.w, crop.h);
    const quality = mime === 'image/png' ? undefined : 0.92;
    const blob = await new Promise((res) => canvas.toBlob(res, mime, quality));
    if (!blob) throw new Error('canvas');
    const name = `${baseName(scan.name)}_${ratioLabel()}.${ext}`;
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
    exportNotice.className = 'notice';
    exportNotice.replaceChildren('Saved ');
    const n = document.createElement('span');
    n.className = 'mono';
    n.textContent = `${name} · ${formatBytes(blob.size)}`;
    exportNotice.append(n);
  } catch {
    setExportNotice(
      `Export failed. A ${crop.w}×${crop.h} crop may be larger than this browser can draw. Try Chrome or Firefox on a desktop, or crop from a smaller scan.`,
      true
    );
  } finally {
    downloadBtn.disabled = false;
    downloadBtn.removeAttribute('aria-busy');
  }
});
