/**
 * The demo build (no backend), end to end: search, filters in the URL, the real WebGL map,
 * property pages, and the pages that need an account.
 */
import { expect, test } from '../support';

test('search from the home page, filter, sort, and open a property', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Find, rent and buy property across the Caribbean');
  await page.getByRole('textbox', { name: 'Location' }).fill('Paramaribo');
  await page.getByRole('button', { name: 'Search' }).click();
  await expect(page).toHaveURL(/\/search\?.*q=Paramaribo/);
  const heading = page.getByRole('heading', { level: 1 });
  await expect(heading).toHaveText(/\d+ propert/);

  // Filters live in the URL, so a copied link shows the same results.
  await page.goto('/search?deal=rent');
  await expect(page.getByRole('combobox', { name: 'Buy or rent' })).toHaveValue('rent');
  const rentCount = Number((await heading.innerText()).split(' ')[0]);
  await page.getByRole('combobox', { name: 'Buy or rent' }).selectOption('buy');
  await expect(page).toHaveURL(/deal=buy/);
  await page.getByRole('combobox', { name: 'Sort' }).selectOption('price-asc');
  await expect(page).toHaveURL(/sort=price-asc/);
  const nums = (await page.locator('.results-list .card-price').allInnerTexts()).map((p) => Number(p.replace(/[^\d]/g, '')));
  expect(nums.length).toBeGreaterThan(2);
  expect(nums).toEqual([...nums].sort((a, b) => a - b));
  expect(rentCount).toBeGreaterThan(0);

  await page.getByRole('textbox', { name: 'Location' }).fill('Atlantis');
  await expect(page.getByText('No results. Try removing a filter.')).toBeVisible();
  await page.getByRole('button', { name: 'Clear' }).click();
  await expect(page).toHaveURL(/\/search$/);
});

test('the real map draws a pin per result; clicking a pin opens the property', async ({ page }) => {
  await page.goto('/search?deal=buy');
  const count = Number((await page.getByRole('heading', { level: 1 }).innerText()).split(' ')[0]);
  await expect(page.locator('.map-gl canvas')).toBeVisible();
  await expect(page.locator('.gl-pin')).toHaveCount(count);
  const pin = page.locator('.gl-pin').first();
  const label = await pin.getAttribute('aria-label');
  await pin.click();
  await expect(page).toHaveURL(/\/property\//);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(label!.split(',')[0]);
});

test('hovering a result card highlights its pin', async ({ page }) => {
  await page.goto('/search?q=Nassau');
  await page.locator('.results-list a, .results-list article').first().hover();
  await expect(page.locator('.gl-pin.active')).toHaveCount(1);
});

test('property page: facts, contact form, save, and a pool calculator for homes for sale', async ({ page }) => {
  await page.goto('/property/l1');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Seven Mile Beach Rd 12');
  await expect(page.getByText('$1,850,000').first()).toBeVisible();
  await page.getByRole('button', { name: '♡ Save' }).click();
  await expect(page.getByRole('button', { name: '♥ Saved' })).toBeVisible();
  await page.getByRole('textbox', { name: 'Your name' }).fill('Ana');
  await page.getByRole('textbox', { name: 'Email' }).fill('ana@example.com');
  await page.getByRole('button', { name: 'Send message' }).click();
  await expect(page.getByText(/will reply soon/)).toBeVisible();
  await expect(page.getByRole('link', { name: 'Start a pool' })).toHaveAttribute('href', /\/pools\/new\?listing=l1/);
});

test('account pages explain that the demo build has no accounts; unknown pages say so', async ({ page }) => {
  for (const path of ['/login', '/account', '/agent/apply']) {
    await page.goto(path);
    await expect(page.getByText(/backend is connected/)).toBeVisible();
  }
  await page.goto('/agent');
  await expect(page.getByText(/demo build/)).toBeVisible();
  await page.goto('/no/such/page');
  await expect(page.getByRole('heading', { name: 'Page not found' })).toBeVisible();
});

test('works on a phone-sized screen', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/search');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  // No sideways scrolling.
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);
});
