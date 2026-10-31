# RoFo backend (SST v3.19.3)

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
votePoolProposal, recordPoolContribution (Admin only).

Rules enforced in the backend:
- Seat limit and double join: one DynamoDB transaction (member put + memberCount condition).
- Members cannot credit themselves. Contributions are recorded by Admin only. Wire the escrow or payment webhook to `recordContribution`.
- Leaving is blocked after paying in. The creator cannot leave.
- One vote per member per proposal (key = proposal + user). Members can change their vote.
- Non-members only see the pool summary. Names, shares, ledger and votes are member-only.
- Status is derived (FORMING, SAVING, READY, CLOSED), never stored.

Test (in-memory fake, not real DynamoDB): `npm run test:backend`

Not built yet: closing a pool, exit and refund flow, payout to the seller, notifications, KYC.
