/**
 * The agent journey, end to end:
 * a buyer applies, an admin approves, the new agent publishes a listing (address search, photo upload),
 * buyers find it and send an inquiry, the agent edits it, and finally an admin revokes the agent.
 */
import { apiTest as test, backend, codeFor, expect, newPerson, signIn } from '../support';
import type { Page } from '@playwright/test';

// A real 1x1 PNG, so the upload passes the type and size checks the presign sets.
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkqKv/DwAEhAH/RRiMHgAAAABJRU5ErkJggg==', 'base64');

let adminSecret = '';
test.beforeEach(async () => {
  await backend.user('ana@rofo.test', 'Ana Rivera');
  adminSecret = (await backend.user('admin@rofo.test', 'Ops Admin', ['Client', 'Admin'], true)).totpSecret!;
});

/** Ana fills in and sends the agent application. */
async function apply(page: Page) {
  await signIn(page, 'ana@rofo.test');
  await page.getByRole('link', { name: 'List a property' }).click();
  await expect(page.getByRole('heading', { name: 'Become an agent' })).toBeVisible();
  await expect(page.getByLabel('Full name')).toHaveValue('Ana Rivera');
  await page.getByLabel('Phone').fill('+597 555 0100');
  await page.getByLabel('Agency or business name').fill('Sun Realty');
  await page.getByLabel('Registration or licence number').fill('KKF-12345');
  await page.getByLabel('Country').fill('Suriname');
  await page.getByLabel('Tell us about your work').fill('Homes in Paramaribo and Wanica for twelve years.');
  await page.getByRole('button', { name: 'Submit application' }).click();
  await expect(page.getByRole('heading', { name: 'Application received' })).toBeVisible();
}

/** The admin approves Ana's application. */
async function approve(admin: Page) {
  await signIn(admin, 'admin@rofo.test', { secret: adminSecret });
  await admin.getByRole('link', { name: 'Applications' }).click();
  const card = admin.getByRole('article').filter({ hasText: 'Ana Rivera · Sun Realty' });
  await expect(card).toContainText('ana@rofo.test');
  await card.getByRole('button', { name: 'Approve' }).click();
  await expect(card).toHaveCount(0);
}

/** Ana picks up her new agent access. */
async function activate(page: Page) {
  await page.goto('/agent/apply');
  await expect(page.getByRole('heading', { name: 'You are approved' })).toBeVisible();
  await page.getByRole('button', { name: 'Activate agent access' }).click();
  await expect(page.getByRole('heading', { name: 'Your listings' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Dashboard' })).toBeVisible();
}

/** Ana publishes a listing with an address search and a photo. Returns its public URL path. */
async function publish(page: Page): Promise<string> {
  await page.getByRole('link', { name: 'New listing' }).click();
  await page.getByLabel('Headline').fill('Garden family home near the Palmentuin');
  await page.getByLabel(/^Description/).fill('Three bedrooms, a covered veranda and a big garden with fruit trees.');
  await page.getByLabel(/^Features/).fill('Garden, Veranda, Solar panels');
  await page.getByLabel('Address', { exact: true }).fill('Kerkplein 1');
  await page.getByRole('button', { name: 'Find on map' }).click();
  await page.getByRole('list', { name: 'Address matches' }).getByRole('button').click();
  await expect(page.getByLabel('City')).toHaveValue('Paramaribo');
  await expect(page.getByLabel('Country')).toHaveValue('Suriname');
  await expect(page.getByLabel('Latitude')).toHaveValue('5.8262');
  await page.getByLabel(/^Price/).fill('285000');
  await page.getByLabel(/^Bedrooms/).fill('3');
  await page.getByLabel(/^Bathrooms/).fill('2');
  await page.getByLabel(/^Living area/).fill('160');
  await page.getByLabel('Agency').fill('Sun Realty');
  await page.getByLabel('Phone').fill('+597 555 0100');

  await page.getByTestId('photo-input').setInputFiles({ name: 'front.png', mimeType: 'image/png', buffer: PNG });
  await expect(page.getByRole('figure')).toHaveCount(1);
  await expect(page.getByRole('figure')).toContainText('Cover');

  await page.getByRole('button', { name: 'Publish listing' }).click();
  await expect(page.getByRole('heading', { name: 'Your listings' })).toBeVisible();
  const row = page.getByRole('row', { name: /Kerkplein 1/ });
  await expect(row).toContainText('$285,000');
  await expect(row).toContainText('Pinned');
  await expect(row.getByRole('cell').nth(3)).toHaveText('1'); // one photo
  return (await row.getByRole('link', { name: 'Kerkplein 1' }).getAttribute('href'))!;
}

test('apply, get approved, publish with a photo, and buyers find it', async ({ page, context }) => {
  await apply(page);
  const admin = await newPerson(context);
  await approve(admin);
  await activate(page);
  const propertyPath = await publish(page);

  // A guest searches and finds it, with the uploaded photo served from the CDN.
  const guest = await newPerson(context);
  const photo = guest.waitForResponse((r) => r.url().includes('/cdn/listings/') && r.status() === 200);
  await guest.goto('/search?q=Paramaribo');
  await expect(guest.getByRole('heading', { level: 1 })).toHaveText('1 property');
  await guest.getByText('Kerkplein 1').first().click();
  await expect(guest).toHaveURL(new RegExp(`${propertyPath}$`));
  await expect(guest.getByRole('heading', { level: 1 })).toHaveText('Kerkplein 1');
  await expect(guest.getByText('Ana Rivera', { exact: true })).toBeVisible(); // the agent's real name, from the ID token
  await photo;
  // The real map renders, with a pin for the listing.
  await expect(guest.locator('.map-gl canvas')).toBeVisible();
  await expect(guest.locator('.gl-pin')).toHaveCount(1);
});

test('a buyer sends an inquiry and the agent reads it; the agent edits the price', async ({ page, context }) => {
  await apply(page);
  const admin = await newPerson(context);
  await approve(admin);
  await activate(page);
  const propertyPath = await publish(page);

  await backend.user('ben@rofo.test', 'Ben Koster');
  const ben = await newPerson(context);
  await ben.goto(propertyPath);
  await ben.getByRole('link', { name: 'Sign in to contact the agent' }).click();
  await ben.getByLabel('Email').fill('ben@rofo.test');
  await ben.getByLabel(/^Password/).fill('Str0ngPassw0rd');
  await ben.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(ben).toHaveURL(new RegExp(`${propertyPath}$`)); // back where he was
  await ben.getByRole('textbox', { name: 'Message' }).fill('Can I visit on Saturday morning?');
  await ben.getByRole('button', { name: 'Send message' }).click();
  await expect(ben.getByText('Thanks. Ana Rivera will reply soon.')).toBeVisible();
  await ben.getByRole('button', { name: '♡ Save' }).click();
  await expect(ben.getByRole('button', { name: '♥ Saved' })).toBeVisible();
  await ben.reload();
  await expect(ben.getByRole('button', { name: '♥ Saved' })).toBeVisible(); // stored on the server

  await page.getByRole('row', { name: /Kerkplein 1/ }).getByRole('link', { name: 'Inquiries' }).click();
  await expect(page.getByText('Can I visit on Saturday morning?')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Reply to ben@rofo.test' })).toBeVisible();

  await page.getByRole('link', { name: '← Your listings' }).click();
  await page.getByRole('row', { name: /Kerkplein 1/ }).getByRole('link', { name: 'Edit' }).click();
  await expect(page.getByLabel('Headline')).toHaveValue('Garden family home near the Palmentuin');
  await page.getByLabel(/^Price/).fill('269000');
  await page.getByRole('button', { name: 'Save changes' }).click();
  await expect(page.getByRole('row', { name: /Kerkplein 1/ })).toContainText('$269,000');
  await ben.reload();
  await expect(ben.getByText('$269,000')).toBeVisible();
});

test('an admin revokes an agent: listings disappear and the agent is locked out at once', async ({ page, context }) => {
  await apply(page);
  const admin = await newPerson(context);
  await approve(admin);
  await activate(page);
  await publish(page);

  await admin.getByRole('tab', { name: 'Approved' }).click();
  const card = admin.getByRole('article').filter({ hasText: 'Ana Rivera · Sun Realty' });
  await card.getByRole('button', { name: 'Revoke access' }).click();
  await card.getByRole('textbox', { name: 'Reason for revoking access' }).fill('Licence expired');
  await card.getByRole('button', { name: 'Revoke access' }).click();
  await expect(admin.getByRole('status')).toHaveText('Access revoked for Ana Rivera. 1 listing hidden.');

  const guest = await newPerson(context);
  await guest.goto('/search?q=Paramaribo');
  await expect(guest.getByRole('heading', { level: 1 })).toHaveText('0 properties');

  // Ana's open dashboard: the server refuses her old token, her refresh token was revoked, so she is signed out.
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Sign in to list a property' })).toBeVisible();
  // Signing in again gives a token without the Agent group.
  await signIn(page, 'ana@rofo.test', { next: '/agent' });
  await expect(page.getByRole('heading', { name: 'Agent access needed' })).toBeVisible();
  await page.goto('/agent/apply');
  await expect(page.getByText('Your agent access was removed.')).toBeVisible();
  await expect(page.getByText('Licence expired')).toBeVisible();
});

test('an admin without two step verification must turn it on before using admin tools', async ({ page }) => {
  await backend.user('lax@rofo.test', 'Lax Admin', ['Client', 'Admin']);
  await signIn(page, 'lax@rofo.test');
  await page.goto('/admin/applications');
  await expect(page.getByRole('heading', { name: 'Turn on two step verification' })).toBeVisible();

  await page.getByRole('link', { name: 'lax@rofo.test' }).click();
  await expect(page.getByText('Admin tools are locked.')).toBeVisible();
  await page.getByRole('button', { name: 'Turn on two step verification' }).click();
  const secret = (await page.locator('.mfa-secret').innerText()).replace(/\s/g, '');
  await page.getByLabel('Code from the app').fill(codeFor(secret));
  await page.getByRole('button', { name: 'Turn on' }).click();
  await expect(page.getByText('Required for admins')).toBeVisible();

  await page.getByRole('link', { name: 'Applications' }).click();
  await expect(page.getByRole('heading', { name: 'Agent applications' })).toBeVisible();
  await expect(page.getByText('Nothing here.')).toBeVisible();
});

test('a buyer cannot reach agent or admin pages', async ({ page }) => {
  await signIn(page, 'ana@rofo.test');
  await page.goto('/agent/new');
  await expect(page.getByRole('heading', { name: 'Agent access needed' })).toBeVisible();
  await page.goto('/admin/applications');
  await expect(page.getByRole('heading', { name: 'Admins only' })).toBeVisible();
});
