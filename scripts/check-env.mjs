#!/usr/bin/env node
/**
 * Checks the VITE_* backend values before you build or deploy the frontend.
 * Usage: npm run check:env            (reads .env.local, then process env)
 *        npm run check:env -- path/to/file
 * Exit 0 = ready (or intentionally empty demo mode). Exit 1 = fix the listed problems.
 * Why: the app quietly falls back to demo mode if any one value is missing, which is easy to miss.
 */
import { existsSync, readFileSync } from 'node:fs';

const file = process.argv[2] ?? '.env.local';
const fromFile = {};
if (existsSync(file)) {
  for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m && !line.trim().startsWith('#')) fromFile[m[1]] = m[2].replace(/^['"]|['"]$/g, '');
  }
}
const get = (k) => (process.env[k] ?? fromFile[k] ?? '').trim();

const REQUIRED = ['VITE_AWS_REGION', 'VITE_USER_POOL_ID', 'VITE_USER_POOL_CLIENT_ID', 'VITE_IDENTITY_POOL_ID', 'VITE_GRAPHQL_URL', 'VITE_REST_URL', 'VITE_CDN_URL'];
const set = REQUIRED.filter((k) => get(k));

if (set.length === 0) {
  console.log(`No backend values in ${file} or the environment. The app will run in DEMO mode (mock data).`);
  process.exit(0);
}

const errors = [];
for (const k of REQUIRED) if (!get(k)) errors.push(`${k} is missing. With only some values set the app falls back to demo mode.`);

const region = get('VITE_AWS_REGION');
const rules = [
  ['VITE_AWS_REGION', /^[a-z]{2}-[a-z]+-\d$/, 'like us-east-1'],
  ['VITE_USER_POOL_ID', /^[a-z]{2}-[a-z]+-\d_[A-Za-z0-9]+$/, 'like us-east-1_AbC123xyz'],
  ['VITE_USER_POOL_CLIENT_ID', /^[a-z0-9]{20,40}$/, 'a 26 character lowercase id'],
  ['VITE_IDENTITY_POOL_ID', /^[a-z]{2}-[a-z]+-\d:[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/, 'like us-east-1:xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx'],
  ['VITE_GRAPHQL_URL', /^https:\/\/[a-z0-9]+\.appsync-api\.[a-z0-9-]+\.amazonaws\.com\/graphql$/, 'like https://xxxx.appsync-api.us-east-1.amazonaws.com/graphql'],
  ['VITE_REST_URL', /^https:\/\/[a-z0-9]+\.execute-api\.[a-z0-9-]+\.amazonaws\.com$/, 'like https://xxxx.execute-api.us-east-1.amazonaws.com (no trailing slash, no path)'],
  ['VITE_CDN_URL', /^https:\/\/[a-z0-9]+\.cloudfront\.net$/, 'like https://dxxxx.cloudfront.net (no trailing slash)'],
];
for (const [k, re, hint] of rules) if (get(k) && !re.test(get(k))) errors.push(`${k} looks wrong. Expected ${hint}. Got "${get(k)}".`);

// Everything must live in one region.
if (region) {
  for (const k of ['VITE_USER_POOL_ID', 'VITE_IDENTITY_POOL_ID', 'VITE_GRAPHQL_URL', 'VITE_REST_URL']) {
    const v = get(k);
    if (v && !v.includes(region)) errors.push(`${k} is not in region ${region}. All values must come from the same deploy.`);
  }
}
if (/localhost|127\.0\.0\.1/.test(get('VITE_GRAPHQL_URL'))) errors.push('VITE_GRAPHQL_URL points at localhost.');

if (errors.length) {
  console.error(`Found ${errors.length} problem${errors.length === 1 ? '' : 's'} in ${file}:\n` + errors.map((e) => `  - ${e}`).join('\n'));
  process.exit(1);
}
console.log(`OK. All ${REQUIRED.length} backend values are present and well formed (${region}). The app will use the live API.`);
