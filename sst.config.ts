/// <reference path="./.sst/platform/config.d.ts" />

/**
 * RoFo estate backend (SST v4).
 * Infra is split by concern under /infra and imported in order.
 */
export default $config({
  app(input) {
    const isProd = input?.stage === 'production';
    return {
      name: 'rofo',
      removal: isProd ? 'retain' : 'remove', // never delete prod data
      protect: isProd,
      home: 'aws',
      providers: { aws: { region: 'us-east-1' } },
    };
  },
  /**
   * SST Console Autodeploy: a push to GitHub runs `sst deploy` on a CodeBuild runner in our own AWS account.
   * Does nothing until the repo is connected in the Console (console.sst.dev, app settings).
   */
  console: {
    autodeploy: {
      /**
       * Which push goes to which stage. Anything else is skipped: other branches, pull requests, tags,
       * and branch deletions. Without this, SST would create a new stage for every branch and PR.
       */
      target(event) {
        if (event.type !== 'branch' || event.action !== 'pushed') return;
        if (event.branch === 'main') return { stage: 'dev' };
        if (event.branch === 'production') return { stage: 'production' };
      },
      /**
       * Install, run the tests, then deploy. A failing test stops the deploy.
       * SST_STAGE is set by the runner, so `sst deploy` needs no --stage.
       * The E2E suite is left out: it needs a browser the runner does not have. Run it before pushing.
       */
      async workflow({ $ }) {
        await $`npm ci`;
        await $`npm test`;
        await $`npx sst deploy`;
      },
    },
  },
  async run() {
    // Register these BEFORE any component is created, or they silently do nothing.
    // $transform reaches every Function, including the ones SST creates for API routes and Cognito triggers.
    const { logRetention } = await import('./infra/policy');
    const retention = logRetention($app.stage);
    $transform(sst.aws.Function, (args) => {
      if (args.logging === undefined) args.logging = { retention }; // respect an explicit setting on a function
    });
    $transform(sst.aws.ApiGatewayV2, (args) => {
      // args is undefined if a gateway is created with no options. SST's default of 1 month applies then.
      if (args && args.accessLog === undefined) args.accessLog = { retention };
    });

    const { table, images, cdn } = await import('./infra/storage');
    const { userPool, userPoolClient } = await import('./infra/auth');
    const { graphql, rest } = await import('./infra/api');
    const { identityPool } = await import('./infra/identity');

    return {
      region: 'us-east-1',
      tableName: table.name,
      imagesBucket: images.name,
      cdnUrl: $interpolate`https://${cdn.domainName}`,
      userPoolId: userPool.id,
      userPoolClientId: userPoolClient.id,
      identityPoolId: identityPool.id,
      graphqlUrl: graphql.uris.apply((u) => u['GRAPHQL']),
      restUrl: rest.url,
    };
  },
});
