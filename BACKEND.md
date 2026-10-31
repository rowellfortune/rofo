# RoFo backend (SST v3.19.3)

Run: `npx sst dev --stage dev` (needs AWS credentials). Seed: `npm run seed`.

Stack: DynamoDB single table, Cognito (groups Admin, Agent, Client) + identity pool,
AppSync (GraphQL, direct Lambda resolver), API Gateway v2 (REST presign + health),
private S3 images bucket behind CloudFront.

Add users to groups after sign up:
`aws cognito-idp admin-add-user-to-group --user-pool-id <id> --username <email> --group-name Agent`

Open items: SES for inquiry emails, price GSI or OpenSearch, custom domain, WAF on AppSync.
