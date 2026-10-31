/** GraphQL documents. Field names match backend/graphql/schema.graphql. */

const LISTING = `id deal type title address city country price beds baths areaM2 plotM2 yearBuilt
  isNew openHouse description features images lat lng agentId agentName agency phone createdAt updatedAt`;

const POOL = `id name listingId listingPrice goal raised maxMembers memberCount targetMonths status
  creatorId createdAt viewerIsMember
  members { userId name monthly contributed sharePct joinedAt }
  ledger { id userId amount note reference createdAt reversedAt reversalOf }
  proposals { id title detail createdBy createdAt yes no needed status myVote }`;

const APPLICATION = `userId email name agency phone registrationNo country website about status reviewNote createdAt updatedAt reviewedAt`;

export const Q = {
  searchListings: `query Search($input: SearchListingsInput!) {
    searchListings(input: $input) { success error data { nextToken items { ${LISTING} } } } }`,
  getListing: `query Get($id: ID!) { getListing(id: $id) { success error data { ${LISTING} } } }`,
  myFavorites: `query Favs { myFavorites { success error data { id } } }`,
  toggleFavorite: `mutation Fav($listingId: ID!) { toggleFavorite(listingId: $listingId) { success error data } }`,
  sendInquiry: `mutation Inq($input: InquiryInput!) { sendInquiry(input: $input) { success error data { id } } }`,

  myListings: `query Mine { myListings { success error data { ${LISTING} } } }`,
  createListing: `mutation Create($input: ListingInput!) { createListing(input: $input) { success error data { id } } }`,
  updateListing: `mutation Update($id: ID!, $input: ListingInput!) { updateListing(id: $id, input: $input) { success error data { id } } }`,
  deleteListing: `mutation Del($id: ID!) { deleteListing(id: $id) { success error data } }`,
  listingInquiries: `query Inq($listingId: ID!) { listingInquiries(listingId: $listingId) {
    success error data { id listingId name email message createdAt } } }`,

  myAgentApplication: `query MyApp { myAgentApplication { success error data { ${APPLICATION} } } }`,
  submitAgentApplication: `mutation Apply($input: AgentApplicationInput!) { submitAgentApplication(input: $input) { success error data { ${APPLICATION} } } }`,
  agentApplications: `query Apps($status: ApplicationStatus!) { agentApplications(status: $status) { success error data { ${APPLICATION} } } }`,
  reviewAgentApplication: `mutation Review($userId: ID!, $decision: ApplicationDecision!, $note: String) {
    reviewAgentApplication(userId: $userId, decision: $decision, note: $note) { success error data { ${APPLICATION} } } }`,
  geocodeAddress: `query Geo($query: String!) { geocodeAddress(query: $query) { success error data { label lat lng city country } } }`,

  listPools: `query Pools($listingId: ID) { listPools(listingId: $listingId, limit: 50) {
    success error data { items { ${POOL} } } } }`,
  myPools: `query Mine { myPools { success error data { ${POOL} } } }`,
  getPool: `query Pool($id: ID!) { getPool(id: $id) { success error data { ${POOL} } } }`,
  createPool: `mutation Create($input: CreatePoolInput!) { createPool(input: $input) { success error data { id } } }`,
  createPoolProposal: `mutation Prop($poolId: ID!, $input: PoolProposalInput!) { createPoolProposal(poolId: $poolId, input: $input) { success error data } }`,
  recordPoolContribution: `mutation Pay($poolId: ID!, $userId: ID!, $amount: Float!, $reference: String!, $note: String) {
    recordPoolContribution(poolId: $poolId, userId: $userId, amount: $amount, reference: $reference, note: $note) { success error data } }`,
  reversePoolContribution: `mutation Rev($poolId: ID!, $entryId: ID!, $reason: String!) {
    reversePoolContribution(poolId: $poolId, entryId: $entryId, reason: $reason) { success error data } }`,
  joinPool: `mutation Join($poolId: ID!, $monthly: Float!) { joinPool(poolId: $poolId, monthly: $monthly) { success error data } }`,
  leavePool: `mutation Leave($poolId: ID!) { leavePool(poolId: $poolId) { success error data } }`,
  votePoolProposal: `mutation Vote($poolId: ID!, $proposalId: ID!, $choice: String!) {
    votePoolProposal(poolId: $poolId, proposalId: $proposalId, choice: $choice) { success error data } }`,
};
