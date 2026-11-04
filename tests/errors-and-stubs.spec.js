// Tests 4–5 (port only): specific errors for formats Chrome can't open, and
// redirect stubs for the old repos.
const { test, expect } = require('@playwright/test');
const { makeImage } = require('./helpers');

const tiff = Buffer.concat([Buffer.from([0x49, 0x49, 0x2a, 0x00, 8, 0, 0, 0]), Buffer.alloc(256)]);
const heic = Buffer.concat([Buffer.from([0, 0, 0, 0x18]), Buffer.from('ftypheic'), Buffer.alloc(256)]);

test('crop: TIFF gets a specific, actionable error', async ({ page }) => {
  await page.goto('/crop/');
  await page.setInputFiles('#scan-input', { name: 'Roll12_04.tif', mimeType: 'image/tiff', buffer: tiff });
  const alert = page.getByRole('alert');
  await expect(alert).toContainText('Roll12_04.tif');
  await expect(alert).toContainText(/TIFF/);
  await expect(alert).toContainText(/JPEG|PNG/);
  await expect(page.locator('#download-btn')).toBeDisabled();
});

test('crop: HEIC gets a specific error', async ({ page }) => {
  await page.goto('/crop/');
  await page.setInputFiles('#scan-input', { name: 'IMG_0001.HEIC', mimeType: 'image/heic', buffer: heic });
  await expect(page.getByRole('alert')).toContainText(/HEIC/);
});

test('crop: a bad file keeps the previous scan loaded', async ({ page }) => {
  await page.goto('/crop/');
  const ok = await makeImage(page, { width: 1200, height: 800 });
  await page.setInputFiles('#scan-input', { name: 'good.jpg', mimeType: 'image/jpeg', buffer: ok });
  await expect(page.locator('#download-btn')).toBeEnabled();
  await page.setInputFiles('#scan-input', { name: 'bad.tif', mimeType: 'image/tiff', buffer: tiff });
  await expect(page.getByRole('alert')).toContainText('bad.tif');
  await expect(page.locator('#download-btn')).toBeEnabled();
});

test('wiggle: names the frame that can\'t be opened', async ({ page }) => {
  await page.goto('/wiggle/');
  const ok = await makeImage(page, { width: 600, height: 400 });
  await page.setInputFiles('#frames-input', [
    { name: 'a.jpg', mimeType: 'image/jpeg', buffer: ok },
    { name: 'b.tif', mimeType: 'image/tiff', buffer: tiff },
  ]);
  await expect(page.getByRole('alert')).toContainText('b.tif');
  await expect(page.getByRole('alert')).toContainText(/TIFF/);
});

test('wiggle: one frame is not enough', async ({ page }) => {
  await page.goto('/wiggle/');
  const ok = await makeImage(page, { width: 600, height: 400 });
  await page.setInputFiles('#frames-input', [{ name: 'a.jpg', mimeType: 'image/jpeg', buffer: ok }]);
  await expect(page.getByRole('alert')).toContainText(/at least 2/i);
});

for (const [stub, target] of [
  ['crop', 'https://hilyafesmia.github.io/filmbench/crop/'],
  ['wiggle', 'https://hilyafesmia.github.io/filmbench/wiggle/'],
]) {
  test(`stub: old ${stub} URL redirects to Filmbench`, async ({ page }) => {
    await page.route('https://hilyafesmia.github.io/filmbench/**', (r) =>
      r.fulfill({ contentType: 'text/html', body: '<p>filmbench</p>' })
    );
    await page.goto(`/stubs/${stub}/index.html`);
    await page.waitForURL(target);
    expect(page.url()).toBe(target);
  });
}
