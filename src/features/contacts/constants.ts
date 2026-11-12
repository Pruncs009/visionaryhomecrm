export const CONTACTS_PAGE_SIZE = 25;
export const IMPORT_BATCH_SIZE = 500;
export const IMPORT_MAX_ROWS = 10_000;
export const IMPORT_MAX_FILE_BYTES = 5 * 1024 * 1024;

export const ACTIVITY_TYPES = [
  'contact_created', 'contact_imported', 'contact_updated', 'tag_added', 'tag_removed', 'note_added',
  'lead_created', 'lead_status_changed', 'lead_assigned', 'task_created', 'task_completed',
  'appointment_scheduled', 'call', 'email', 'text', 'meeting',
] as const;
export type ActivityType = (typeof ACTIVITY_TYPES)[number];

export const MANUAL_ACTIVITY_TYPES = ['call', 'email', 'text', 'meeting'] as const;
export type ManualActivityType = (typeof MANUAL_ACTIVITY_TYPES)[number];

export const MANUAL_ACTIVITY_LABEL: Record<ManualActivityType, string> = {
  call: 'Call',
  email: 'Email',
  text: 'Text message',
  meeting: 'Meeting',
};

export const CONTACT_METHOD_VALUES = ['email', 'phone', 'text'] as const;
export const CONTACT_METHOD_LABEL: Record<(typeof CONTACT_METHOD_VALUES)[number], string> = {
  email: 'Email',
  phone: 'Phone call',
  text: 'Text message',
};

/** Normalize a tag: trimmed, single-spaced, lowercase, ≤ 50 chars. */
export function normalizeTag(raw: string) {
  return raw.trim().replace(/\s+/g, ' ').toLowerCase().slice(0, 50);
}

/** CSV import: target fields and the header names we auto-map to them. */
export const IMPORT_FIELDS = [
  { key: 'first_name', label: 'First name', aliases: ['first name', 'firstname', 'first', 'given name', 'fname'] },
  { key: 'last_name', label: 'Last name', aliases: ['last name', 'lastname', 'last', 'surname', 'family name', 'lname'] },
  { key: 'full_name', label: 'Full name (split)', aliases: ['name', 'full name', 'fullname', 'contact name', 'contact'] },
  { key: 'email', label: 'Email', aliases: ['email', 'e-mail', 'email address', 'mail', 'primary email'] },
  { key: 'phone', label: 'Phone', aliases: ['phone', 'phone number', 'mobile', 'cell', 'mobile phone', 'telephone', 'tel'] },
  { key: 'company', label: 'Company', aliases: ['company', 'organization', 'organisation', 'business', 'brokerage'] },
  { key: 'address_line1', label: 'Street address', aliases: ['address', 'street', 'street address', 'address 1', 'address line 1'] },
  { key: 'city', label: 'City', aliases: ['city', 'town'] },
  { key: 'state', label: 'State', aliases: ['state', 'province', 'region', 'st'] },
  { key: 'postal_code', label: 'ZIP / postal code', aliases: ['zip', 'zip code', 'zipcode', 'postal code', 'postcode'] },
  { key: 'source', label: 'Source', aliases: ['source', 'lead source', 'origin'] },
  { key: 'tags', label: 'Tags', aliases: ['tags', 'tag', 'labels', 'groups', 'categories'] },
] as const;

export type ImportFieldKey = (typeof IMPORT_FIELDS)[number]['key'];
