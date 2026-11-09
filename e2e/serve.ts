/**
 * Build the app for one E2E mode and serve the production bundle with `vite preview`.
 *   demo: no backend settings, so the app runs on mock data.
 *   api:  pointed at the fake AWS in e2e/fake/server.ts.
 * Usage: npx tsx e2e/serve.ts demo|api
 */
import { build, preview } from 'vite';

const mode = process.argv[2] === 'api' ? 'api' : 'demo';
const BACKEND = 'http://127.0.0.1:4600';
const PORT = mode === 'api' ? 4174 : 4173;

// Vite never overrides variables already in the environment, so a developer's own .env.local cannot leak in.
const env: Record<string, string> = mode === 'api'
  ? {
    VITE_AWS_REGION: 'us-east-1',
    VITE_USER_POOL_ID: 'us-east-1_E2EPOOL',
    VITE_USER_POOL_CLIENT_ID: 'e2eclient',
    VITE_IDENTITY_POOL_ID: 'us-east-1:00000000-0000-0000-0000-00000000e2e0',
    VITE_GRAPHQL_URL: `${BACKEND}/graphql`,
    VITE_REST_URL: `${BACKEND}/rest`,
    VITE_CDN_URL: `${BACKEND}/cdn`,
  }
  : { VITE_USER_POOL_ID: '', VITE_USER_POOL_CLIENT_ID: '', VITE_IDENTITY_POOL_ID: '', VITE_GRAPHQL_URL: '', VITE_REST_URL: '', VITE_CDN_URL: '' };
Object.assign(process.env, env, { VITE_MAP_STYLE: `${BACKEND}/map/style.json` });

const outDir = `e2e/.dist/${mode}`;
await build({ logLevel: 'warn', build: { outDir, emptyOutDir: true } });
const server = await preview({ build: { outDir }, preview: { port: PORT, strictPort: true, host: '127.0.0.1' } });
server.printUrls();
