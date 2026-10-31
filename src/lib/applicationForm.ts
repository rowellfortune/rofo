import type { ApplicationInput } from '../api/applications';
import type { AgentApplication } from '../types';

export interface ApplicationForm {
  name: string; agency: string; phone: string; registrationNo: string; country: string; website: string; about: string;
}
export type ApplicationErrors = Partial<Record<keyof ApplicationForm, string>>;

export const emptyApplication = (name = ''): ApplicationForm => ({
  name, agency: '', phone: '', registrationNo: '', country: '', website: '', about: '',
});

/** Prefill from an earlier application (after a rejection the user edits and resubmits). */
export const applicationToForm = (a: AgentApplication): ApplicationForm => ({
  name: a.name, agency: a.agency, phone: a.phone, registrationNo: a.registrationNo, country: a.country,
  website: a.website ?? '', about: a.about,
});

/** Same rules as the server (backend/lib/applications.ts) so people see problems before sending. */
export function buildApplication(f: ApplicationForm): { ok: true; input: ApplicationInput } | { ok: false; errors: ApplicationErrors } {
  const errors: ApplicationErrors = {};
  const min = (k: keyof ApplicationForm, n: number, label: string) => {
    if (f[k].trim().length < n) errors[k] = `${label} needs at least ${n} characters`;
  };
  min('name', 2, 'Name'); min('agency', 2, 'Agency'); min('phone', 5, 'Phone');
  min('registrationNo', 3, 'Registration number'); min('country', 2, 'Country'); min('about', 20, 'This');
  if (f.about.trim().length > 1500) errors.about = 'Keep it under 1500 characters';
  const site = f.website.trim();
  if (site && !/^https?:\/\/[^\s]+\.[^\s]+$/i.test(site)) errors.website = 'Start with http:// or https://';
  if (Object.keys(errors).length) return { ok: false, errors };
  return {
    ok: true,
    input: {
      name: f.name.trim(), agency: f.agency.trim(), phone: f.phone.trim(), registrationNo: f.registrationNo.trim(),
      country: f.country.trim(), website: site || null, about: f.about.trim(),
    },
  };
}
