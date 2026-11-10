/// <reference path="../.sst/platform/config.d.ts" />
import { readFileSync } from 'node:fs';
import { images, table } from './storage';
import { userPool, userPoolClient } from './auth';

const region = aws.getRegionOutput().name;

// ---------- GraphQL (AppSync) ----------

/**
 * Optional MapTiler key for address search. Leave empty to use keyless Nominatim.
 * Production: `npx sst secret set MapTilerKey <key> --stage production`.
 */
export const mapTilerKey = new sst.Secret('MapTilerKey', '');

/** One Lambda serves every field. It switches on info.fieldName. */
const resolverFn = new sst.aws.Function('GraphqlResolver', {
  handler: 'backend/graphql/handler.handler',
  link: [table, mapTilerKey],
  timeout: '15 seconds',
  // Nominatim asks apps to identify themselves. Set a real contact for production.
  environment: {
    GEOCODE_USER_AGENT: process.env.GEOCODE_USER_AGENT || 'rofo-estate/1.0', // || not ??: CI passes an unset variable as ''
    USER_POOL_ID: userPool.id, // used to add approved applicants to the Agent group
  },
  // Only these actions, only on this user pool.
  permissions: [{ actions: ['cognito-idp:AdminAddUserToGroup', 'cognito-idp:AdminRemoveUserFromGroup', 'cognito-idp:AdminUserGlobalSignOut', 'cognito-idp:AdminGetUser'], resources: [userPool.arn] }],
});

export const graphql = new aws.appsync.GraphQLApi('Graphql', {
  name: `${$app.name}-${$app.stage}`,
  authenticationType: 'AMAZON_COGNITO_USER_POOLS',
  // ALLOW is required: AppSync rejects DENY when additional auth providers exist (400 on CreateGraphqlApi).
  // Access is still locked down per field by the schema directives (@aws_iam, @aws_cognito_user_pools with
  // cognito_groups), and the resolver Lambda re-checks groups on every call.
  userPoolConfig: { userPoolId: userPool.id, awsRegion: region, defaultAction: 'ALLOW' },
  // Guests (identity pool unauth role) use IAM for the public queries.
  additionalAuthenticationProviders: [{ authenticationType: 'AWS_IAM' }],
  schema: readFileSync('backend/graphql/schema.graphql', 'utf8'),
  xrayEnabled: false,
});

// AppSync assumes this role to invoke the resolver Lambda.
const appsyncRole = new aws.iam.Role('GraphqlInvokeRole', {
  assumeRolePolicy: aws.iam.getPolicyDocumentOutput({
    statements: [{
      actions: ['sts:AssumeRole'],
      principals: [{ type: 'Service', identifiers: ['appsync.amazonaws.com'] }],
    }],
  }).json,
});
new aws.iam.RolePolicy('GraphqlInvokePolicy', {
  role: appsyncRole.id,
  policy: aws.iam.getPolicyDocumentOutput({
    statements: [{ actions: ['lambda:InvokeFunction'], resources: [resolverFn.arn] }],
  }).json,
});

const dataSource = new aws.appsync.DataSource('GraphqlLambda', {
  apiId: graphql.id,
  name: 'ResolverLambda',
  type: 'AWS_LAMBDA',
  serviceRoleArn: appsyncRole.arn,
  lambdaConfig: { functionArn: resolverFn.arn },
});

// Direct Lambda resolvers (no VTL). Field list must match schema.graphql.
const fields: Record<'Query' | 'Mutation', string[]> = {
  Query: ['getListing', 'searchListings', 'myListings', 'myFavorites', 'listingInquiries', 'myAgentApplication', 'agentApplications', 'geocodeAddress', 'listPools', 'getPool', 'myPools'],
  Mutation: ['createListing', 'updateListing', 'deleteListing', 'toggleFavorite', 'sendInquiry', 'submitAgentApplication', 'reviewAgentApplication', 'revokeAgentAccess',
    'createPool', 'joinPool', 'leavePool', 'createPoolProposal', 'votePoolProposal', 'recordPoolContribution', 'reversePoolContribution'],
};
(Object.entries(fields) as ['Query' | 'Mutation', string[]][]).forEach(([type, names]) => {
  names.forEach((field) => {
    new aws.appsync.Resolver(`${type}${field}`, {
      apiId: graphql.id,
      type,
      field,
      dataSource: dataSource.name,
    });
  });
});

// ---------- REST (API Gateway v2): image upload presign ----------

const allowOrigin = process.env.WEB_ORIGIN ?? 'http://localhost:5173';

export const rest = new sst.aws.ApiGatewayV2('Rest', {
  cors: {
    allowOrigins: [allowOrigin],
    allowMethods: ['GET', 'POST', 'OPTIONS'],
    allowHeaders: ['authorization', 'content-type'],
    maxAge: '1 hour',
  },
});

// Cognito JWT authorizer. Only signed-in users get presigned upload URLs.
const jwt = rest.addAuthorizer({
  name: 'CognitoJwt',
  jwt: {
    issuer: $interpolate`https://cognito-idp.${region}.amazonaws.com/${userPool.id}`,
    audiences: [userPoolClient.id],
  },
});

rest.route(
  'POST /uploads/presign',
  {
    handler: 'backend/rest/presign.handler',
    link: [images, table], // the table is read to check an agent has not been revoked
    environment: { ALLOWED_ORIGIN: allowOrigin, USER_POOL_ID: userPool.id },
    // Read only: used to check an admin has two step verification turned on.
    permissions: [{ actions: ['cognito-idp:AdminGetUser'], resources: [userPool.arn] }],
  },
  { auth: { jwt: { authorizer: jwt.id } } },
);

rest.route('GET /health', {
  handler: 'backend/rest/health.handler',
  environment: { ALLOWED_ORIGIN: allowOrigin },
});
