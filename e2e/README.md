# End to end tests

Real Chromium, real production build, real backend code. Run them with:

```bash
npm run e2e          # everything (about 2 minutes)
npm run e2e:demo     # the demo build only, no backend
npm run e2e:api      # the app wired to the local fake AWS
```

Playwright starts three servers by itself: the fake AWS on port 4600, the demo build on 4173 and the API build on 4174.
A failed test leaves a screenshot and a page snapshot in `e2e/.results/`.

## What runs for real

| Piece | In these tests |
|---|---|
| React app | The production bundle from `vite build`, served by `vite preview` |
| Amplify | Real library. It signs in with SRP, refreshes tokens and signs AppSync calls as in production |
| GraphQL resolvers | **The real** `backend/graphql/handler.ts`, called once per root field like Direct Lambda resolvers |
| Upload presign | **The real** `backend/rest/presign.ts` |
| DynamoDB | [dynalite](https://github.com/architect/dynalite), an in-memory DynamoDB, with the same keys and indexes as `infra/storage.ts`. `fake/dynamoTx.ts` adds transactions, which dynalite lacks |
| AppSync | `fake/server.ts`: checks the JWT, enforces `@aws_iam` / `@aws_cognito_user_pools(cognito_groups)` on each root field, and validates every query against `schema.graphql` |
| Cognito | `fake/cognito.ts`: sign up, emailed codes (read from an outbox), SRP sign in with real password checks, TOTP, password reset, refresh, global sign out, groups, and the admin calls the backend makes |
| S3 + CloudFront | `fake/server.ts`: accepts the presigned POST (checks type and size) and serves the files |
| Map | Real MapLibre on WebGL (SwiftShader) with a blank local style, so no tile servers |
| Geocoding | Nominatim is answered locally: "Kerkplein 1" finds one place, anything else finds none |

The browser is cut off from the internet: Cognito requests are rerouted to the fake, everything else external is blocked.

## What these tests cannot prove

- IAM permissions, CloudFront, CORS on the real API Gateway, and the S3 bucket policy. Only a deploy tests those. See the smoke tests in DEPLOY.md.
- AppSync's per-type auth rules. The fake checks root fields only.
- The S3 POST policy signature. The fake checks type and size, not the signature.
- Real email delivery and Cognito's rate limits.

## Files

- `api/*.spec.ts`: accounts, the agent journey, pools. They share one backend that is reset before each test, so they run one at a time.
- `demo/*.spec.ts`: the mock data build. These run in parallel.
- `support.ts`: routing, backend controls (`backend.user`, `backend.code`, `backend.listings`) and `signIn`.
