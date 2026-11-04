// Opening image files: decode first (Safari can open TIFF/HEIC), and if that
// fails, sniff the first bytes so the error says what the file is and what to do.

const SIGNATURES = [
  { kind: 'jpeg', test: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  { kind: 'png', test: (b) => b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 },
  { kind: 'gif', test: (b) => ascii(b, 0, 3) === 'GIF' },
  { kind: 'webp', test: (b) => ascii(b, 0, 4) === 'RIFF' && ascii(b, 8, 12) === 'WEBP' },
  {
    kind: 'tiff',
    test: (b) =>
      (b[0] === 0x49 && b[1] === 0x49 && b[2] === 0x2a && b[3] === 0x00) ||
      (b[0] === 0x4d && b[1] === 0x4d && b[2] === 0x00 && b[3] === 0x2a),
  },
  { kind: 'heic', test: (b) => ascii(b, 4, 8) === 'ftyp' && /^(heic|heix|hevc|hevx|mif1|msf1)$/.test(ascii(b, 8, 12)) },
  { kind: 'avif', test: (b) => ascii(b, 4, 8) === 'ftyp' && /^avi[fs]$/.test(ascii(b, 8, 12)) },
];

function ascii(b, from, to) {
  return String.fromCharCode(...b.slice(from, to));
}

export async function sniff(file) {
  const head = new Uint8Array(await file.slice(0, 16).arrayBuffer());
  return SIGNATURES.find((s) => s.test(head))?.kind ?? 'unknown';
}

/** Error with a user-facing message. `fileName` is shown in mono. */
export class OpenError extends Error {
  constructor(fileName, message) {
    super(message);
    this.fileName = fileName;
  }
}

function messageFor(kind) {
  switch (kind) {
    case 'tiff':
      return 'TIFF scans can only be opened in Safari. Export a JPEG or PNG from your scanning software, or open this page in Safari.';
    case 'heic':
      return 'HEIC photos can only be opened in Safari. Export as JPEG (on iPhone: Settings → Camera → Formats → Most Compatible), or open this page in Safari.';
    case 'avif':
      return "This browser can't decode AVIF. Try a current Chrome, Firefox or Safari, or export a JPEG.";
    case 'unknown':
      return "This isn't an image this browser can read. Use JPEG, PNG or WebP. Raw camera files need converting first.";
    default:
      return "The file looks like an image but couldn't be decoded. It may be damaged or too large for this browser.";
  }
}

/**
 * Decode a File into an HTMLImageElement.
 * Resolves { img, url, kind }; rejects with OpenError.
 */
export async function openImage(file) {
  const url = URL.createObjectURL(file);
  const img = new Image();
  try {
    // load/error events rather than img.decode(): decode() can stay pending
    // while the page isn't rendering (e.g. a background tab).
    await new Promise((resolve, reject) => {
      img.onload = resolve;
      img.onerror = reject;
      img.src = url;
    });
    if (!img.naturalWidth) throw new Error('empty');
    return { img, url, kind: await sniff(file) };
  } catch {
    URL.revokeObjectURL(url);
    throw new OpenError(file.name, messageFor(await sniff(file)));
  }
}

export const MIME_FOR = { jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp' };
export const EXT_FOR = { jpeg: 'jpg', png: 'png', webp: 'webp' };

export function formatBytes(n) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

export function baseName(name) {
  return name.replace(/\.[^.]+$/, '');
}

/** Render an error into a notice element (role="alert" region). */
export function showError(el, err) {
  el.className = 'notice notice-error';
  el.replaceChildren();
  if (err.fileName) {
    const f = document.createElement('strong');
    f.className = 'mono';
    f.textContent = err.fileName;
    el.append(f, document.createElement('br'));
  }
  el.append(err.message);
}

export function clearNotice(el) {
  el.className = 'notice';
  el.replaceChildren();
}

/** Make an element accept dropped files. */
export function acceptDrops(target, onFiles) {
  let depth = 0;
  target.addEventListener('dragenter', (e) => { e.preventDefault(); depth++; target.classList.add('is-dragover'); });
  target.addEventListener('dragover', (e) => e.preventDefault());
  target.addEventListener('dragleave', () => { if (--depth <= 0) { depth = 0; target.classList.remove('is-dragover'); } });
  target.addEventListener('drop', (e) => {
    e.preventDefault();
    depth = 0;
    target.classList.remove('is-dragover');
    if (e.dataTransfer?.files?.length) onFiles(e.dataTransfer.files);
  });
}
