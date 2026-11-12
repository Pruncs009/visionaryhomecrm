import type { Contact, LeadStatus, LeadIntent } from '@/types/database.types';
import type { ActivityType } from './constants';

export type ContactListRow = Pick<
  Contact,
  'id' | 'full_name' | 'email' | 'phone' | 'company' | 'city' | 'state' | 'tags' | 'do_not_contact' | 'created_at'
>;

export type ContactListResult = {
  rows: ContactListRow[];
  total: number;
  page: number;
  pageCount: number;
};

export type NoteItem = {
  id: string;
  body: string;
  isPinned: boolean;
  createdAt: string;
  authorId: string | null;
  authorName: string | null;
};

export type ActivityItem = {
  id: string;
  type: ActivityType;
  summary: string;
  occurredAt: string;
  actorId: string | null;
  actorName: string | null;
};

export type ContactLeadItem = {
  id: string;
  status: LeadStatus;
  intent: LeadIntent;
  source: string | null;
  created_at: string;
};

export type TagCount = { tag: string; contacts: number };

export type ImportResult = {
  inserted: number;
  updated: number;
  skipped: number;
  errors: Array<{ line: number; message: string }>;
};
