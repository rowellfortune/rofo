# RoFo backend (SST v3.19.3)

Deploying for the first time? Follow [DEPLOY.md](./DEPLOY.md). This file is the reference for how each part works.

Run: `npx sst dev --stage dev` (needs AWS credentials). Seed: `npm run seed`.

Stack: DynamoDB single table, Cognito (groups Admin, Agent, Client) + identity pool,
AppSync (GraphQL, direct Lambda resolver), API Gateway v2 (REST presign + health),
private S3 images bucket behind CloudFront.

Add users to groups after sign up:
`aws cognito-idp admin-add-user-to-group --user-pool-id <id> --username <email> --group-name Agent`

Open items: SES for inquiry emails, price GSI or OpenSearch, custom domain, WAF on AppSync.

## Pools (co-buying groups)

Items live in the same table, one partition per pool (`pk=POOL#<id>`):
META, MEMBER#<user>, LEDGER#<iso>#<id>, PROP#<id>, VOTE#<proposal>#<user>.
`getPool` is one Query. "My pools" uses gsi3 (`MEMBER#<user>`), pools per listing use gsi1, the feed uses gsi2.

GraphQL: listPools, getPool, myPools, createPool, joinPool, leavePool, createPoolProposal,
votePoolProposal, recordPoolContribution and reversePoolContribution (Admin only).

Rules enforced in the backend:
- Seat limit and double join: one DynamoDB transaction (member put + memberCount condition).
- Members cannot credit themselves. Contributions are recorded by Admin only. Wire the escrow or payment webhook to `recordContribution`.
- Leaving is blocked after paying in. The creator cannot leave.
- One vote per member per proposal (key = proposal + user). Members can change their vote.
- Non-members only see the pool summary. Names, shares, ledger and votes are member-only.
- Status is derived (FORMING, SAVING, READY, CLOSED), never stored.

Test (in-memory fake, not real DynamoDB): `npm run test:backend`

Not built yet: closing a pool, exit and refund flow, payout to the seller, notifications, KYC.

## Connect the frontend

Run `npx sst deploy --stage dev`, then copy the outputs into `.env.local`:

| Output            | Env var                       |
| ----------------- | ----------------------------- |
| region            | VITE_AWS_REGION               |
| userPoolId        | VITE_USER_POOL_ID             |
| userPoolClientId  | VITE_USER_POOL_CLIENT_ID      |
| identityPoolId    | VITE_IDENTITY_POOL_ID         |
| graphqlUrl        | VITE_GRAPHQL_URL              |
| restUrl           | VITE_REST_URL (photo uploads) |
| cdnUrl            | VITE_CDN_URL                  |

With none of these set the app runs as a demo on mock data.

## Agent dashboard

Routes: `/agent` (my listings), `/agent/new`, `/agent/:id/edit`, `/agent/:id/inquiries`.
Only the `Agent` and `Admin` groups get in. New sign ups land in `Client` and apply for agent access (below).
Photos go browser to S3 through a presigned POST (8 MB, JPEG/PNG/WebP). Location is set by dropping a pin on the map.

## Address search (geocoding)

`geocodeAddress(query)` is an agent-only GraphQL query. The editor's "Find on map" button calls it.
Results (up to 5) are cached in the main table for 30 days (`GEO#<hash>` items with a `ttl` attribute). Empty results and errors are never cached.

- **Default provider: Nominatim** (OpenStreetMap, no key). Fine for the low, button-triggered volume of agents saving listings.
  Their usage policy asks apps to identify themselves. Set a real contact before launch:
  `GEOCODE_USER_AGENT="rofo-estate/1.0 (you@yourdomain.com)" npx sst deploy`
  Do not turn this into search-as-you-type. That is against their policy.
- **Production option: MapTiler** (key, higher limits). `npx sst secret set MapTilerKey <key> --stage production`.
  With the secret set the Lambda uses MapTiler. Empty means Nominatim. The key never reaches the browser.
- Place names depend on OpenStreetMap coverage. In Suriname, street level matches can be thin, so the agent can always click the map or drag the pin.

## Agent applications (self-serve)

Flow: a signed in buyer opens `/agent/apply`, submits agency details, an admin reviews at `/admin/applications`,
approval adds the user to the `Agent` group, and the applicant clicks "Activate agent access" (a token refresh, no sign out).

- Items: `pk=APPLICATION#<userId>`, `sk=META`. The admin queue is `gsi2pk=APPS#<STATUS>`. One application per user.
- Resubmitting is allowed only after a rejection. Writes are conditional, so a double click or two admins cannot both win.
- Approve claims the decision first, then adds the Cognito group. If Cognito fails the claim is undone and the application stays pending.
- Only the resolver Lambda may call `cognito-idp:AdminAddUserToGroup`, scoped to this user pool.

**Bootstrap the first admin by hand** (nobody can approve before there is one):

`aws cognito-idp admin-add-user-to-group --user-pool-id <id> --username <email> --group-name Admin`

Then sign out and in. Not built yet: email to the applicant on a decision (needs SES), revoking agent access, and the applicant's license document upload.

## Backups and logs

Policy lives in `infra/policy.ts`: point in time recovery on for every stage, table deletion protection on `production`,
log retention 7 days on dev and 90 days on `production` (Lambda and API access logs).
Details, how to verify after deploy, and how to restore are in [DEPLOY.md](./DEPLOY.md) section 11.

### Pool payments and votes

- `recordPoolContribution` needs a `reference` (escrow, bank or provider transaction id). A reference can be recorded once per pool
  (case and spaces ignored), enforced by a marker item in the same transaction, so a double click or a webhook retry cannot credit twice.
- The ledger is append only. `reversePoolContribution` marks the original reversed and adds a negative entry. A payment reverses once,
  a reversal cannot be reversed, and the member balance can never go below zero. A mistake is fixed by reversing and recording again.
- Admins can read a full pool (members, shares, ledger, votes) without joining, because they run the payment side. Other non-members see totals only.
- Members create proposals (`createPoolProposal`) and vote (`votePoolProposal`). One vote per member per proposal, changeable.
  A proposal passes at more than half of the members voting yes. Nothing happens automatically when it passes.
- Screens: `/pools/:id` has New proposal, vote buttons with a threshold bar, a payments list, a member summary,
  and for admins a record payment form and a Reverse button on each payment.

## Revoking agent access

`revokeAgentAccess(userId, reason, hideListings)`, Admin only. Screen: `/admin/applications`, Approved tab, **Revoke access**.

Order of steps (`backend/lib/applications.ts`, `revokeAgent`):
1. One transaction marks the application `REVOKED` (only if it was `APPROVED`) and writes a block item `pk=REVOKED#<userId>`.
2. Cognito: remove the `Agent` group and end the user's sessions. If this fails, step 1 is undone and nothing changes.
3. Optionally hide the agent's listings (`suspended` on each listing). A failure here does not undo the revoke. The response says how many were hidden or failed.

Why the block item exists: the user's current token still lists the Agent group for up to an hour, and AppSync trusts the token.
Every agent only call (create, update, delete, my listings, inquiries, address search) and the photo upload endpoint check the block item first.
One extra read per call. Admins are never blocked.

Photo upload (`POST /uploads/presign`) now requires the Agent or Admin group. Before this it accepted any signed in user.

Hidden listings: not in search, not readable by the public, skipped in saved lists, cannot start a pool. The owner still sees them (marked Hidden) and an edit does not un-hide them.
Approving the person again removes the block and brings back the listings that revocation hid. Listings hidden for any other reason stay hidden.

A revoked person can apply again. The next reviewer sees the earlier reason.

## Sign in and account security

Screens: `/login` (sign in, sign up, confirm email, forgot password, reset password, authenticator code) and `/account` (profile, two step verification).

- **Forgot password** sends a code to the verified email (pool recovery is set to verified email only). The page gives the same answer whether or not the account exists, and wrong password and unknown email read the same, so the forms cannot be used to find out who has an account.
- **Resend code** has a 30 second cooldown in the page. Cognito also rate limits on its side.
- **Two step verification** is an authenticator app (TOTP). The user enrolls at `/account` with a QR code and a typed key, proves it with the first code, and is then asked for a code at every sign in. The pool allows it as optional. SMS is not enabled.
- Cognito has no recovery codes. A lost device means an admin resets it (command in `DEPLOY.md`).
- Passwords: at least 10 characters with upper case, lower case and a number. The page checks the same rules before sending. Cognito remains the authority.
- The sign in uses SRP, so the password is never sent to the server.
- Pure rules and error wording live in `src/lib/authFlow.ts` and are covered by `tests/auth.test.ts`.

## Admin two step verification (enforced)

Cognito cannot require MFA for one group, so the backend does (`backend/lib/mfa.ts`, wired at `backend/graphql/handler.ts` and `backend/rest/presign.ts`).

- On every request from a user in the `Admin` group, the Lambda asks Cognito (`AdminGetUser`) whether that user has an authenticator app switched on.
- If not, the `Admin` group is removed from the caller before anything else runs, so the person is treated as an ordinary user. This covers every admin check, including the ones inside the libraries and any added later. The error says why ("Turn on two step verification in your account to use admin tools").
- If Cognito cannot be asked, admin rights are withheld too (fails closed).
- A yes is remembered for 60 seconds per container. A no is never remembered, so turning MFA on works at once. Turning it off takes effect within a minute.
- Buyers and agents trigger no lookup. An admin who is also an Agent keeps the agent rights.
- Why this equals "MFA at sign in": with optional MFA, Cognito always challenges a user who has it on. Enabled therefore means a code was requested.
- Needs `cognito-idp:AdminGetUser` and `USER_POOL_ID` on the resolver Lambda and the upload Lambda (set in `infra/api.ts`).
- The screens (`RequireAdmin`, payment controls, the account banner) explain the lock. The server is the real control.
- Not done: forcing the code in the token itself (a pre token generation trigger would also stop an admin at AppSync before the Lambda). The Lambda check is enough for now and is simpler to reason about.
