// Test 3: manual pins on 4 frames produce a 6-frame boomerang GIF with the
// subject held still. The legacy app outputs full size; the port defaults to 1080.
const { test, expect } = require('@playwright/test');
const { makeImage, analyseGif, clickSourcePoint } = require('./helpers');

const W = 1200, H = 800;
// Subject dot drifts between frames, like parallax across a Nimslo's lenses.
const dots = [0, 1, 2, 3].map((i) => ({ x: 560 + i * 30, y: 400 - i * 6 }));

async function frames(page) {
  const out = [];
  for (let i = 0; i < 4; i++) {
    out.push({
      name: `Scan_${23 + i}.jpg`,
      mimeType: 'image/jpeg',
      buffer: await makeImage(page, { width: W, height: H, dot: dots[i] }),
    });
  }
  return out;
}

async function readBlobUrl(page, selector, attr) {
  const url = await page.locator(selector).getAttribute(attr);
  return Buffer.from(
    await page.evaluate(async (u) => Array.from(new Uint8Array(await (await fetch(u)).arrayBuffer())), url)
  );
}

test('wiggle (legacy): manual pins → 6-frame aligned GIF at full size', async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto('/tests/legacy/wiggle.html');
  await expect(page.locator('#status-msg')).toHaveText(/Models loaded/, { timeout: 60_000 });
  await page.setInputFiles('#file-input', await frames(page));
  await expect(page.locator('#status-msg')).toHaveText(/No faces found/, { timeout: 30_000 });
  await page.click('#btn-manual');
  for (let i = 0; i < 4; i++) {
    await expect(page.locator('#status-msg')).toHaveText(new RegExp(`Image ${i + 1} of 4`));
    await clickSourcePoint(page, '#main-canvas', W, H, dots[i].x, dots[i].y);
  }
  await expect(page.locator('#download-link')).toHaveAttribute('href', /^blob:/, { timeout: 60_000 });
  const gif = await analyseGif(page, await readBlobUrl(page, '#download-link', 'href'));
  expect(gif.count).toBe(6);
  expect([gif.width, gif.height]).toEqual([W, H]);
  assertStill(gif.frames, 4);
});

test('wiggle (port): manual pins → 6-frame aligned GIF at 1080', async ({ page }) => {
  await page.goto('/wiggle/');
  await page.setInputFiles('#frames-input', await frames(page));
  await page.getByRole('radio', { name: 'Manual pins' }).check();
  for (let i = 0; i < 4; i++) {
    await expect(page.locator('#pin-counter')).toHaveText(`FRAME ${i + 1}/4`);
    await clickSourcePoint(page, '#stage-canvas', W, H, dots[i].x, dots[i].y);
  }
  await expect(page.getByRole('button', { name: 'Render GIF' })).toBeEnabled();
  await page.getByRole('button', { name: 'Render GIF' }).click();
  await expect(page.locator('#download-gif')).toHaveAttribute('href', /^blob:/, { timeout: 60_000 });
  const gif = await analyseGif(page, await readBlobUrl(page, '#download-gif', 'href'));
  expect(gif.count).toBe(6);
  expect([gif.width, gif.height]).toEqual([1080, 720]);
  assertStill(gif.frames, 4 * (1080 / W));
});

test('wiggle (port): output size Original keeps full resolution', async ({ page }) => {
  await page.goto('/wiggle/');
  await page.setInputFiles('#frames-input', await frames(page));
  await page.getByRole('radio', { name: 'Manual pins' }).check();
  for (let i = 0; i < 4; i++) {
    await expect(page.locator('#pin-counter')).toHaveText(`FRAME ${i + 1}/4`);
    await clickSourcePoint(page, '#stage-canvas', W, H, dots[i].x, dots[i].y);
  }
  await page.getByRole('radio', { name: /Original/ }).check();
  await page.getByRole('button', { name: 'Render GIF' }).click();
  await expect(page.locator('#download-gif')).toHaveAttribute('href', /^blob:/, { timeout: 60_000 });
  const gif = await analyseGif(page, await readBlobUrl(page, '#download-gif', 'href'));
  expect([gif.width, gif.height]).toEqual([W, H]);
});

function assertStill(frames, tol) {
  expect(frames.every(Boolean)).toBe(true);
  const [first, ...rest] = frames;
  for (const f of rest) {
    expect(Math.abs(f.x - first.x)).toBeLessThanOrEqual(tol);
    expect(Math.abs(f.y - first.y)).toBeLessThanOrEqual(tol);
  }
}
