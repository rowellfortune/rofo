/// <reference path="../.sst/platform/config.d.ts" />

/**
 * Single DynamoDB table (Single Table Design).
 *
 * Entities and keys:
 *  Listing   pk=LISTING#<id>    sk=META
 *  Favorite  pk=USER#<sub>      sk=FAV#<listingId>
 *  Inquiry   pk=LISTING#<id>    sk=INQ#<createdAt>#<uuid>
 *
 * Access patterns (GSIs):
 *  gsi1  listings by place + deal, newest first  (PLACE#<country>#<city> / <deal>#<createdAt>#<id>)
 *  gsi2  listings feed by deal, newest first      (DEAL#<deal> / <createdAt>#<id>)
 *  gsi3  listings owned by one agent              (AGENT#<sub> / <createdAt>#<id>)
 */
export const table = new sst.aws.Dynamo('Table', {
  fields: {
    pk: 'string', sk: 'string',
    gsi1pk: 'string', gsi1sk: 'string',
    gsi2pk: 'string', gsi2sk: 'string',
    gsi3pk: 'string', gsi3sk: 'string',
  },
  primaryIndex: { hashKey: 'pk', rangeKey: 'sk' },
  globalIndexes: {
    gsi1: { hashKey: 'gsi1pk', rangeKey: 'gsi1sk' },
    gsi2: { hashKey: 'gsi2pk', rangeKey: 'gsi2sk' },
    gsi3: { hashKey: 'gsi3pk', rangeKey: 'gsi3sk' },
  },
});

// ---------- Images: private S3 bucket served through CloudFront (OAC) ----------

const accountId = aws.getCallerIdentityOutput().accountId;
const region = aws.getRegionOutput().name;

// Deterministic bucket name so the CloudFront distribution (and its ARN) can exist
// before the bucket. That lets us build the bucket policy up front.
const bucketName = $interpolate`${$app.name}-${$app.stage}-images-${accountId}`;
const bucketArn = $interpolate`arn:aws:s3:::${bucketName}`;

// Origin access control: CloudFront signs requests to S3. The bucket stays private.
const oac = new aws.cloudfront.OriginAccessControl('ImagesOac', {
  originAccessControlOriginType: 's3',
  signingBehavior: 'always',
  signingProtocol: 'sigv4',
});

export const cdn = new aws.cloudfront.Distribution('ImagesCdn', {
  enabled: true,
  priceClass: 'PriceClass_100',
  origins: [{
    originId: 'images',
    domainName: $interpolate`${bucketName}.s3.${region}.amazonaws.com`,
    originAccessControlId: oac.id,
  }],
  defaultCacheBehavior: {
    targetOriginId: 'images',
    viewerProtocolPolicy: 'redirect-to-https',
    allowedMethods: ['GET', 'HEAD'],
    cachedMethods: ['GET', 'HEAD'],
    compress: true,
    cachePolicyId: '658327ea-f89d-4fab-a63d-7e88639e58f6', // Managed-CachingOptimized
  },
  restrictions: { geoRestriction: { restrictionType: 'none' } },
  viewerCertificate: { cloudfrontDefaultCertificate: true },
});

// Bucket policy built OUTSIDE the Bucket component with Pulumi.
const imagesPolicy = aws.iam.getPolicyDocumentOutput({
  statements: [
    {
      sid: 'DenyInsecureTransport',
      effect: 'Deny',
      principals: [{ type: '*', identifiers: ['*'] }],
      actions: ['s3:*'],
      resources: [bucketArn, $interpolate`${bucketArn}/*`],
      conditions: [{ test: 'Bool', variable: 'aws:SecureTransport', values: ['false'] }],
    },
    {
      sid: 'AllowCloudFrontRead',
      effect: 'Allow',
      principals: [{ type: 'Service', identifiers: ['cloudfront.amazonaws.com'] }],
      actions: ['s3:GetObject'],
      resources: [$interpolate`${bucketArn}/*`],
      conditions: [{ test: 'StringEquals', variable: 'AWS:SourceArn', values: [cdn.arn] }],
    },
  ],
}).json;

export const images = new sst.aws.Bucket('Images', {
  // No `access`: the bucket is never public. Reads go through CloudFront only.
  enforceHttps: true,
  versioning: false,
  cors: {
    allowOrigins: [process.env.WEB_ORIGIN ?? 'http://localhost:5173'],
    allowMethods: ['GET', 'POST', 'PUT'],
    allowHeaders: ['*'],
    maxAge: '1 hour',
  },
  transform: {
    bucket: (args) => { args.bucket = bucketName; },
    // Block every form of public access.
    publicAccessBlock: (args) => {
      args.blockPublicAcls = true;
      args.blockPublicPolicy = true;
      args.ignorePublicAcls = true;
      args.restrictPublicBuckets = true;
    },
    // SST always creates one policy per bucket, and S3 allows only one.
    // So instead of adding a second aws.s3.BucketPolicy (which would overwrite
    // it), we swap in the document built above.
    policy: (args) => { args.policy = imagesPolicy; },
  },
});
