/* global faceapi, GIF */
import { openImage, OpenError, showError, clearNotice, acceptDrops, formatBytes, baseName } from '../assets/js/image-input.js';
import { createLoupe } from '../assets/js/loupe.js';

const MODEL_URL = '../vendor/face-api/models';
const WORKER_URL = '../vendor/gif.js/gif.worker.js';
const FRAME_DELAY = 100;

const $ = (id) => document.getElementById(id);
const el = {
  input: $('frames-input'),
  strip: $('strip'),
  framesNotice: $('frames-notice'),
  stepAlign: $('step-align'),
  stepOutput: $('step-output'),
  modes: $('modes'),
  alignStatus: $('align-status'),
  pinRow: $('pin-row'),
  pinCounter: $('pin-counter'),
  undo: $('undo-pin'),
  sizes: $('sizes'),
  sizeNote: $('size-note'),
  origSize: $('orig-size'),
  render: $('render-btn'),
  progress: $('progress'),
  outputNotice: $('output-notice'),
  resultActions: $('result-actions'),
  download: $('download-gif'),
  startOver: $('start-over'),
  stage: $('stage'),
  empty: $('empty'),
  canvas: $('stage-canvas'),
  result: $('result'),
};
const ctx = el.canvas.getContext('2d');
const loupe = createLoupe();
const narrow = matchMedia('(max-width: 800px)');

// ---------- State ----------

let frames = [];        // [{ img, url, name, W, H }]
let ref = 0;            // reference frame index (middle)
let token = 0;          // bumps on every mode change / reset to cancel async work
let offsets = null;     // [{x, y}] in source px once aligned
let faces = null;       // auto: detections on the reference frame awaiting a pick
let pins = [];          // manual: [{x, y}] per frame
let pinIndex = 0;
let busy = false;       // ignore canvas input while true
let gifUrl = null;
let rendering = false;

// ---------- Face models (vendored, loaded once, in the background) ----------

let modelsPromise = null;
function loadModels() {
  if (!modelsPromise) {
    modelsPromise = (async () => {
      if (typeof faceapi === 'undefined') throw new Error('face-api.js missing');
      await faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL);
      await faceapi.nets.faceLandmark68TinyNet.loadFromUri(MODEL_URL);
    })().catch((e) => {
      modelsPromise = null; // allow a retry later
      throw e;
    });
  }
  return modelsPromise;
}
(window.requestIdleCallback || ((f) => setTimeout(f, 300)))(() => loadModels().catch(() => {}));

// ---------- Helpers ----------

function setStatus(html, { spin = false } = {}) {
  el.alignStatus.innerHTML = (spin ? '<span class="spinner" aria-hidden="true"></span>' : '') + html;
}
const esc = (s) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const frameLabel = (i) => `frame ${i + 1}`;
const pad2 = (n) => String(n).padStart(2, '0');
const SWITCH_BTN = '<br><button class="btn" type="button" data-use-manual style="margin-top:10px">Use manual pins</button>';
el.alignStatus.addEventListener('click', (e) => {
  if (!e.target.closest('[data-use-manual]')) return;
  el.modes.querySelector('#m-manual').checked = true;
  startMode('manual');
});

function setStepEnabled(step, on) {
  step.setAttribute('aria-disabled', on ? 'false' : 'true');
  step.querySelectorAll('input, button').forEach((c) => { if (!c.closest('#result-actions')) c.disabled = !on; });
}

function sourcePoint(e) {
  const r = el.canvas.getBoundingClientRect();
  return {
    x: ((e.clientX - r.left) * el.canvas.width) / r.width,
    y: ((e.clientY - r.top) * el.canvas.height) / r.height,
    scale: r.width / el.canvas.width,
  };
}

// ---------- Layout ----------

function fit(node, W, H) {
  const pad = narrow.matches ? 24 : 48;
  const availW = el.stage.clientWidth - pad;
  const availH = narrow.matches ? innerHeight * 0.62 : el.stage.clientHeight - pad;
  const k = Math.min(availW / W, availH / H, 1);
  node.style.width = `${Math.floor(W * k)}px`;
  node.style.height = `${Math.floor(H * k)}px`;
}
function layout() {
  if (!frames.length) return;
  if (!el.canvas.hidden) fit(el.canvas, el.canvas.width, el.canvas.height);
  if (!el.result.hidden) fit(el.result, frames[ref].W, frames[ref].H);
}
new ResizeObserver(layout).observe(el.stage);

function showCanvas() {
  el.result.hidden = true;
  el.canvas.hidden = false;
  el.empty.hidden = true;
  layout();
}

/** Draw frame i on the stage canvas, plus its pin / face boxes. */
function showFrame(i, { boxes = null } = {}) {
  const f = frames[i];
  el.canvas.width = f.W;
  el.canvas.height = f.H;
  ctx.drawImage(f.img, 0, 0);
  const lw = Math.max(2, f.W / 400);
  if (boxes) {
    ctx.strokeStyle = '#f2a53a';
    ctx.lineWidth = lw;
    boxes.forEach((d) => {
      const b = d.detection.box;
      ctx.strokeRect(b.x, b.y, b.width, b.height);
    });
  }
  if (pins[i]) drawPin(pins[i], f.W);
  showCanvas();
  renderStrip(i);
}

function drawPin(p, W) {
  const r = Math.max(6, W / 160);
  ctx.lineWidth = Math.max(1.5, r / 4);
  ctx.strokeStyle = '#0b0b0b';
  ctx.beginPath(); ctx.arc(p.x, p.y, r + ctx.lineWidth, 0, Math.PI * 2); ctx.stroke();
  ctx.strokeStyle = '#f2a53a';
  ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, Math.PI * 2); ctx.stroke();
  ctx.fillStyle = '#f2a53a';
  ctx.beginPath(); ctx.arc(p.x, p.y, Math.max(1.5, r / 5), 0, Math.PI * 2); ctx.fill();
}

function renderStrip(current = -1) {
  el.strip.replaceChildren(
    ...frames.map((f, i) => {
      const li = document.createElement('li');
      li.classList.toggle('is-current', i === current);
      li.classList.toggle('is-pinned', !!pins[i]);
      li.innerHTML = `<span class="readout n">${pad2(i + 1)}</span><span class="readout filename name"></span><span class="readout tag">${i === ref ? 'REF' : ''}</span>`;
      li.querySelector('.name').textContent = f.name;
      li.title = f.name;
      return li;
    })
  );
}

function updateReadouts() {
  $('ro-frames').textContent = frames.length ? String(frames.length) : '—';
  $('ro-ref').textContent = frames.length ? `${ref + 1}/${frames.length}` : '—';
  $('ro-source').textContent = frames.length ? `${frames[ref].W}×${frames[ref].H}` : '—';
  const o = outputSize();
  $('ro-out').textContent = o ? `${o.w}×${o.h}` : '—';
}

// ---------- 01 Frames ----------

el.input.addEventListener('change', () => {
  if (el.input.files.length) loadFrames(el.input.files);
  el.input.value = '';
});
acceptDrops(el.stage, loadFrames);

async function loadFrames(fileList) {
  clearNotice(el.framesNotice);
  const files = Array.from(fileList).sort((a, b) =>
    a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' })
  );
  if (files.length < 2) {
    showError(el.framesNotice, new OpenError(null, `Choose at least 2 frames from the same shot. You picked ${files.length}.`));
    return;
  }
  const t = ++token;
  setStatus(`Opening ${files.length} frames…`, { spin: true });
  let opened;
  try {
    opened = await Promise.all(files.map((f) => openImage(f).then((r) => ({ ...r, name: f.name }))));
  } catch (err) {
    if (t !== token) return;
    setStatus('');
    showError(el.framesNotice, err instanceof OpenError ? err : new OpenError(null, 'One of the frames could not be opened.'));
    return;
  }
  if (t !== token) return;
  resetAll({ keepInputs: true });
  frames = opened.map(({ img, url, name }) => ({ img, url, name, W: img.naturalWidth, H: img.naturalHeight }));
  ref = Math.floor((frames.length - 1) / 2);
  pins = [];
  el.origSize.textContent = `${Math.max(frames[ref].W, frames[ref].H)} px`;
  setStepEnabled(el.stepAlign, true);
  updateReadouts();
  updateSizeNote();
  startMode(currentMode());
}

// ---------- 02 Align ----------

const currentMode = () => el.modes.querySelector('input:checked').value;
el.modes.addEventListener('change', () => frames.length && startMode(currentMode()));

function startMode(mode) {
  token++;
  unalign();
  faces = null;
  busy = false;
  loupe.hide();
  el.canvas.classList.remove('is-picking', 'is-pinning');
  el.pinRow.hidden = mode !== 'manual';
  if (mode === 'manual') startManual();
  else runAuto(token);
}

async function runAuto(t) {
  showFrame(ref);
  setStatus('Loading face detection…', { spin: true });
  try {
    await loadModels();
  } catch {
    if (t !== token) return;
    setStatus(`Couldn't load face detection. Manual pins still work.${SWITCH_BTN}`);
    return;
  }
  if (t !== token) return;
  setStatus(`Looking for faces in ${frameLabel(ref)}…`, { spin: true });
  let dets;
  try {
    dets = await faceapi.detectAllFaces(frames[ref].img, new faceapi.TinyFaceDetectorOptions()).withFaceLandmarks(true);
  } catch {
    dets = [];
  }
  if (t !== token) return;
  if (!dets.length) {
    setStatus(`No faces found in ${frameLabel(ref)}. Grain and small faces often defeat detection.${SWITCH_BTN}`);
    return;
  }
  faces = dets;
  showFrame(ref, { boxes: dets });
  el.canvas.classList.add('is-picking');
  setStatus(dets.length === 1 ? 'Found 1 face. Tap it to hold it still.' : `Found ${dets.length} faces. Tap the one to hold still.`);
}

async function pickFace(p) {
  const hit = faces.find(({ detection: { box: b } }) => p.x >= b.x && p.x <= b.x + b.width && p.y >= b.y && p.y <= b.y + b.height);
  if (!hit) return;
  const t = token;
  faces = null;
  busy = true;
  el.canvas.classList.remove('is-picking');
  showFrame(ref, { boxes: [hit] });
  const refNose = hit.landmarks.getNose()[3];
  const rb = hit.detection.box;
  const rc = { x: rb.x + rb.width / 2, y: rb.y + rb.height / 2 };
  const result = [];
  const misses = [];
  for (let i = 0; i < frames.length; i++) {
    if (i === ref) { result.push({ x: 0, y: 0 }); continue; }
    setStatus(`Matching the face in ${frameLabel(i)}…`, { spin: true });
    let dets = [];
    try {
      dets = await faceapi.detectAllFaces(frames[i].img, new faceapi.TinyFaceDetectorOptions()).withFaceLandmarks(true);
    } catch { /* treated as a miss */ }
    if (t !== token) return;
    let best = null, min = Infinity;
    for (const d of dets) {
      const b = d.detection.box;
      const dist = Math.hypot(b.x + b.width / 2 - rc.x, b.y + b.height / 2 - rc.y);
      if (dist < min) { min = dist; best = d; }
    }
    if (best) {
      const n = best.landmarks.getNose()[3];
      result.push({ x: refNose.x - n.x, y: refNose.y - n.y });
    } else {
      result.push({ x: 0, y: 0 });
      misses.push(i + 1);
    }
  }
  busy = false;
  const warn = misses.length
    ? `<span class="warn"><strong>Not found in frame ${misses.join(', ')}.</strong> Those frames aren't aligned; Manual pins will give a steadier result.</span>`
    : '';
  setAligned(result, warn || 'Aligned on the face. Choose a size and render.');
}

function startManual() {
  pins = [];
  pinIndex = 0;
  el.canvas.classList.add('is-pinning');
  setStatus('Pin the <strong>same point</strong> on every frame, such as a nose tip, an eye or a button. Hold to magnify.');
  showPinFrame();
}

function showPinFrame() {
  const n = frames.length;
  el.undo.disabled = pinIndex === 0;
  if (pinIndex >= n) {
    el.pinCounter.textContent = `ALL ${n} PINNED`;
    el.canvas.classList.remove('is-pinning');
    const p0 = pins[ref];
    setAligned(pins.map((p) => ({ x: p0.x - p.x, y: p0.y - p.y })), 'All frames pinned. Choose a size and render.');
    showFrame(ref);
    return;
  }
  el.canvas.classList.add('is-pinning');
  el.pinCounter.textContent = `FRAME ${pinIndex + 1}/${n}`;
  showFrame(pinIndex);
}

function placePin(p) {
  pins[pinIndex] = { x: p.x, y: p.y };
  drawPin(pins[pinIndex], frames[pinIndex].W);
  pinIndex++;
  busy = true;
  const t = token;
  setTimeout(() => {
    if (t !== token) return;
    busy = false;
    showPinFrame();
  }, 120);
}

el.undo.addEventListener('click', () => {
  if (pinIndex === 0) return;
  token++;
  busy = false;
  unalign();
  pinIndex--;
  pins.length = pinIndex;
  setStatus('Pin the <strong>same point</strong> on every frame, such as a nose tip, an eye or a button. Hold to magnify.');
  showPinFrame();
});

// Canvas input: one code path for mouse, touch and pen.
let down = null;
el.canvas.addEventListener('pointerdown', (e) => {
  if (busy) return;
  const pinning = el.canvas.classList.contains('is-pinning');
  if (!pinning && !faces) return;
  e.preventDefault();
  el.canvas.setPointerCapture(e.pointerId);
  down = { id: e.pointerId, p: sourcePoint(e) };
  if (pinning) showLoupe(e, down.p);
});
el.canvas.addEventListener('pointermove', (e) => {
  if (busy || !el.canvas.classList.contains('is-pinning')) return;
  const p = sourcePoint(e);
  if (down && e.pointerId === down.id) down.p = p;
  if (down || e.pointerType === 'mouse') showLoupe(e, p);
});
el.canvas.addEventListener('pointerup', (e) => {
  if (!down || e.pointerId !== down.id) return;
  const p = down.p;
  down = null;
  if (e.pointerType !== 'mouse') loupe.hide();
  if (busy) return;
  if (el.canvas.classList.contains('is-pinning')) placePin(p);
  else if (faces) pickFace(p);
});
el.canvas.addEventListener('pointercancel', () => { down = null; loupe.hide(); });
el.canvas.addEventListener('pointerleave', (e) => { if (e.pointerType === 'mouse') loupe.hide(); });

function showLoupe(e, p) {
  const i = Math.min(pinIndex, frames.length - 1);
  loupe.show(e.clientX, e.clientY, e.pointerType, frames[i].img, p.x, p.y, p.scale);
}

// ---------- 03 Output ----------

function setAligned(o, message) {
  offsets = o;
  setStatus(message);
  setStepEnabled(el.stepOutput, true);
  el.render.disabled = rendering;
  updateReadouts();
}

function unalign() {
  offsets = null;
  setStepEnabled(el.stepOutput, false);
  clearResult();
  updateReadouts();
}

const sizeChoice = () => el.sizes.querySelector('input:checked').value;

function outputSize() {
  if (!frames.length) return null;
  const { W, H } = frames[ref];
  const long = Math.max(W, H);
  const s = sizeChoice();
  const target = s === 'original' ? long : Math.min(parseInt(s, 10), long);
  const k = target / long;
  return { w: Math.round(W * k), h: Math.round(H * k) };
}

function updateSizeNote() {
  const o = outputSize();
  clearNotice(el.sizeNote);
  if (o && sizeChoice() === 'original' && Math.max(o.w, o.h) > 1600) {
    el.sizeNote.textContent = `A ${o.w}×${o.h} GIF can be tens of MB and take a minute or more to encode. Most sites resize anything over 1080 px anyway.`;
  }
}

el.sizes.addEventListener('change', () => {
  updateSizeNote();
  updateReadouts();
});

el.render.addEventListener('click', render);

async function render() {
  if (!offsets || rendering) return;
  rendering = true;
  const t = token;
  el.render.disabled = true;
  el.render.setAttribute('aria-busy', 'true');
  el.render.textContent = 'Rendering…';
  el.progress.hidden = false;
  const bar = el.progress.firstElementChild;
  bar.style.width = '0%';
  clearNotice(el.outputNotice);
  el.resultActions.hidden = true;

  try {
    const R = frames[ref];
    const { w, h } = outputSize();
    // Align at full resolution, then downscale each composed frame.
    const work = document.createElement('canvas');
    work.width = R.W;
    work.height = R.H;
    const wctx = work.getContext('2d');
    const out = [];
    for (let i = 0; i < frames.length; i++) {
      el.outputNotice.textContent = `Composing ${frameLabel(i)}…`;
      wctx.clearRect(0, 0, R.W, R.H);
      wctx.drawImage(R.img, 0, 0); // base layer fills gaps left by shifting
      wctx.drawImage(frames[i].img, offsets[i].x, offsets[i].y);
      const c = document.createElement('canvas');
      c.width = w;
      c.height = h;
      const cctx = c.getContext('2d');
      cctx.imageSmoothingQuality = 'high';
      cctx.drawImage(work, 0, 0, w, h);
      out.push(cctx);
      await new Promise((r) => setTimeout(r, 0)); // yield; rAF would stall in a background tab
      if (t !== token) throw new Error('cancelled');
    }
    work.width = work.height = 0;

    const seq = [];
    for (let i = 0; i < out.length; i++) seq.push(i);
    for (let i = out.length - 2; i > 0; i--) seq.push(i);

    const gif = new GIF({ workers: 2, quality: 10, width: w, height: h, workerScript: WORKER_URL });
    seq.forEach((i) => gif.addFrame(out[i], { copy: true, delay: FRAME_DELAY }));
    el.outputNotice.textContent = 'Encoding GIF…';
    const blob = await new Promise((resolve, reject) => {
      gif.on('progress', (p) => { bar.style.width = `${Math.round(p * 100)}%`; });
      gif.on('finished', resolve);
      gif.on('abort', () => reject(new Error('aborted')));
      gif.render();
    });
    if (t !== token) return;

    if (gifUrl) URL.revokeObjectURL(gifUrl);
    gifUrl = URL.createObjectURL(blob);
    el.result.src = gifUrl;
    el.result.hidden = false;
    el.canvas.hidden = true;
    layout();
    el.download.href = gifUrl;
    el.download.download = `${baseName(frames[0].name)}_wiggle_${w}.gif`;
    el.download.textContent = `Download GIF · ${formatBytes(blob.size)}`;
    el.resultActions.hidden = false;
    el.resultActions.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    el.outputNotice.replaceChildren();
    const s = document.createElement('span');
    s.className = 'mono';
    s.textContent = `${w}×${h} · ${seq.length} frames · ${FRAME_DELAY} ms`;
    el.outputNotice.append(s);
  } catch (err) {
    if (t === token && err.message !== 'cancelled') {
      showError(el.outputNotice, new OpenError(null, 'Rendering failed, probably out of memory. Try a smaller output size.'));
    }
  } finally {
    rendering = false;
    el.progress.hidden = true;
    el.render.removeAttribute('aria-busy');
    el.render.textContent = 'Render GIF';
    el.render.disabled = !offsets;
  }
}

function clearResult() {
  el.resultActions.hidden = true;
  el.download.removeAttribute('href');
  clearNotice(el.outputNotice);
  if (gifUrl) URL.revokeObjectURL(gifUrl);
  gifUrl = null;
  el.result.hidden = true;
  el.result.removeAttribute('src');
  if (frames.length) el.canvas.hidden = false;
}

// ---------- Start over ----------

el.startOver.addEventListener('click', () => {
  token++;
  resetAll();
});

function resetAll({ keepInputs = false } = {}) {
  frames.forEach((f) => URL.revokeObjectURL(f.url));
  frames = [];
  pins = [];
  faces = null;
  busy = false;
  unalign();
  loupe.hide();
  el.strip.replaceChildren();
  el.canvas.hidden = true;
  el.result.hidden = true;
  el.empty.hidden = false;
  el.pinRow.hidden = true;
  el.origSize.textContent = 'full size';
  setStatus('');
  setStepEnabled(el.stepAlign, false);
  if (!keepInputs) {
    clearNotice(el.framesNotice);
    el.modes.querySelector('#m-auto').checked = true;
    el.sizes.querySelector('#z1080').checked = true;
  }
  updateSizeNote();
  updateReadouts();
}

resetAll();
