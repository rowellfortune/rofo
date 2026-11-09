/**
 * Shared setup for the E2E specs.
 * - Keeps the browser off the internet: Google Fonts and anything else external is blocked,
 *   and Cognito requests are answered by the fake in e2e/fake/server.ts.
 * - `backend` drives the fake: reset, create users, read emailed codes, seed listings.
 * - `signIn` / `signUp` go through the real sign in screens (real SRP against the fake pool).
 */
import { expect, test as base, type BrowserContext, type Page } from '@playwright/test';
import { totp } from './fake/totp';

export const BACKEND = 'http://127.0.0.1:4600';
export const PASSWORD = 'Str0ngPassw0rd';

const COGNITO = /^https:\/\/cognito-(idp|identity)\.us-east-1\.amazonaws\.com\//;
const LOCAL = /^(http:\/\/127\.0\.0\.1|data:|blob:)/;

/** Route a browser context: Cognito to the fake, local hosts through, everything else blocked. */
export async function hermetic(context: BrowserContext) {
  await context.route(COGNITO, async (route) => {
    try {
      const response = await route.fetch({ url: `${BACKEND}/cognito` });
      await route.fulfill({ response });
    } catch {
      // The page navigated away mid request (a reload right after sign out). Nothing is waiting for it.
      await route.abort().catch(() => {});
    }
  });
  await context.route((url) => !LOCAL.test(url.href) && !COGNITO.test(url.href), (route) => route.abort());
}

/** Calls to the fake backend's test controls. */
export const backend = {
  async post<T = unknown>(path: string, body: unknown = {}): Promise<T> {
    const r = await fetch(`${BACKEND}${path}`, { method: 'POST', body: JSON.stringify(body) });
    if (!r.ok) throw new Error(`${path}: ${r.status} ${await r.text()}`);
    return r.json() as Promise<T>;
  },
  reset: () => backend.post('/__test/reset'),
  /** A confirmed account. `totp: true` gives it an authenticator app (needed for admins). */
  user: (email: string, name: string, groups: string[] = ['Client'], totp = false) =>
    backend.post<{ sub: string; totpSecret?: string }>('/__test/users', { email, name, groups, totp, password: PASSWORD }),
  async code(email: string, kind: 'signup' | 'reset'): Promise<string> {
    const r = await fetch(`${BACKEND}/__test/outbox?email=${encodeURIComponent(email)}&kind=${kind}`);
    if (!r.ok) throw new Error(`No ${kind} code for ${email}`);
    return ((await r.json()) as { code: string }).code;
  },
  async account(email: string) {
    const r = await fetch(`${BACKEND}/__test/user?email=${encodeURIComponent(email)}`);
    return r.ok ? (await r.json()) as { sub: string; groups: string[]; totpEnabled: boolean; totpSecret?: string } : null;
  },
  listings: (agentEmail: string, items: Record<string, unknown>[]) => backend.post<{ ids: string[] }>('/__test/listings', { agentEmail, items }),
};

/** A valid listing for seeding. Override what the test needs. */
export const listing = (over: Record<string, unknown> = {}) => ({
  deal: 'buy', type: 'House', title: 'Garden family home', address: 'Kerkplein 1', city: 'Paramaribo', country: 'Suriname',
  price: 250000, beds: 3, baths: 2, areaM2: 140, description: 'Three bedrooms and a big garden with fruit trees.',
  features: ['Garden', 'Carport'], images: [], lat: 5.8262, lng: -55.1563, agency: 'Sun Realty', phone: '+597 555 0100', ...over,
});

/** The current code for an authenticator secret. */
export const codeFor = (secret: string) => totp(secret);

/** Sign in through the login page. Pass `secret` for accounts with two step verification. */
export async function signIn(page: Page, email: string, opts: { secret?: string; next?: string } = {}) {
  await page.goto(`/login${opts.next ? `?next=${encodeURIComponent(opts.next)}` : ''}`);
  await page.getByLabel('Email').fill(email);
  await page.getByLabel(/^Password/).fill(PASSWORD);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  if (opts.secret) {
    await page.getByLabel('Authenticator code').fill(codeFor(opts.secret));
    await page.getByRole('button', { name: 'Verify' }).click();
  }
  await expect(page.getByRole('link', { name: email })).toBeVisible();
}

/** A fresh page in its own browser context (a second person), already routed. */
export async function newPerson(context: BrowserContext): Promise<Page> {
  const ctx = await context.browser()!.newContext({ baseURL: 'http://127.0.0.1:4174' });
  await hermetic(ctx);
  return ctx.newPage();
}

/** Test with the routing applied and the backend reset before each test. */
export const test = base.extend<{ hermeticContext: void }>({
  hermeticContext: [async ({ context }, use) => { await hermetic(context); await use(); }, { auto: true }],
});
export const apiTest = test.extend<{ freshBackend: void }>({
  freshBackend: [async ({}, use) => { await backend.reset(); await use(); }, { auto: true }],
});
export { expect };
