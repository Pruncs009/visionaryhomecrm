import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, ExternalLink, Trash2, CalendarCheck, CircleCheck, FileText, KeyRound, Pencil, Plus, StickyNote, Flag, Sparkles } from 'lucide-react';
import { NavHighlight } from '@/components/layout/nav-highlight';
import { buttonVariants } from '@/components/ui/button';
import { requireContext } from '@/features/auth/guards';
import { getTeamMembers } from '@/features/leads/queries';
import { isSplitDeal, keyDatesFor, TX_SIDE } from '@/features/transactions/constants';
import { DocumentsPanel } from '@/features/transactions/components/documents-panel';
import { DealNotes } from '@/features/transactions/components/deal-notes';
import { EditDatesButton } from '@/features/transactions/components/deal-dates-dialog';
import { DealPeople, type PersonEntry } from '@/features/transactions/components/deal-people';
import { AddPersonMenu, EMPTY_DETAILS, type TeamNames } from '@/features/transactions/components/deal-people-actions';
import { isClientRole, isSingleSlotRole, PARTY_ROLE_LABEL, TEAM_ROLE_LABEL, TEAM_ROLES, type DealParty, type PartyRole } from '@/features/transactions/parties';
import { DealTasks } from '@/features/transactions/components/deal-tasks';
import { DealSetupReminder } from '@/features/transactions/components/deal-setup-dialog';
import { daysUntil, formatDateOnly, relativeDays } from '@/features/transactions/components/tx-bits';
import { DealStageSelect } from '@/features/deals/components/deal-stage';
import { DEAL_STAGE, stageHref } from '@/features/deals/constants';
import { CHANNELS, ChoiceField, DealHeaderField, DEAL_TYPE_SUGGESTIONS, EmdInSelect, EscrowTypeField, OCCUPANCY_OPTIONS, OWNERSHIP_TYPES } from '@/features/deals/components/deal-header-field';
import { DeleteTransactionButton } from '@/features/transactions/components/tx-controls';
import { getDealParties, getDealWorkspace, getPersonOptions, getTeamNameOptions, getTransaction, getTransactionFiles } from '@/features/transactions/queries';
import { uuidSchema } from '@/features/transactions/schemas';
import type { DealWorkspace, TransactionFile, TransactionRow } from '@/features/transactions/types';
import { isValidTimeZone } from '@/lib/dates';
import { cn, formatCurrency } from '@/lib/utils';

export const metadata: Metadata = { title: 'Deal' };

const TABS = [
  { key: 'timeline', label: 'Timeline' },
  { key: 'tasks', label: 'Tasks' },
  { key: 'notes', label: 'Notes' },
  { key: 'details', label: 'Details' },
  { key: 'docs', label: 'Docs' },
  { key: 'financials', label: 'Financials' },
] as const;
type TabKey = (typeof TABS)[number]['key'];

const SIDE_BADGE: Record<TransactionRow['side'], string> = { buyer: 'Buyer', seller: 'Seller', dual: 'Dual' };

type PageProps = { params: Promise<{ id: string }>; searchParams: Promise<{ tab?: string; setup?: string }> };

export default async function TransactionDetailPage({ params, searchParams }: PageProps) {
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  if (!uuidSchema.safeParse(id).success) notFound();
  const tab: TabKey = TABS.some((t) => t.key === sp.tab) ? (sp.tab as TabKey) : 'tasks';

  const ctx = await requireContext();
  const org = ctx.organization.id;
  const tx = await getTransaction(org, id);
  if (!tx) notFound();

  const timezone = isValidTimeZone(ctx.profile?.timezone) ? ctx.profile!.timezone : 'America/New_York';
  const [files, members, ws, parties, personOptions, teamOptions] = await Promise.all([
    getTransactionFiles(org, id),
    getTeamMembers(org),
    getDealWorkspace(org, tx, timezone),
    getDealParties(org, id),
    getPersonOptions(org),
    getTeamNameOptions(org),
  ]);

  // People panel: Clients (buyers, sellers), Collaborators (agents, title company)
  // and Team members (TC, acquisition manager, lead manager). The primary buyer /
  // seller can come from the deal form (transactions.buyer_name / seller_name)
  // or from the panel (deal_parties).
  const partyEntry = (p: DealParty): PersonEntry => ({
    key: p.id, role: PARTY_ROLE_LABEL[p.role], name: p.name, href: `/contacts/${p.contactId}`,
    email: p.email, phone: p.phone, company: p.company, address: p.address,
    edit: {
      kind: 'party', partyId: p.id, role: p.role,
      details: {
        fullName: p.name, phone: p.phone ?? '', email: p.email ?? '', company: p.company ?? '',
        addressLine1: p.addressLine1 ?? '', city: p.city ?? '', state: p.state ?? '', postalCode: p.postalCode ?? '',
      },
    },
    remove: { kind: 'party', partyId: p.id },
  });
  const formParty = (role: 'buyer' | 'seller'): PersonEntry[] => {
    const name = role === 'buyer' ? tx.buyer_name : tx.seller_name;
    const contactId = role === 'buyer' ? tx.buyer_contact_id : tx.seller_contact_id;
    if (!name || parties.some((p) => p.role === role)) return [];
    const known = contactId ? ws.contacts[contactId] : undefined;
    return [{
      key: `form-${role}`, role: PARTY_ROLE_LABEL[role], name, href: contactId ? `/contacts/${contactId}` : undefined, ...known,
      edit: { kind: 'primary', role, details: { ...EMPTY_DETAILS, fullName: name, phone: known?.phone ?? '', email: known?.email ?? '' } },
    }];
  };
  const managers = { lead: tx.lead_manager, acquisition: tx.acquisition_manager };
  const splitDeal = isSplitDeal(tx);
  const setupTasks = ws.tasks.filter((t) => t.kind === 'deal_setup');

  const team: TeamNames = {
    transaction_coordinator: tx.transaction_coordinator,
    acquisition_manager: tx.acquisition_manager,
    lead_manager: tx.lead_manager,
  };
  const teamPeople: PersonEntry[] = TEAM_ROLES.filter((r) => team[r]).map((r) => ({
    key: `team-${r}`, role: TEAM_ROLE_LABEL[r], name: team[r]!,
    edit: { kind: 'team', role: r, name: team[r]! },
    remove: { kind: 'team', role: r },
  }));
  const clientParties = parties.filter((p) => isClientRole(p.role));
  const clients: PersonEntry[] = [
    ...formParty('buyer'),
    ...clientParties.filter((p) => p.role.startsWith('buyer')).map(partyEntry),
    ...formParty('seller'),
    ...clientParties.filter((p) => p.role.startsWith('seller')).map(partyEntry),
  ];
  const takenRoles: PartyRole[] = [
    ...parties.filter((p) => isSingleSlotRole(p.role)).map((p) => p.role),
    ...(tx.buyer_name ? (['buyer'] as const) : []),
    ...(tx.seller_name ? (['seller'] as const) : []),
  ];
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: timezone }).format(new Date());
  const canDelete = ctx.role !== 'assistant';
  const editHref = `/transactions/${tx.id}/edit`;
  const prop = ws.property;
  const openTasks = ws.tasks.filter((t) => !t.done).length;


  return (
    <div className="mx-auto max-w-[1500px] space-y-4">
      <NavHighlight href={stageHref(tx.deal_stage)} />
      {/* Setup reminder: right after a new deal is created (?setup=1) and while setup tasks are overdue.
          It only reminds; the tasks are completed on the Tasks tab. */}
      <DealSetupReminder
        txId={tx.id}
        openCount={setupTasks.filter((t) => !t.done).length}
        overdueCount={setupTasks.filter((t) => !t.done && t.dueDate !== null && t.dueDate < today).length}
        managers={managers}
        justCreated={sp.setup === '1'}
      />
      {/* Back to the stage on the left, deal actions on the right */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Link href={stageHref(tx.deal_stage)} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-4" aria-hidden /> {DEAL_STAGE[tx.deal_stage].label}
        </Link>
        <div className="flex items-center gap-2">
          <Link href={editHref} className={buttonVariants({ variant: 'outline', size: 'sm' })}><Pencil /> Edit deal</Link>
          {canDelete && <DeleteTransactionButton id={tx.id} name={tx.name} />}
        </div>
      </div>

      {/* ---- Header ------------------------------------------------------------ */}
      <header className="flex flex-col gap-5 rounded-xl border bg-card p-5 xl:flex-row xl:items-start">
        <div className="flex min-w-0 flex-1 gap-4">
          <div className="hidden size-24 shrink-0 items-center justify-center rounded-lg bg-muted sm:flex" aria-hidden>
            <KeyRound className="size-10 text-muted-foreground" />
          </div>
          <div className="min-w-0 space-y-1">
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span className="rounded border border-primary/40 bg-primary/10 px-1.5 py-0.5 font-semibold tracking-wide text-primary uppercase">{SIDE_BADGE[tx.side]}</span>
              <span className="text-muted-foreground">{TX_SIDE[tx.side]}{prop?.propertyType ? ` ·${label(prop.propertyType)}` : ''}</span>
            </div>
            {/* Full address on one line */}
            <h1 className="text-2xl font-semibold tracking-tight break-words">
              {[tx.property_address || tx.name, tx.property_city, [tx.property_state, prop?.postalCode].filter(Boolean).join(' ')].filter(Boolean).join(', ')}
            </h1>
            {(prop?.mlsNumber || tx.name !== tx.property_address) && (
              <p className="text-sm text-muted-foreground">
                {prop?.mlsNumber && <>MLS# {prop.mlsNumber}</>}
                {prop?.mlsNumber && tx.name !== tx.property_address && <span aria-hidden> | </span>}
                {tx.name !== tx.property_address && <>Deal: {tx.name}</>}
              </p>
            )}
            {/* Property details: small, free text, wraps so nothing is cut off */}
            <div className="grid max-w-3xl grid-cols-[repeat(auto-fill,minmax(min(10.5rem,calc(50%-0.375rem)),1fr))] gap-x-3 gap-y-1.5 pt-1">
              {PROPERTY_DETAILS.map(([f, fallback]) => {
                const v = tx[f] ?? fallback(prop);
                return (
                  <DealHeaderField
                    key={`${f}-${v ?? ''}`}
                    id={tx.id}
                    field={f}
                    value={v}
                    placeholder="—"
                    multiline
                    fitLabel
                    className="space-y-0.5"
                    labelClassName="h-4 leading-4 text-muted-foreground"
                    inputClassName="min-h-7 px-2 py-1 text-xs md:text-xs"
                  />
                );
              })}
            </div>
            <div className="grid max-w-2xl gap-3 pt-2 sm:grid-cols-3">
              <ChoiceField key={`oc-${tx.occupancy ?? ''}`} id={tx.id} field="occupancy" value={tx.occupancy} options={OCCUPANCY_OPTIONS} othersPlaceholder="Enter occupancy" />
              <ChoiceField key={`ow-${tx.ownership_type ?? ''}`} id={tx.id} field="ownership_type" value={tx.ownership_type} options={OWNERSHIP_TYPES} allowOthers={false} />
              <DealHeaderField key={`et-${tx.ethnicity ?? ''}`} id={tx.id} field="ethnicity" value={tx.ethnicity} placeholder="Enter ethnicity" multiline />
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-x-8 gap-y-3 text-sm sm:grid-cols-2 xl:w-[30rem] xl:shrink-0">
          <div className="space-y-3">
            <DealHeaderField key={`pp-${tx.purchase_price ?? ''}`} id={tx.id} field="purchase_price" value={tx.purchase_price} label={splitDeal ? 'A-B Purchase price' : undefined} inputClassName="h-9 text-lg font-semibold md:text-lg" />
            {/* EMD amount (transactions.earnest_money) with "IN" = is the deposit in? */}
            <div className="grid grid-cols-[minmax(0,1fr)_5.5rem] gap-3">
              <DealHeaderField key={`emd-${tx.earnest_money ?? ''}`} id={tx.id} field="earnest_money" value={tx.earnest_money} label={splitDeal ? 'A-B EMD' : undefined} />
              <EmdInSelect key={`emd-in-${tx.emd_in}`} id={tx.id} value={tx.emd_in} />
            </div>
            {/* B-C leg on A-C deals: same layout as A-B (big price, then EMD + IN) */}
            {splitDeal && (
              <>
                <DealHeaderField key={`bcpp-${tx.bc_purchase_price ?? ''}`} id={tx.id} field="bc_purchase_price" value={tx.bc_purchase_price} inputClassName="h-9 text-lg font-semibold md:text-lg" />
                <div className="grid grid-cols-[minmax(0,1fr)_5.5rem] gap-3">
                  <DealHeaderField key={`bcemd-${tx.bc_earnest_money ?? ''}`} id={tx.id} field="bc_earnest_money" value={tx.bc_earnest_money} />
                  <EmdInSelect key={`bc-emd-in-${tx.bc_emd_in}`} id={tx.id} value={tx.bc_emd_in} leg="bc" />
                </div>
              </>
            )}
            <DealHeaderField key={`cn-${tx.campaign_name ?? ''}`} id={tx.id} field="campaign_name" value={tx.campaign_name} placeholder="e.g. Absentee owners Q4" multiline />
          </div>
          <div className="space-y-3">
            <DealHeaderField key={`lm-${tx.lead_manager ?? ""}`} id={tx.id} field="lead_manager" value={tx.lead_manager} placeholder="Name" />
            <DealHeaderField key={`am-${tx.acquisition_manager ?? ""}`} id={tx.id} field="acquisition_manager" value={tx.acquisition_manager} placeholder="Name" />
            <DealHeaderField key={`dt-${tx.deal_type ?? ''}`} id={tx.id} field="deal_type" value={tx.deal_type} placeholder="e.g. Wholesale" suggestions={DEAL_TYPE_SUGGESTIONS} />
            <ChoiceField key={`ch-${tx.channel ?? ''}`} id={tx.id} field="channel" value={tx.channel} options={CHANNELS} othersPlaceholder="Enter channel" />
            <div className="space-y-1">
              <label htmlFor="deal-stage" className="block text-xs text-muted-foreground">Status</label>
              {/* key: reset the optimistic value when the server data changes. Bold yellow so the stage stands out. */}
              <DealStageSelect
                key={tx.deal_stage}
                id={tx.id}
                stage={tx.deal_stage}
                className="font-bold text-yellow-600 dark:text-yellow-400 [&_option]:font-normal [&_option]:text-foreground"
              />
            </div>
          </div>
        </div>
      </header>

      {/* ---- Three columns ------------------------------------------------------ */}
      <div className="grid gap-4 lg:grid-cols-[260px_minmax(0,1fr)] xl:grid-cols-[260px_minmax(0,1fr)_300px]">
        <div className="order-2 lg:order-1">
          <DealPeople
            txId={tx.id}
            canRemove={canDelete}
            team={team}
            teamOptions={teamOptions}
            addButton={<AddPersonMenu txId={tx.id} takenRoles={takenRoles} people={personOptions} team={team} teamOptions={teamOptions} />}
            groups={[
              { title: 'Clients', people: clients },
              { title: 'Collaborators', people: parties.filter((p) => !isClientRole(p.role)).map(partyEntry) },
              { title: 'Team members', people: teamPeople },
            ]}
          />
        </div>

        <div className="order-1 min-w-0 rounded-xl border bg-card lg:order-2">
          <nav aria-label="Deal sections" className="flex gap-1 overflow-x-auto border-b px-3">
            {TABS.map((t) => {
              const active = t.key === tab;
              const badge = t.key === 'tasks' ? openTasks : t.key === 'notes' ? ws.notes.length : t.key === 'docs' ? files.length : 0;
              return (
                <Link
                  key={t.key}
                  href={`?tab=${t.key}`}
                  scroll={false}
                  aria-current={active ? 'page' : undefined}
                  className={cn(
                    '-mb-px flex items-center gap-1.5 border-b-2 px-3 py-3 text-xs font-semibold tracking-wide whitespace-nowrap uppercase transition-colors',
                    active ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground',
                  )}
                >
                  {t.label}
                  {badge > 0 && <span className="rounded-full bg-muted px-1.5 text-[0.65rem] text-muted-foreground tabular-nums">{badge}</span>}
                </Link>
              );
            })}
          </nav>
          <div className="p-5">
            {tab === 'tasks' && <DealTasks txId={tx.id} tasks={ws.tasks} members={members} today={today} canDelete={canDelete} managers={managers} />}
            {tab === 'notes' && <DealNotes txId={tx.id} notes={ws.notes} timezone={timezone} canDelete={canDelete} />}
            {tab === 'docs' && <DocumentsPanel orgId={org} transactionId={tx.id} files={files} timezone={timezone} canDelete={canDelete} />}
            {tab === 'details' && <Details tx={tx} ws={ws} editHref={editHref} />}
            {tab === 'financials' && <Financials tx={tx} ws={ws} editHref={editHref} />}
            {tab === 'timeline' && <Timeline tx={tx} ws={ws} files={files} timezone={timezone} />}
          </div>
        </div>

        <aside className="order-3 lg:col-span-2 xl:col-span-1">
          <div className="space-y-4">
            <DatesPanel tx={tx} timezone={timezone} />
            <DealDetailsPanel tx={tx} />
          </div>
        </aside>
      </div>
    </div>
  );
}

// -----------------------------------------------------------------------------
// Right column: dates
// -----------------------------------------------------------------------------
function DatesPanel({ tx, timezone }: { tx: TransactionRow; timezone: string }) {
  const finished = tx.status === 'closed' || tx.status === 'cancelled';
  const split = isSplitDeal(tx);
  const rows = keyDatesFor(split).map((k) => ({ ...k, date: tx[k.key] as string | null }));
  const dates = Object.fromEntries(rows.map((r) => [r.key, r.date]));
  const nextKey = finished ? null : rows.filter((r) => r.date && daysUntil(r.date, timezone) >= 0).sort((a, b) => a.date!.localeCompare(b.date!))[0]?.key;

  return (
    <section aria-labelledby="dates-heading" className="rounded-xl border bg-card p-4">
      <div className="mb-3 flex items-center justify-between">
        <h2 id="dates-heading" className="font-semibold">Dates</h2>
        <EditDatesButton txId={tx.id} dates={dates} variant="plus" split={split} />
      </div>
      <ul className="space-y-1.5">
        {rows.map((r) => {
          const days = r.date ? daysUntil(r.date, timezone) : null;
          const overdue = days !== null && days < 0 && !finished && r.key !== 'contract_date' && r.key !== 'bc_contract_date';
          const isNext = r.key === nextKey;
          return (
            <li key={r.key} className={cn('flex items-center justify-between gap-3 rounded-md px-3 py-2.5 text-sm', isNext ? 'bg-primary/10' : overdue ? 'bg-critical/10' : 'bg-muted/50')}>
              <span className={cn(isNext && 'font-medium text-primary', overdue && 'font-medium text-critical')}>{r.label}</span>
              {r.date ? (
                <span className="text-right tabular-nums">
                  {formatDateOnly(r.date, { month: '2-digit', day: '2-digit', year: 'numeric' })}
                  {!finished && days !== null && (isNext || overdue) && (
                    <span className={cn('block text-xs', overdue ? 'text-critical' : 'text-primary')}>{overdue ? `Overdue · ${relativeDays(days)}` : relativeDays(days)}</span>
                  )}
                </span>
              ) : (
                <EditDatesButton txId={tx.id} dates={dates} focusKey={r.key} variant="add" split={split} />
              )}
            </li>
          );
        })}
        {tx.closed_at && (
          <li className="flex items-center justify-between gap-3 rounded-md bg-success/10 px-3 py-2.5 text-sm">
            <span className="font-medium text-success">Closed</span>
            <span className="tabular-nums">{new Intl.DateTimeFormat('en-US', { month: '2-digit', day: '2-digit', year: 'numeric', timeZone: timezone }).format(new Date(tx.closed_at))}</span>
          </li>
        )}
      </ul>
    </section>
  );
}

// -----------------------------------------------------------------------------
// Right column: deal details (free-text fields, saved as you type → Enter / click away)
// -----------------------------------------------------------------------------
type PropertyInfo = DealWorkspace['property'];
/**
 * Property details under the address, in the order shown. Until a value is typed
 * for this deal, beds / baths / sqft / year built show what the property record has.
 */
const PROPERTY_DETAILS: [
  'prop_last_sold_prior' | 'prop_seller_age' | 'prop_equity' | 'prop_stories' | 'prop_beds' | 'prop_baths'
    | 'prop_bldg_sqft' | 'prop_lot_size' | 'prop_year_built' | 'prop_county',
  (p: PropertyInfo) => string | null,
][] = [
  ['prop_last_sold_prior', () => null],
  ['prop_seller_age', () => null],
  ['prop_equity', () => null],
  ['prop_stories', () => null],
  ['prop_beds', (p) => (p?.bedrooms != null ? String(p.bedrooms) : null)],
  ['prop_baths', (p) => (p?.bathrooms != null ? String(p.bathrooms) : null)],
  ['prop_bldg_sqft', (p) => (p?.squareFeet != null ? p.squareFeet.toLocaleString('en-US') : null)],
  ['prop_lot_size', () => null],
  ['prop_year_built', (p) => (p?.yearBuilt != null ? String(p.yearBuilt) : null)],
  ['prop_county', () => null],
];

/** Field names in the Deal details panel: dark blue, regular weight. */
const detailLabel = 'font-normal text-blue-900 dark:text-blue-300';

function DealDetailsPanel({ tx }: { tx: TransactionRow }) {
  const photos = tx.photos_link?.trim() ?? '';
  // Only http(s) links open; "drive.google.com/…" without the scheme gets https:// added.
  const photosHref = /^https?:\/\//i.test(photos) ? photos : /^[\w-]+(\.[\w-]+)+(\/|$)/.test(photos) ? `https://${photos}` : null;
  // key: refresh a field when its saved value changes elsewhere.
  const k = (f: keyof TransactionRow) => `${f}-${tx[f] ?? ''}`;
  return (
    <section aria-labelledby="deal-details-heading" className="rounded-xl border bg-card p-4">
      <h2 id="deal-details-heading" className="mb-3 font-semibold">Deal details</h2>
      <div className="space-y-3">
        <DealHeaderField key={k('contingency_type')} id={tx.id} field="contingency_type" value={tx.contingency_type} placeholder="e.g. Inspection, Financing" multiline labelClassName={detailLabel} />
        <EscrowTypeField key={k('escrow_type')} id={tx.id} value={tx.escrow_type} labelClassName={detailLabel} />
        <DealHeaderField key={k('escrow_number')} id={tx.id} field="escrow_number" value={tx.escrow_number} placeholder="#" multiline labelClassName={detailLabel} />
        <DealHeaderField key={k('occupancy_strategy')} id={tx.id} field="occupancy_strategy" value={tx.occupancy_strategy} placeholder="e.g. Vacant, Cash for keys" multiline labelClassName={detailLabel} />
        <DealHeaderField key={k('lockbox_code')} id={tx.id} field="lockbox_code" value={tx.lockbox_code} placeholder="Code" multiline labelClassName={detailLabel} />
        <div className="grid grid-cols-2 gap-3">
          <DealHeaderField key={k('arv_estimate')} id={tx.id} field="arv_estimate" value={tx.arv_estimate} labelClassName={detailLabel} />
          <DealHeaderField key={k('rehab_estimate')} id={tx.id} field="rehab_estimate" value={tx.rehab_estimate} labelClassName={detailLabel} />
        </div>
        <div className="space-y-1">
          <DealHeaderField key={k('photos_link')} id={tx.id} field="photos_link" value={tx.photos_link} placeholder="Paste a link" multiline inputClassName="break-all" labelClassName={detailLabel} />
          {photosHref && (
            <a href={photosHref} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline">
              <ExternalLink className="size-3" aria-hidden /> Open photos
            </a>
          )}
        </div>
      </div>
    </section>
  );
}

// -----------------------------------------------------------------------------
// Tabs rendered on the server
// -----------------------------------------------------------------------------
function Details({ tx, ws, editHref }: { tx: TransactionRow; ws: DealWorkspace; editHref: string }) {
  const p = ws.property;
  return (
    <section className="space-y-6">
      <TabHeading title="Details" editHref={editHref} />
      <Grid items={[
        ['Deal name', tx.name],
        ['Side', TX_SIDE[tx.side]],
        ['Stage', DEAL_STAGE[tx.deal_stage].label],
        ['Primary agent', tx.agent_name ?? 'Unassigned'],
        ['Buyer', tx.buyer_name ?? '—'],
        ['Seller', tx.seller_name ?? '—'],
      ]} />
      <div>
        <h3 className="mb-3 text-sm font-semibold">Property</h3>
        <Grid items={[
          ['Address', [tx.property_address, tx.property_city, [tx.property_state, p?.postalCode].filter(Boolean).join(' ')].filter(Boolean).join(', ')],
          ['Type', p ? label(p.propertyType) : '—'],
          ['MLS #', p?.mlsNumber ?? '—'],
          ['Bedrooms', p?.bedrooms != null ? String(p.bedrooms) : '—'],
          ['Bathrooms', p?.bathrooms != null ? String(p.bathrooms) : '—'],
          ['Square feet', p?.squareFeet != null ? p.squareFeet.toLocaleString('en-US') : '—'],
          ['Year built', p?.yearBuilt != null ? String(p.yearBuilt) : '—'],
        ]} />
      </div>
    </section>
  );
}

function Financials({ tx, ws, editHref }: { tx: TransactionRow; ws: DealWorkspace; editHref: string }) {
  const price = tx.sale_price ?? tx.offer_price;
  const commission = tx.commission_amount ?? (price !== null && tx.commission_rate !== null ? (price * tx.commission_rate) / 100 : null);
  return (
    <section className="space-y-6">
      <TabHeading title="Financials" editHref={editHref} />
      <Grid items={[
        ['Listing price', money(ws.property?.listPrice ?? null)],
        ['Offer price', money(tx.offer_price)],
        ['Close price', money(tx.sale_price)],
        ...(isSplitDeal(tx)
          ? ([
              ['A-B Purchase price', money(tx.purchase_price)],
              ['B-C Purchase price', money(tx.bc_purchase_price)],
              ['A-B EMD', money(tx.earnest_money)],
              ['B-C EMD', money(tx.bc_earnest_money)],
            ] as [string, string][])
          : []),
        ['Earnest money', money(tx.earnest_money)],
        ['Commission rate', tx.commission_rate !== null ? `${tx.commission_rate}%` : '—'],
        ['Commission (GCI)', money(commission)],
      ]} />
    </section>
  );
}

/** withTime: a real moment (shown with the time); date-only events show just the day. */
type TimelineEvent = { at: string; icon: React.ElementType; text: string; tone?: 'primary' | 'success'; withTime?: boolean };

function Timeline({ tx, ws, files, timezone }: { tx: TransactionRow; ws: DealWorkspace; files: TransactionFile[]; timezone: string }) {
  const events: TimelineEvent[] = [
    { at: tx.created_at, icon: Sparkles, text: 'Deal created' },
    ...(tx.contract_date ? [{ at: `${tx.contract_date}T12:00:00Z`, icon: Flag, text: 'Contract ratified', tone: 'primary' as const }] : []),
    ...(tx.closed_at ? [{ at: tx.closed_at, icon: CalendarCheck, text: 'Deal closed', tone: 'success' as const }] : []),
    ...ws.tasks.filter((t) => t.done && t.completedAt).map((t) => ({ at: t.completedAt!, icon: CircleCheck, text: `Task completed: ${t.title}`, withTime: true })),
    ...ws.deletedTasks.map((t) => ({ at: t.deletedAt, icon: Trash2, text: `Task deleted: ${t.title}`, withTime: true })),
    ...ws.notes.map((n) => ({ at: n.createdAt, icon: StickyNote, text: `${n.authorName ?? 'Someone'} added a note: ${n.body.length > 120 ? `${n.body.slice(0, 120)}…` : n.body}` })),
    ...files.map((f) => ({ at: f.createdAt, icon: FileText, text: `${f.uploaderName ?? 'Someone'} uploaded ${f.fileName}` })),
  ].sort((a, b) => b.at.localeCompare(a.at));
  const when = new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeZone: timezone });
  const whenWithTime = new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeStyle: 'short', timeZone: timezone });

  return (
    <section className="space-y-4">
      <h2 className="text-base font-semibold">Timeline</h2>
      <ol className="relative space-y-4 border-l pl-6">
        {events.map((e, i) => {
          const Icon = e.icon;
          return (
            <li key={i} className="relative">
              <span className={cn('absolute top-0 -left-[2.0625rem] flex size-6 items-center justify-center rounded-full bg-card ring-1 ring-foreground/10',
                e.tone === 'primary' && 'ring-primary', e.tone === 'success' && 'ring-success')}>
                <Icon className={cn('size-3.5 text-muted-foreground', e.tone === 'primary' && 'text-primary', e.tone === 'success' && 'text-success')} aria-hidden />
              </span>
              <p className="text-sm">{e.text}</p>
              <p className="text-xs text-muted-foreground"><time dateTime={e.at}>{(e.withTime ? whenWithTime : when).format(new Date(e.at))}</time></p>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

function TabHeading({ title, editHref }: { title: string; editHref: string }) {
  return (
    <div className="flex items-center justify-between">
      <h2 className="text-base font-semibold">{title}</h2>
      <Link href={editHref} className={buttonVariants({ variant: 'outline', size: 'sm' })}><Pencil /> Edit</Link>
    </div>
  );
}

function Grid({ items }: { items: [string, string][] }) {
  return (
    <dl className="grid gap-x-6 gap-y-4 text-sm sm:grid-cols-2 xl:grid-cols-3">
      {items.map(([k, v]) => (
        <div key={k}>
          <dt className="text-xs text-muted-foreground">{k}</dt>
          <dd className="font-medium">{v}</dd>
        </div>
      ))}
    </dl>
  );
}

const money = (v: number | null) => (v !== null ? formatCurrency(v) : '—');
const label = (s: string | null | undefined) => (s ? s.replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase()) : '—');
