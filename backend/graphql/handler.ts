import type { AppSyncResolverEvent } from 'aws-lambda';
import { AppError } from '../utils/AppError';
import { GraphqlUtil, getCaller, requireGroup, type Caller } from '../utils/GraphqlUtil';
import { enforceAdminMfa } from '../lib/mfaDeps';
import * as L from '../lib/listings';
import * as Q from '../lib/inquiries';
import * as P from '../lib/pools';
import { geocode } from '../lib/geocode';
import * as A from '../lib/applications';
import {
  AdminAddUserToGroupCommand, AdminRemoveUserFromGroupCommand, AdminUserGlobalSignOutCommand, CognitoIdentityProviderClient,
} from '@aws-sdk/client-cognito-identity-provider';
import { Resource } from 'sst';

const AGENT_GROUPS = ['Agent', 'Admin'];

const cognito = new CognitoIdentityProviderClient({});

/** Real dependencies for application review: the Cognito group change and the clock. */
const appDeps: A.ApplicationDeps = {
  now: () => new Date(),
  addToAgentGroup: async (userId) => {
    // The user pool uses email as the username, but AdminAddUserToGroup accepts the sub too.
    await cognito.send(new AdminAddUserToGroupCommand({ UserPoolId: process.env.USER_POOL_ID!, Username: userId, GroupName: 'Agent' }));
  },
  removeFromAgentGroup: async (userId) => {
    await cognito.send(new AdminRemoveUserFromGroupCommand({ UserPoolId: process.env.USER_POOL_ID!, Username: userId, GroupName: 'Agent' }));
    // End their sessions so no refresh token can mint a new token. The block marker covers the tokens already issued.
    await cognito.send(new AdminUserGlobalSignOutCommand({ UserPoolId: process.env.USER_POOL_ID!, Username: userId }))
      .catch((e: Error) => console.error('Global sign out failed. The block marker still applies.', userId, e.message));
  },
  hideListings: (userId) => L.setListingsSuspended(userId, true),
  restoreListings: (userId) => L.setListingsSuspended(userId, false),
};

/** MapTiler key from the SST secret. Empty string means use the keyless Nominatim provider. */
const mapTilerKey = (): string => {
  try { return Resource.MapTilerKey.value; } catch { return ''; }
};

/**
 * The caller for this request. An admin without two step verification comes back as an ordinary user,
 * so none of the admin checks further down can pass for them. Always use this, never getCaller directly.
 */
const who = (event: AppSyncResolverEvent<any>): Promise<Caller> => enforceAdminMfa(getCaller(event));

/** Route one AppSync field to its function. Each branch re-checks groups (defence in depth). */
async function route(event: AppSyncResolverEvent<any>) {
  const { fieldName } = event.info;
  const args = event.arguments;

  switch (fieldName) {
    // Public (guest or signed in)
    case 'getListing': {
      const found = await L.loadListing(args.id);
      if (found.suspended) throw new AppError('Listing not found', 404); // hidden listings look like they do not exist
      const { pk, sk, gsi1pk, gsi1sk, gsi2pk, gsi2sk, gsi3pk, gsi3sk, entity, suspendedReason, ...rest } = found;
      void [pk, sk, gsi1pk, gsi1sk, gsi2pk, gsi2sk, gsi3pk, gsi3sk, entity, suspendedReason];
      return rest;
    }
    case 'searchListings':
      return L.searchListings(args.input);

    // Agent or Admin
    case 'createListing': {
      const c = await who(event); requireGroup(c, AGENT_GROUPS); await A.assertActiveAgent(c);
      return L.createListing(c, args.input);
    }
    case 'updateListing': {
      const c = await who(event); requireGroup(c, AGENT_GROUPS); await A.assertActiveAgent(c);
      return L.updateListing(c, args.id, args.input);
    }
    case 'deleteListing': {
      const c = await who(event); requireGroup(c, AGENT_GROUPS); await A.assertActiveAgent(c);
      return L.deleteListing(c, args.id);
    }
    case 'myListings': {
      const c = await who(event); requireGroup(c, AGENT_GROUPS); await A.assertActiveAgent(c);
      return L.myListings(c);
    }
    case 'listingInquiries': {
      const c = await who(event); requireGroup(c, AGENT_GROUPS); await A.assertActiveAgent(c);
      return Q.listingInquiries(c, args.listingId);
    }

    // Any signed-in user
    case 'myFavorites':
      return L.myFavorites(await who(event));
    case 'toggleFavorite':
      return L.toggleFavorite(await who(event), args.listingId);
    case 'sendInquiry':
      return Q.sendInquiry(await who(event), args.input);

    // Self-serve agent applications. Any signed-in user applies, only Admin reviews.
    case 'myAgentApplication':
      return A.myApplication(await who(event));
    case 'submitAgentApplication':
      return A.submitApplication(await who(event), args.input, appDeps);
    case 'agentApplications': {
      const c = await who(event); requireGroup(c, ['Admin']);
      return A.listApplications(c, args.status);
    }
    case 'revokeAgentAccess': {
      const c = await who(event); requireGroup(c, ['Admin']);
      return A.revokeAgent(c, args.userId, args.reason, args.hideListings ?? true, appDeps);
    }
    case 'reviewAgentApplication': {
      const c = await who(event); requireGroup(c, ['Admin']);
      return A.reviewApplication(c, args.userId, args.decision, args.note, appDeps);
    }

    // Address search for the listing editor (agents only). The key stays on the server.
    case 'geocodeAddress': {
      const c = await who(event); requireGroup(c, AGENT_GROUPS); await A.assertActiveAgent(c);
      return geocode(args.query, {
        fetch,
        apiKey: mapTilerKey(),
        userAgent: process.env.GEOCODE_USER_AGENT ?? 'rofo-estate/1.0',
        now: Date.now,
      });
    }

    // Pools (any signed-in user; the lib checks membership and Admin)
    case 'listPools':
      await who(event);
      return P.listPools(args);
    case 'getPool':
      return P.getPool(await who(event), args.id);
    case 'myPools':
      return P.myPools(await who(event));
    case 'createPool':
      return P.createPool(await who(event), args.input);
    case 'joinPool':
      return P.joinPool(await who(event), args.poolId, args.monthly);
    case 'leavePool':
      return P.leavePool(await who(event), args.poolId);
    case 'createPoolProposal':
      return P.createProposal(await who(event), args.poolId, args.input);
    case 'votePoolProposal':
      return P.voteProposal(await who(event), args.poolId, args.proposalId, args.choice);
    case 'recordPoolContribution': {
      const c = await who(event); requireGroup(c, ['Admin']);
      return P.recordContribution(c, args.poolId, args.userId, args.amount, args.reference, args.note);
    }
    case 'reversePoolContribution': {
      const c = await who(event); requireGroup(c, ['Admin']);
      return P.reverseContribution(c, args.poolId, args.entryId, args.reason);
    }

    default:
      throw new AppError(`Unknown field ${event.info.parentTypeName}.${fieldName}`, 400);
  }
}

/** Single entry point for every AppSync resolver. */
export const handler = GraphqlUtil.graphqlHandler(route);
