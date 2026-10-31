# First deploy checklist

Goal: get the RoFo backend running on AWS, connect the frontend, and prove each feature works with real services.

Read this first. Everything below was tested against fakes: in-memory tables, a stand-in AppSync and Cognito, and stubbed providers. **No real AWS deploy has happened yet.** Expect to fix one or two things on the first run. The troubleshooting table at the end lists the likeliest ones.

Use two stages:

| Stage | Frontend origin | Used for |
| --- | --- | --- |
| `dev` | `http://localhost:5173` (default) | Local work and the first deploy |
| `production` | your real site URL | Real users. Data is kept on removal. |

Stage names must be lowercase letters and digits. The images bucket name is built from the stage (`rofo-<stage>-images-<account id>`), and S3 names must be lowercase and under 64 characters.

---

## 1. Before you start

- [ ] An AWS account you can bill, and credentials on this machine.
  ```bash
  aws sts get-caller-identity
  ```
  Expect your account id. If it errors, run `aws configure` or `export AWS_PROFILE=<name>`.
- [ ] Permissions. For the first deploy use `AdministratorAccess`. SST creates IAM roles, so scoped policies cause slow trial and error. Tighten later.
- [ ] Node 22 and a clean install.
  ```bash
  node -v        # v22.x
  npm ci
  ```
- [ ] Region is `us-east-1` (set in `sst.config.ts`). Leave it unless you have a reason.

## 2. Pre-flight checks (no AWS needed)

- [ ] All of these pass. If one fails, stop and fix it before spending time on AWS.
  ```bash
  npm run build              # app typecheck + production build
  npm run typecheck:backend  # backend, infra and tests
  npm run test:frontend      # 24 tests
  npm run test:backend       # 24 tests
  ```

## 3. Decide before you deploy

- [ ] **Geocoding contact.** Nominatim asks every app to identify itself. Use a real address you read.
  ```bash
  export GEOCODE_USER_AGENT="rofo-estate/1.0 (you@yourdomain.com)"
  ```
- [ ] **Frontend origin.** Local dev needs nothing. For `production`, set the exact site origin, with scheme and without a trailing slash:
  ```bash
  export WEB_ORIGIN="https://rofo.example.com"
  ```
  This controls CORS on the REST API and the images bucket. A mismatch breaks photo upload and nothing else, so it is easy to miss.
- [ ] **Optional:** a MapTiler key for address search with higher limits. Skip it for now. Set it later with `npx sst secret set MapTilerKey <key> --stage <stage>`.

## 4. Deploy `dev`

- [ ] Deploy. Always pass `--stage`, otherwise SST stops with "No stage specified".
  ```bash
  npx sst deploy --stage dev
  ```
  The first run bootstraps SST in your account, then creates the table, bucket, CloudFront, Cognito, AppSync and Lambdas. It takes several minutes. CloudFront is the slowest part.
- [ ] It ends with an outputs block like this. Keep it open.
  ```
  region: us-east-1
  tableName: rofo-dev-TableTable-...
  imagesBucket: rofo-dev-images-123456789012
  cdnUrl: https://dxxxxxxxx.cloudfront.net
  userPoolId: us-east-1_AbC123xyz
  userPoolClientId: 3n4b5c...
  identityPoolId: us-east-1:xxxxxxxx-...
  graphqlUrl: https://xxxx.appsync-api.us-east-1.amazonaws.com/graphql
  restUrl: https://xxxx.execute-api.us-east-1.amazonaws.com
  ```
  Lost it? Run `npx sst deploy --stage dev` again. It changes nothing and prints the outputs.

## 5. Connect the frontend

- [ ] Create `.env.local` in the repo root. It is git-ignored.

  | Deploy output | Env var |
  | --- | --- |
  | `region` | `VITE_AWS_REGION` |
  | `userPoolId` | `VITE_USER_POOL_ID` |
  | `userPoolClientId` | `VITE_USER_POOL_CLIENT_ID` |
  | `identityPoolId` | `VITE_IDENTITY_POOL_ID` |
  | `graphqlUrl` | `VITE_GRAPHQL_URL` |
  | `restUrl` | `VITE_REST_URL` |
  | `cdnUrl` | `VITE_CDN_URL` |

- [ ] Check the values.
  ```bash
  npm run check:env
  ```
  Expect `OK. All 7 backend values are present and well formed`. It lists each problem otherwise. If you skip this step and one value is wrong, the app quietly runs in demo mode.
- [ ] Start the app and confirm it uses the live API: `npm run dev`, open `http://localhost:5173`. With an empty database the results page shows "0 properties". The demo shows 12.

## 6. Seed sample data (dev only)

- [ ] Load the 12 sample listings, with coordinates, so the map has pins.
  ```bash
  npm run seed
  ```
  Expect `Seeded 12 listings`. It refuses to run on `production`.
- [ ] Reload `/search`. Expect 12 properties and pins on the map.

## 7. Create the first users

Cognito sends the confirmation code by email. The default sender is limited to a few dozen emails a day, and mail often lands in spam. Use the CLI shortcut below if a code does not arrive.

- [ ] Sign up at `/login` with your own email. Confirm with the code.
  Code did not arrive? Confirm by hand:
  ```bash
  aws cognito-idp admin-confirm-sign-up --user-pool-id <userPoolId> --username you@example.com
  ```
- [ ] Make yourself the first admin. Nobody can approve agents before one exists.
  ```bash
  aws cognito-idp admin-add-user-to-group --user-pool-id <userPoolId> --username you@example.com --group-name Admin
  ```
- [ ] Sign out and back in. Groups are stored in the token, so the change shows after a new login.
- [ ] Expect the header to show an **Applications** link.
- [ ] Check the signup trigger worked. Create a second account and look at its groups:
  ```bash
  aws cognito-idp admin-list-groups-for-user --user-pool-id <userPoolId> --username second@example.com
  ```
  Expect `Client`. If empty, see "New user has no group" below.

## 8. Smoke tests

Run in order. Each line says what to expect. Tick it only when you saw it.

| # | Do | Expect |
| --- | --- | --- |
| 1 | `curl <restUrl>/health` | `{"success":true,"data":{"status":"ok",...}}` |
| 2 | Signed out, open `/search` | 12 listings, pins on the map. Proves guest access through the identity pool. |
| 3 | Signed out, open `/agent` | A sign in prompt, not the dashboard |
| 4 | Second account: open `/agent/apply`, submit an application | "Application received" |
| 5 | Admin: `/admin/applications`, approve it | Row leaves Pending, appears under Approved |
| 6 | Second account: click **Activate agent access** | Lands on `/agent`. Header shows **Dashboard**. No sign out needed. |
| 7 | Same account: **New listing**. Add a photo. Click **Find on map** with a real address. | Matches list. Picking one fills the pin, city and country. |
| 8 | Publish the listing | It shows in your dashboard and on `/search`. The photo loads from the `cloudfront.net` address. |
| 9 | Third account (buyer): open that listing, send a message | "Thanks" message |
| 10 | Agent: Dashboard, **Inquiries** | The message is there. **Reply** opens an email. |
| 11 | Buyer: click **Save** on a listing, reload the page | It still shows **Saved** |
| 12 | Buyer: `/pools/new`, create a pool. Join it from another account. | Member table shows both. A non-member sees totals only. |
| 13 | Buyer account: try `/agent` and `/admin/applications` | "Agent access needed" and "Admins only" |
| 14 | Two members of one pool: member A clicks **New proposal**, posts one. Member B opens the pool. | B sees it as Open, with "2 yes needed of 2" |
| 15 | A votes Yes, then changes to No, then Yes. B votes Yes. | The count never goes above one vote each. After B's vote it shows **Passed**. |
| 16 | A member opens the pool | No **Record payment** form and no **Reverse** buttons anywhere |
| 17 | Admin (not a member) opens the same pool | Sees members, shares and payments. Has the **Record a confirmed payment** form. |
| 18 | Admin records 2000 for member A with reference `TEST-1` | Payment shows in the ledger. A's share and the pool total go up. |
| 19 | Admin records the same reference again, even with different case or spaces (`  test-1 `) | Refused: "already recorded". The total did not change. |
| 20 | Admin clicks **Reverse** on that payment, with a reason | Original shows **Reversed** and struck through, a negative entry appears, the total is back to 0. Reverse is gone from both rows. |
| 21 | Admin records the correct amount, 200, with reference `TEST-1-FIXED` | Total is 200. A's **Paid in** card shows $200. |

Test 18 to 21 change money records. Run them on `dev` with made up amounts. A real payment reference should come from escrow or the bank, never be invented.

- [ ] **Confirm backups and log retention are really on.** These come from `infra/policy.ts`.
  ```bash
  aws dynamodb describe-continuous-backups --table-name <tableName> \
    --query 'ContinuousBackupsDescription.PointInTimeRecoveryDescription.PointInTimeRecoveryStatus'
  aws dynamodb describe-table --table-name <tableName> --query 'Table.DeletionProtectionEnabled'
  aws logs describe-log-groups --query "logGroups[?contains(logGroupName, 'rofo-<stage>')].[logGroupName,retentionInDays]" --output table
  ```
  Expect `"ENABLED"`. Expect `false` on dev and `true` on production. Expect every log group to show `7` on dev and `90` on production. A blank value means the group never expires, so report it.
- [ ] **Check the logs for errors.** Any smoke test that failed quietly shows up here.
  ```bash
  aws logs describe-log-groups --log-group-name-prefix /aws/lambda/rofo-dev --query 'logGroups[].logGroupName'
  aws logs tail <log group name> --since 30m
  ```

## 9. Put the frontend on Vercel

The Vercel connection used in earlier sessions cannot create projects in `tunecreative` (403). Import it yourself.

- [ ] Vercel, team `tunecreative`, Add New, Project, import `rowellfortune/rofo`. Defaults are right: Vite, `npm run build`, output `dist`.
- [ ] Add the 7 `VITE_*` values under Settings, Environment Variables. They are baked in at build time, so redeploy after any change.
- [ ] Note the site URL. Local origin will no longer be allowed for uploads against the same stage, so use the `production` stage for the live site:
  ```bash
  export WEB_ORIGIN="https://<your vercel url>"
  export GEOCODE_USER_AGENT="rofo-estate/1.0 (you@yourdomain.com)"
  npx sst deploy --stage production
  ```
  Copy the new outputs into Vercel's environment variables, then redeploy the frontend.
- [ ] Run smoke tests 2, 3, 7, 8 again from the live site. Test 7 and 8 are the ones that break on a wrong `WEB_ORIGIN`.
- [ ] Preview deployments on random Vercel URLs cannot upload photos, because their origin differs. Test uploads on the main URL.

## 10. Before real users

Do these before you let anyone outside your team sign up.

- [ ] **Email.** Move Cognito to Amazon SES. The default sender is limited and unreliable for real sign ups.
- [ ] **Practise a restore once** on `dev` (steps in the next section). A backup you never restored is a guess.
- [ ] **Abuse limits.** There is no WAF or rate limiting on AppSync or the REST API yet. Add AWS WAF before launch.
- [ ] **Alarms and budget.** Create an AWS Budget alert and CloudWatch alarms for Lambda errors and AppSync 5xx.
- [ ] **Admins use MFA.** The pool allows optional MFA. Turn it on for admin accounts.
- [ ] **Pools and money.** The app records pooled contributions but moves no money. Do not accept real contributions until a lawyer has approved the co-ownership agreement, and an escrow or trustee holds the funds.
- [ ] **Legal pages.** Privacy and terms links in the footer go nowhere yet.
- [ ] **Custom domain** for the site, and update `WEB_ORIGIN` to match.
- [ ] **Geocoding.** Real contact in `GEOCODE_USER_AGENT`. Consider MapTiler for volume.
- [ ] **Remove test accounts** and the seeded data. Seeding is blocked on `production`, so it only matters if you copied data over.
- [ ] **Know what `protect` means.** `production` keeps its data on removal, and its table has deletion protection on. Removing it takes two deliberate steps (see Rolling back). That is intended.

## 11. Backups and logs (already configured)

Set in `infra/policy.ts`. Change a value there and redeploy.

| What | dev | production |
| --- | --- | --- |
| DynamoDB point in time recovery (restore to any second in the last 35 days) | on | on |
| Table deletion protection | off | **on** |
| Lambda and API access log retention | 7 days | 90 days |

What this covers, and what it does not:

- Point in time recovery covers bad writes and deleted items, for example a buggy release or a mistaken delete. It does **not** cover someone deleting the whole table. Deletion protection is what guards against that.
- The images bucket is not versioned. The app never overwrites or deletes photos, and `production` keeps the bucket on removal. If agents will upload irreplaceable originals, turn on versioning first.
- Auth data lives in Cognito, not DynamoDB. User accounts are not backed up by this. Losing the user pool means losing every account.
- AppSync request logging is **not** enabled. Lambda errors are logged. Requests refused before reaching a Lambda (for example an expired token) leave no log.

**Restoring.** A restore always creates a new table. It does not overwrite the live one. The live table name is wired into the app by SST, so the practical path is to copy items back:

```bash
aws dynamodb restore-table-to-point-in-time \
  --source-table-name <tableName> --target-table-name <tableName>-restore \
  --restore-date-time 2026-01-31T09:00:00Z      # or: --use-latest-restorable-time
aws dynamodb wait table-exists --table-name <tableName>-restore
```

Then inspect the restored table, copy the needed items into the live table (a scan and batch write script, written for the job), and delete `<tableName>-restore` when done. Some settings such as TTL and backup settings are not copied to the restored table, which does not matter for a temporary table. Rehearse this once on `dev` so the first time is not during an incident.

## 12. Rolling back

- **Frontend:** Vercel, Deployments, pick a good one, Promote to Production. Instant.
- **Backend:** check out the last good commit and redeploy: `git checkout <sha> && npx sst deploy --stage production`.
- **Tear down `dev`:** `npx sst remove --stage dev`. This deletes the table and its data and empties the bucket. Fine for dev, never for production.
- **Remove `production` on purpose:** this is two steps by design. First set `tableDeletionProtection` to `false` in `infra/policy.ts` and deploy. Then remove. `sst remove` keeps the data (retain) unless you delete the table yourself. Take a restore or export first.

## 13. Troubleshooting

| Symptom | Likely cause | Fix |
| --- | --- | --- |
| `No stage specified` | Missing flag | Add `--stage dev` |
| Deploy fails on the bucket name | Stage has capitals or is too long | Use a short lowercase stage |
| Deploy fails inside AppSync | Schema or resolver rejected | Read the error. The schema is `backend/graphql/schema.graphql`. Only the syntax was checked locally, AWS validates the rest. |
| App shows demo data after deploy | A value is missing or the build is old | `npm run check:env`, then rebuild. Vite bakes env values in at build time. |
| Search errors for guests (`Unauthorized`) | Identity pool guest role lacks access | Check the unauthenticated role allows `appsync:GraphQL` on `Query.searchListings` and `Query.getListing` |
| Search returns 0 with no error | Empty table, or seeded a different stage | `npm run seed` for `dev` |
| Photo upload fails, CORS error in the browser console | `WEB_ORIGIN` does not match the site origin | Fix the env var and redeploy the stage |
| Photo uploads but the image 403s | CloudFront still propagating, or wrong `VITE_CDN_URL` | Wait a few minutes. Compare with the `cdnUrl` output. |
| New user has no group | Post confirmation trigger failed | Check its log group. Fix by hand: `admin-add-user-to-group ... --group-name Client` |
| Approved user still sees "List a property" | Token still has the old groups | Click **Activate agent access**, or sign out and in |
| Approve returns "Could not grant agent access" | Lambda lacks the IAM action or `USER_POOL_ID` | Check the resolver Lambda's permissions and env. The application stays Pending, so retry after the fix. |
| Address search says "unavailable" | Nominatim blocked or rate limited the call | Check the log. Set a real `GEOCODE_USER_AGENT`, or add a MapTiler key. The agent can always click the map. |
| Map is blank | The OpenFreeMap style is unreachable | Set `VITE_MAP_STYLE` to another style URL |
| `sst remove --stage production` fails on the table | Deletion protection is on | Intended. See Rolling back for the two step removal. |
| A log group shows no retention | Created outside SST, or the transform did not apply | Run `npm run test:backend`. It checks the transforms are registered before any component. Set the retention by hand in CloudWatch as a stopgap. |
| Sign up code never arrives | Spam folder, or the Cognito email limit | Use `admin-confirm-sign-up` |

## 14. Known gaps (do not look for these)

- No email to applicants or buyers. Status shows in the app only.
- No way to revoke agent access in the app. Remove the group in Cognito by hand.
- Recording a payment is manual (admin types it in). Nothing receives escrow or bank notifications yet. A webhook can call the same API later.
- No vote deadline, and a passed proposal triggers nothing. Votes are a record of the group's decision.
- No payments. Pools track commitments, not money.
- No AppSync request logging, and no backup of Cognito accounts.
- Listing drafts and unpublish are not built. Deleting is permanent.
- Search text matching (city, address) runs in the browser on the first 50 results per deal.
