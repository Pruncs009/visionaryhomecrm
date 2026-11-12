// People on a deal (public.deal_parties). Shared by server and client code.

export const CLIENT_ROLES = [
  'seller', 'seller_2', 'seller_3', 'seller_4', 'seller_5',
  'buyer', 'buyer_2', 'buyer_3', 'buyer_4', 'buyer_5',
] as const;
export const COLLABORATOR_ROLES = ['seller_agent', 'buyer_agent', 'title_company'] as const;
/** Collaborator roles a deal can have only one of. */
export const SINGLE_COLLABORATOR_ROLES = ['title_company'] as const;
export const PARTY_ROLES = [...CLIENT_ROLES, ...COLLABORATOR_ROLES] as const;

export type ClientRole = (typeof CLIENT_ROLES)[number];
export type CollaboratorRole = (typeof COLLABORATOR_ROLES)[number];
export type PartyRole = (typeof PARTY_ROLES)[number];

export const PARTY_ROLE_LABEL: Record<PartyRole, string> = {
  seller: 'Seller', seller_2: 'Seller 2', seller_3: 'Seller 3', seller_4: 'Seller 4', seller_5: 'Seller 5',
  buyer: 'Buyer', buyer_2: 'Buyer 2', buyer_3: 'Buyer 3', buyer_4: 'Buyer 4', buyer_5: 'Buyer 5',
  seller_agent: 'Seller agent', buyer_agent: 'Buyer agent', title_company: 'Title company',
};

/** Display order in the People panel: buyers, then sellers, then agents. */
export const PARTY_ROLE_ORDER: PartyRole[] = [
  'buyer', 'buyer_2', 'buyer_3', 'buyer_4', 'buyer_5',
  'seller', 'seller_2', 'seller_3', 'seller_4', 'seller_5',
  'buyer_agent', 'seller_agent', 'title_company',
];

export const isClientRole = (r: string): r is ClientRole => (CLIENT_ROLES as readonly string[]).includes(r);
/** Roles that hold one person per deal: every client slot, plus the title company. */
export const isSingleSlotRole = (r: string): boolean =>
  isClientRole(r) || (SINGLE_COLLABORATOR_ROLES as readonly string[]).includes(r);

export type DealParty = {
  id: string;
  role: PartyRole;
  contactId: string;
  name: string;
  email: string | null;
  phone: string | null;
  company: string | null;
  address: string | null;
};

/** A saved contact offered when adding someone, so people can be reused across deals. */
export type PersonOption = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  company: string | null;
  addressLine1: string | null;
  city: string | null;
  state: string | null;
  postalCode: string | null;
};

export const formatAddress = (p: { addressLine1: string | null; city: string | null; state: string | null; postalCode: string | null }) =>
  [p.addressLine1, p.city, [p.state, p.postalCode].filter(Boolean).join(' ')].filter(Boolean).join(', ') || null;
