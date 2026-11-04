# Vendored dependencies

Self-hosted so Filmbench depends on nothing outside this repo at runtime. Each library's
license file sits next to its code, as the MIT license requires.

| Library | Version | Source | License |
|---|---|---|---|
| face-api.js (`face-api/face-api.min.js`) | 0.22.2 | npm `face-api.js@0.22.2`, `dist/` | MIT — `face-api/LICENSE` |
| face-api.js models (`face-api/models/`) | repo `master` | github.com/justadudewhohacks/face-api.js `weights/` — `tiny_face_detector`, `face_landmark_68_tiny` | MIT (same repo) |
| gif.js (`gif.js/gif.js`, `gif.js/gif.worker.js`) | 0.2.0 | npm `gif.js@0.2.0`, `dist/` (sourcemap comments removed) | MIT — `gif.js/LICENSE` |

face-api.js hasn't been updated since 2020. Replacing it is on the roadmap in `docs/design.md`.
