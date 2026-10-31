import type { AppSyncResolverEvent } from 'aws-lambda';
import { AppError } from '../utils/AppError';
import { GraphqlUtil, getCaller, requireGroup } from '../utils/GraphqlUtil';
import * as L from '../lib/listings';
import * as Q from '../lib/inquiries';

const AGENT_GROUPS = ['Agent', 'Admin'];

/** Route one AppSync field to its function. Each branch re-checks groups (defence in depth). */
async function route(event: AppSyncResolverEvent<any>) {
  const { fieldName } = event.info;
  const args = event.arguments;

  switch (fieldName) {
    // Public (guest or signed in)
    case 'getListing': {
      const { pk, sk, gsi1pk, gsi1sk, gsi2pk, gsi2sk, gsi3pk, gsi3sk, entity, ...rest } = await L.loadListing(args.id);
      void [pk, sk, gsi1pk, gsi1sk, gsi2pk, gsi2sk, gsi3pk, gsi3sk, entity];
      return rest;
    }
    case 'searchListings':
      return L.searchListings(args.input);

    // Agent or Admin
    case 'createListing': {
      const c = getCaller(event); requireGroup(c, AGENT_GROUPS);
      return L.createListing(c, args.input);
    }
    case 'updateListing': {
      const c = getCaller(event); requireGroup(c, AGENT_GROUPS);
      return L.updateListing(c, args.id, args.input);
    }
    case 'deleteListing': {
      const c = getCaller(event); requireGroup(c, AGENT_GROUPS);
      return L.deleteListing(c, args.id);
    }
    case 'myListings': {
      const c = getCaller(event); requireGroup(c, AGENT_GROUPS);
      return L.myListings(c);
    }
    case 'listingInquiries': {
      const c = getCaller(event); requireGroup(c, AGENT_GROUPS);
      return Q.listingInquiries(c, args.listingId);
    }

    // Any signed-in user
    case 'myFavorites':
      return L.myFavorites(getCaller(event));
    case 'toggleFavorite':
      return L.toggleFavorite(getCaller(event), args.listingId);
    case 'sendInquiry':
      return Q.sendInquiry(getCaller(event), args.input);

    default:
      throw new AppError(`Unknown field ${event.info.parentTypeName}.${fieldName}`, 400);
  }
}

/** Single entry point for every AppSync resolver. */
export const handler = GraphqlUtil.graphqlHandler(route);
