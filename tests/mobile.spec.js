// Test 6 (port, mobile viewport): dragging the crop frame with a finger moves
// the frame without scrolling the page, and manual pinning shows the loupe.
const { test, expect } = require('@playwright/test');
const { makeImage } = require('./helpers');

async function touchDrag(page, from, to, steps = 8) {
  const cdp = await page.context().newCDPSession(page);
  const pt = (p) => [{ x: p.x, y: p.y, id: 1 }];
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: pt(from) });
  for (let i = 1; i <= steps; i++) {
    const p = { x: from.x + ((to.x - from.x) * i) / steps, y: from.y + ((to.y - from.y) * i) / steps };
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: pt(p) });
  }
  return {
    end: () => cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }),
  };
}

test('crop: finger drag moves the frame, not the page', async ({ page }) => {
  await page.goto('/crop/');
  // Portrait scan: a 1.85 frame spans the width and can only move vertically —
  // exactly the gesture that fights with page scrolling.
  const buf = await makeImage(page, { width: 2000, height: 3000 });
  await page.setInputFiles('#scan-input', { name: 'portrait.jpg', mimeType: 'image/jpeg', buffer: buf });
  const frame = page.locator('#crop-frame');
  await expect(frame).toBeVisible();
  await frame.scrollIntoViewIfNeeded();
  const before = await frame.boundingBox();
  const scrollBefore = await page.evaluate(() => window.scrollY);
  const c = { x: before.x + before.width / 2, y: before.y + before.height / 2 };
  const d = await touchDrag(page, c, { x: c.x, y: c.y + 60 });
  await d.end();
  const after = await frame.boundingBox();
  expect(await page.evaluate(() => window.scrollY)).toBe(scrollBefore);
  expect(after.y - before.y).toBeGreaterThan(30);
});

test('wiggle: holding a finger on the frame shows the loupe; lifting places the pin', async ({ page }) => {
  await page.goto('/wiggle/');
  const files = [];
  for (let i = 0; i < 2; i++) {
    files.push({ name: `f${i}.jpg`, mimeType: 'image/jpeg', buffer: await makeImage(page, { width: 1200, height: 800 }) });
  }
  await page.setInputFiles('#frames-input', files);
  await page.getByRole('radio', { name: 'Manual pins' }).check();
  await expect(page.locator('#pin-counter')).toHaveText('FRAME 1/2');
  const canvas = page.locator('#stage-canvas');
  await canvas.scrollIntoViewIfNeeded();
  const box = await canvas.boundingBox();
  const p = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  const d = await touchDrag(page, p, { x: p.x + 5, y: p.y + 5 }, 2);
  await expect(page.locator('#loupe')).toBeVisible();
  await d.end();
  await expect(page.locator('#loupe')).toBeHidden();
  await expect(page.locator('#pin-counter')).toHaveText('FRAME 2/2');
});
