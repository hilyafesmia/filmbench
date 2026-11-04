# Filmbench — v1 design

Filmbench is a set of browser tools for film photographers. v1 merges two existing
single-file apps, Client-side-Image-Cropper and Wigglegram-Maker, into one suite.
They share a look and a shell, and each tool still works on its own.

Everything runs in the browser. No photo is ever uploaded.

## Decisions

| # | Topic | Decision |
|---|---|---|
| 1 | Suite or pipeline | **Suite.** Each tool stands alone. A pipeline (passing images between tools) may come later. |
| 2 | Structure | One repo, `filmbench`. `index.html` (landing), `crop/`, `wiggle/`, shared `assets/`. Static files only, **no build step**, served by GitHub Pages. |
| 3 | Visual system | "Light-table workbench" (see below). Plain CSS custom properties in `assets/css/theme.css`. No Tailwind. |
| 4 | v1 scope | **Port only**, plus real empty, loading, error, success and disabled states. No new tools. |
| 5 | Name | Filmbench. Check the name and GitHub repo are free before publishing. |
| 6 | GIF size | Output size control: **1080** (default) · 1600 · Original, measured on the long edge. Frames are aligned at full resolution, then downscaled. A progress bar shows while encoding. |
| 7 | Dependencies | Vendored in `vendor/` with their MIT licenses: face-api.js 0.22.2, its two tiny models, gif.js 0.2.0. Credits in the footer. |
| 8 | Mobile | Pointer Events everywhere and `touch-action: none` on interactive surfaces. The rail sits below the stage on narrow screens. A **magnifier loupe** helps with manual pinning. |
| 9 | TIFF / HEIC | Try to decode first, since Safari can. If decoding fails, read the file's first bytes and show a specific error that says what to do. Real TIFF decoding is on the roadmap. |
| 10 | Old URLs | The old repos get redirect stubs (meta refresh, canonical link, visible link) and are then archived. Stub files are in `stubs/`. |
| 11 | Verification | Dev-only Playwright suite in `tests/`. Tests 1–3 run against both the legacy apps (`tests/legacy/`) and the port, so the port must match today's behavior. |

## Visual system: light-table workbench

- **Neutral near-black** background with no hue, so scan colors look true. The image is always the largest thing on screen.
- **One accent, safelight amber**, used only for the primary action, the active selection, the crop frame and pins.
  Red is for errors only.
- **Edge-print readouts.** Technical values (ratios, pixel sizes, frame numbers, file names, sizes) use monospace,
  tabular figures and small caps. This is the only film reference in the styling.
- **Shell:** top bar (wordmark + tool switcher) / left rail of numbered steps / stage / bottom status bar.
- **Not allowed:** film-strip borders, sprocket holes, grain overlays on the interface, brand yellows, typewriter fonts,
  gradient heroes, pill buttons, centered landing-page headers above tools.

## States

### Crop
| State | What the user sees |
|---|---|
| Empty | The stage asks for a scan and lists accepted formats. Download is disabled with a reason ("Open a scan first"). |
| Loading | "Opening Scan_23.jpg…" while decoding. |
| Error: unsupported | TIFF/HEIC/unknown format gets a specific message with a fix. The previous image (if any) stays loaded. |
| Ready | Frame shown, the active ratio highlighted, readouts for original and crop size. The frame can be dragged or nudged with arrow keys. |
| Exporting | Download button busy. |
| Error: export | "Export failed — this scan may be too large for this browser's canvas…" shown inline. |
| Success | "Saved Scan_23_2.35x1.jpg · 4.1 MB" in the rail. |

### Wiggle
| State | What the user sees |
|---|---|
| Empty | Frame picker: "2–8 frames from one burst, e.g. a Nimslo or Nishika scan set". |
| Error: frame count | Fewer than 2 frames. |
| Error: unsupported | Names the file that failed and why. |
| Frames loaded | Strip of frames with numbers and file names. Reference frame marked. |
| Align · Auto: loading models | "Loading face detection…" |
| Align · Auto: models failed | "Couldn't load face detection. Manual pins still work." Switches to manual. |
| Align · Auto: detecting | "Looking for faces in frame 2…" |
| Align · Auto: no faces | Explains that grain confuses detection and offers Manual pins. |
| Align · Auto: pick face | Boxes drawn, "Tap the face to keep still". |
| Align · Manual | "Pin the same point on every frame", FRAME n/N, loupe, Undo pin. |
| Aligned | Output step enabled. |
| Rendering | Progress bar with percent. |
| Done | GIF in the stage, Download (with size), Start over (resets in place, no reload). |
| Error: render | Inline message, settings kept so the user can retry at a smaller size. |

## Layout

```
filmbench/
  index.html               landing
  crop/index.html          crop tool
  crop/crop.js
  wiggle/index.html        wiggle tool
  wiggle/wiggle.js
  assets/css/theme.css     tokens + shell + components
  assets/js/image-input.js decode + format sniffing + error messages
  assets/js/loupe.js       magnifier for precise pinning
  vendor/                  face-api.js, models, gif.js (+ licenses)
  stubs/                   redirect pages for the old repos
  tests/                   Playwright (dev only)
  docs/design.md
```

## Roadmap after v1

1. **Bridge:** a ratio crop step inside Wiggle that reuses the crop-frame logic.
2. TIFF decoding (UTIF.js) and 16-bit handling.
3. Replace face-api.js with a maintained library (e.g. `@vladmandic/face-api` or MediaPipe).
4. Negative inversion (needs its own design session).
