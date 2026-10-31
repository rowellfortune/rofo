import type { AgentApplication } from '../types';
import { Q } from './queries';
import { transport } from './transport';

/** What the applicant fills in. */
export interface ApplicationInput {
  name: string; agency: string; phone: string; registrationNo: string; country: string; website: string | null; about: string;
}

/** The signed-in user's application, or null if they never applied. */
export const apiMyApplication = () =>
  transport.call<AgentApplication | null>('myAgentApplication', Q.myAgentApplication, {}, 'userPool');

/** Apply, or apply again after a rejection. */
export const apiSubmitApplication = (input: ApplicationInput) =>
  transport.call<AgentApplication>('submitAgentApplication', Q.submitAgentApplication, { input }, 'userPool');

/** Admin: applications with one status, newest first. */
export async function apiListApplications(status: AgentApplication['status']): Promise<AgentApplication[]> {
  return (await transport.call<AgentApplication[] | null>('agentApplications', Q.agentApplications, { status }, 'userPool')) ?? [];
}

/** Admin: approve or reject. Rejection needs a note. Approval grants the Agent group. */
export const apiReviewApplication = (userId: string, decision: 'APPROVED' | 'REJECTED', note?: string) =>
  transport.call<AgentApplication>('reviewAgentApplication', Q.reviewAgentApplication, { userId, decision, note: note ?? null }, 'userPool');
