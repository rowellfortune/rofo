/// <reference path="../.sst/platform/config.d.ts" />
import { readFileSync } from 'node:fs';
import { images, table } from './storage';
import { userPool, userPoolClient } from './auth';

const region = aws.getRegionOutput().name;

// ---------- GraphQL (AppSync) ----------

/** One Lambda serves every field. It switches on info.fieldName. */
const resolverFn = new sst.aws.Function('GraphqlResolver', {
  handler: 'backend/graphql/handler.handler',
  link: [table],
  timeout: '15 seconds',
});

export const graphql = new aws.appsync.GraphQLApi('Graphql', {
  name: `${$app.name}-${$app.stage}`,
  authenticationType: 'AMAZON_COGNITO_USER_POOLS',
  userPoolConfig: { userPoolId: userPool.id, awsRegion: region, defaultAction: 'DENY' },
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
  Query: ['getListing', 'searchListings', 'myListings', 'myFavorites', 'listingInquiries', 'listPools', 'getPool', 'myPools'],
  Mutation: ['createListing', 'updateListing', 'deleteListing', 'toggleFavorite', 'sendInquiry',
    'createPool', 'joinPool', 'leavePool', 'createPoolProposal', 'votePoolProposal', 'recordPoolContribution'],
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
    link: [images],
    environment: { ALLOWED_ORIGIN: allowOrigin },
  },
  { auth: { jwt: { authorizer: jwt.id } } },
);

rest.route('GET /health', {
  handler: 'backend/rest/health.handler',
  environment: { ALLOWED_ORIGIN: allowOrigin },
});
