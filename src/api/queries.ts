/** GraphQL documents. Field names match backend/graphql/schema.graphql. */

const LISTING = `id deal type title address city country price beds baths areaM2 plotM2 yearBuilt
  isNew openHouse description features images lat lng agentId agentName agency phone createdAt updatedAt`;

const POOL = `id name listingId listingPrice goal raised maxMembers memberCount targetMonths status
  creatorId createdAt viewerIsMember
  members { userId name monthly contributed sharePct joinedAt }
  ledger { id userId amount note createdAt }
  proposals { id title detail createdBy createdAt yes no needed status myVote }`;

export const Q = {
  searchListings: `query Search($input: SearchListingsInput!) {
    searchListings(input: $input) { success error data { nextToken items { ${LISTING} } } } }`,
  getListing: `query Get($id: ID!) { getListing(id: $id) { success error data { ${LISTING} } } }`,
  myFavorites: `query Favs { myFavorites { success error data { id } } }`,
  toggleFavorite: `mutation Fav($listingId: ID!) { toggleFavorite(listingId: $listingId) { success error data } }`,
  sendInquiry: `mutation Inq($input: InquiryInput!) { sendInquiry(input: $input) { success error data { id } } }`,

  listPools: `query Pools($listingId: ID) { listPools(listingId: $listingId, limit: 50) {
    success error data { items { ${POOL} } } } }`,
  myPools: `query Mine { myPools { success error data { ${POOL} } } }`,
  getPool: `query Pool($id: ID!) { getPool(id: $id) { success error data { ${POOL} } } }`,
  createPool: `mutation Create($input: CreatePoolInput!) { createPool(input: $input) { success error data { id } } }`,
  joinPool: `mutation Join($poolId: ID!, $monthly: Float!) { joinPool(poolId: $poolId, monthly: $monthly) { success error data } }`,
  leavePool: `mutation Leave($poolId: ID!) { leavePool(poolId: $poolId) { success error data } }`,
  votePoolProposal: `mutation Vote($poolId: ID!, $proposalId: ID!, $choice: String!) {
    votePoolProposal(poolId: $poolId, proposalId: $proposalId, choice: $choice) { success error data } }`,
};
