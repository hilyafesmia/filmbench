// Tests 1–2: the crop tool exports exact pixel sizes and keeps the source format.
// Runs against the legacy app and the port so the port must match.
const { test, expect } = require('@playwright/test');
const fs = require('fs');
const { makeImage, imageSize } = require('./helpers');

const impls = {
  legacy: {
    url: '/tests/legacy/crop.html',
    input: '#file-input',
    async pick(page, label) {
      if (label === 'custom') {
        await page.getByRole('button', { name: /Custom/ }).click();
        await page.fill('#custom-w', '1');
        await page.fill('#custom-h', '1');
        await page.getByRole('button', { name: 'Apply' }).click();
      } else {
        await page.getByRole('button', { name: new RegExp(label.replace('.', '\\.')) }).click();
      }
    },
    download: '#download-btn',
    tolerance: 1, // legacy maths in display pixels, rounds by up to 1px
  },
  port: {
    url: '/crop/',
    input: '#scan-input',
    async pick(page, label) {
      if (label === 'custom') {
        await page.getByRole('radio', { name: /Custom/ }).check();
        await page.fill('#custom-w', '1');
        await page.fill('#custom-h', '1');
        await page.getByRole('button', { name: 'Apply ratio' }).click();
      } else {
        await page.getByRole('radio', { name: new RegExp(label.replace('.', '\\.')) }).check();
      }
    },
    download: '#download-btn',
    tolerance: 0, // port works in source pixels
  },
};

const SRC = { width: 3000, height: 2000 };
const cases = [
  { label: '1.85', w: 3000, h: 3000 / 1.85 },
  { label: '2.35', w: 3000, h: 3000 / 2.35 },
  { label: '2.6', w: 3000, h: 3000 / 2.6 },
  { label: '2.77', w: 3000, h: 3000 / 2.77 },
  { label: 'custom', w: 2000, h: 2000 },
];

for (const [name, impl] of Object.entries(impls)) {
  test.describe(`crop (${name})`, () => {
    for (const c of cases) {
      test(`exports exact pixels for ${c.label}`, async ({ page }) => {
        await page.goto(impl.url);
        const buf = await makeImage(page, { ...SRC, type: 'image/jpeg' });
        await page.setInputFiles(impl.input, { name: 'Scan_23.jpg', mimeType: 'image/jpeg', buffer: buf });
        await expect(page.locator(impl.download)).toBeEnabled();
        await impl.pick(page, c.label);
        const [dl] = await Promise.all([page.waitForEvent('download'), page.click(impl.download)]);
        const out = imageSize(fs.readFileSync(await dl.path()));
        expect(Math.abs(out.width - Math.round(c.w))).toBeLessThanOrEqual(impl.tolerance);
        expect(Math.abs(out.height - Math.round(c.h))).toBeLessThanOrEqual(impl.tolerance);
      });
    }

    for (const fmt of [
      { mime: 'image/jpeg', name: 'Scan_23.jpg', type: 'jpeg', ext: /\.jpe?g$/ },
      { mime: 'image/png', name: 'Scan_23.png', type: 'png', ext: /\.png$/ },
    ]) {
      test(`keeps ${fmt.type} as ${fmt.type}`, async ({ page }) => {
        await page.goto(impl.url);
        const buf = await makeImage(page, { ...SRC, type: fmt.mime });
        await page.setInputFiles(impl.input, { name: fmt.name, mimeType: fmt.mime, buffer: buf });
        await expect(page.locator(impl.download)).toBeEnabled();
        const [dl] = await Promise.all([page.waitForEvent('download'), page.click(impl.download)]);
        expect(dl.suggestedFilename()).toMatch(fmt.ext);
        expect(imageSize(fs.readFileSync(await dl.path())).type).toBe(fmt.type);
      });
    }
  });
}
