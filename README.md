# Filmbench

Browser tools for film photographers: **https://hilyafesmia.github.io/filmbench/**

- **Crop:** frame a scan to 1.85, 2.35, 2.6, 2.77 or a custom ratio and export at full resolution in the original format.
- **Wiggle:** align frames from a Nimslo, Nishika, Reto 3D or other multi-lens camera into a steady wigglegram GIF, using face detection or manual pins (with a loupe for grainy scans).

Everything runs in your browser. Photos are never uploaded.

## Development

The site is static files with no build step. GitHub Pages serves the repo root.

```bash
python3 -m http.server 4173   # then open http://localhost:4173
```

Tests (dev only) use Playwright:

```bash
npm install && npx playwright install chromium
npm test
```

`tests/legacy/` holds the original single-file apps. Tests 1–3 run against them too, so the port has to match their behavior.

See `docs/design.md` for decisions and the roadmap, and `vendor/README.md` for third-party code and licenses.
