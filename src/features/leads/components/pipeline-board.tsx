'use client';

import Link from 'next/link';
import { useCallback, useMemo, useRef, useState, useTransition } from 'react';
import {
  closestCorners,
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  useDroppable,
  useSensor,
  useSensors,
  type Announcements,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
  type KeyboardCoordinateGetter,
  type UniqueIdentifier,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical } from 'lucide-react';
import { toast } from 'sonner';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Input } from '@/components/ui/input';
import { cn, formatCurrency } from '@/lib/utils';
import type { LeadStatus } from '@/types/database.types';
import { ScoreBadge } from '@/features/ai/components/score-badge';
import { moveLead } from '../actions';
import { CLOSED_STAGES, LEAD_INTENT, LEAD_STATUS, LEAD_STATUS_VALUES, sourceLabel } from '../constants';
import type { PipelineCard } from '../types';

type Columns = Record<LeadStatus, PipelineCard[]>;
const STAGES = LEAD_STATUS_VALUES;
const COL = 'col:';

function groupByStage(cards: PipelineCard[]): Columns {
  const cols = Object.fromEntries(STAGES.map((s) => [s, [] as PipelineCard[]])) as Columns;
  for (const c of cards) cols[c.status]?.push(c);
  for (const s of STAGES) cols[s].sort((a, b) => a.pipeline_position - b.pipeline_position);
  return cols;
}

/** Fractional position between two neighbours (either may be missing). */
function positionBetween(prev?: number, next?: number) {
  if (prev === undefined && next === undefined) return 0;
  if (prev === undefined) return next! - 1024;
  if (next === undefined) return prev + 1024;
  return (prev + next) / 2;
}

function money(card: PipelineCard) {
  const v = card.budget_max ?? card.budget_min;
  return v === null ? 0 : v;
}

export function PipelineBoard({ initialCards }: { initialCards: PipelineCard[] }) {
  const [columns, setColumns] = useState<Columns>(() => groupByStage(initialCards));
  const [activeId, setActiveId] = useState<UniqueIdentifier | null>(null);
  const [pendingLost, setPendingLost] = useState<{ id: string; position: number; before: Columns } | null>(null);
  const [lostReason, setLostReason] = useState('');
  const beforeDrag = useRef<Columns | null>(null);
  const [, startTransition] = useTransition();

  // Keyboard: ←/→ jump to the neighbouring stage (scrolling it into view),
  // ↑/↓ use dnd-kit's sortable behaviour inside the column. The default getter
  // alone doesn't reliably cross columns in a horizontally scrolling board.
  const stageOfRef = useRef<(id: UniqueIdentifier) => LeadStatus | undefined>(() => undefined);
  const coordinateGetter = useCallback<KeyboardCoordinateGetter>((event, args) => {
    if (event.code === 'ArrowRight' || event.code === 'ArrowLeft') {
      const active = args.context.active;
      const current = active ? stageOfRef.current(active.id) : undefined;
      if (!current) return undefined;
      const next = STAGES[STAGES.indexOf(current) + (event.code === 'ArrowRight' ? 1 : -1)];
      if (!next) return undefined;
      event.preventDefault();
      const column = document.querySelector<HTMLElement>(`ol[data-stage="${next}"]`);
      if (!column) return undefined;
      column.scrollIntoView({ block: 'nearest', inline: 'nearest' });
      const rect = column.getBoundingClientRect();
      return { x: rect.left + 8, y: rect.top + 4 }; // top-left of the target column's list
    }
    return sortableKeyboardCoordinates(event, args);
  }, []);

  const sensors = useSensors(
    // 6px before a drag starts → plain clicks still open the lead.
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter }),
  );

  const byId = useMemo(() => {
    const m = new Map<UniqueIdentifier, PipelineCard>();
    for (const s of STAGES) for (const c of columns[s]) m.set(c.id, c);
    return m;
  }, [columns]);

  const stageOf = (id: UniqueIdentifier): LeadStatus | undefined => {
    if (typeof id === 'string' && id.startsWith(COL)) return id.slice(COL.length) as LeadStatus;
    return STAGES.find((s) => columns[s].some((c) => c.id === id));
  };
  stageOfRef.current = stageOf;

  function persist(id: string, status: LeadStatus, position: number, before: Columns, reason?: string) {
    const fromStatus = STAGES.find((s) => before[s].some((c) => c.id === id));
    startTransition(async () => {
      const result = await moveLead({ leadId: id, status, position, lostReason: reason });
      if (!result.ok) {
        setColumns(before); // roll back the optimistic move
        toast.error(result.error);
      } else if (fromStatus !== status) {
        toast.success(`Moved to ${LEAD_STATUS[status].label}`);
      }
    });
  }

  function onDragStart({ active }: DragStartEvent) {
    setActiveId(active.id);
    beforeDrag.current = columns;
  }

  // Cross-column moves happen live while dragging so the card "lands" in place.
  function onDragOver({ active, over }: DragOverEvent) {
    if (!over) return;
    const from = stageOf(active.id);
    const to = stageOf(over.id);
    if (!from || !to || from === to) return;
    setColumns((prev) => {
      const card = prev[from].find((c) => c.id === active.id);
      if (!card) return prev;
      const target = prev[to];
      const overIndex = target.findIndex((c) => c.id === over.id);
      const translated = active.rect.current.translated;
      const below = translated && over.rect ? translated.top > over.rect.top + over.rect.height / 2 : false;
      const index = overIndex >= 0 ? overIndex + (below ? 1 : 0) : target.length;
      return {
        ...prev,
        [from]: prev[from].filter((c) => c.id !== active.id),
        [to]: [...target.slice(0, index), { ...card, status: to }, ...target.slice(index)],
      };
    });
  }

  function onDragEnd({ active, over }: DragEndEvent) {
    setActiveId(null);
    const before = beforeDrag.current;
    beforeDrag.current = null;
    if (!before) return;
    const stage = stageOf(active.id);
    if (!over || !stage) {
      setColumns(before);
      return;
    }

    // Same-column reorder
    let items = columns[stage];
    const oldIndex = items.findIndex((c) => c.id === active.id);
    const overIsCard = !(typeof over.id === 'string' && over.id.startsWith(COL));
    const overIndex = overIsCard ? items.findIndex((c) => c.id === over.id) : -1;
    if (overIndex >= 0 && overIndex !== oldIndex) items = arrayMove(items, oldIndex, overIndex);

    const index = items.findIndex((c) => c.id === active.id);
    const original = STAGES.flatMap((s) => before[s]).find((c) => c.id === active.id)!;
    const originalIndex = before[original.status].findIndex((c) => c.id === active.id);
    if (original.status === stage && originalIndex === index) {
      setColumns(before); // dropped where it started
      return;
    }

    const position = positionBetween(items[index - 1]?.pipeline_position, items[index + 1]?.pipeline_position);
    const next: Columns = {
      ...columns,
      [stage]: items.map((c) => (c.id === active.id ? { ...c, status: stage, pipeline_position: position } : c)),
    };
    setColumns(next);

    if (stage === 'closed_lost' && original.status !== 'closed_lost') {
      setLostReason('');
      setPendingLost({ id: String(active.id), position, before });
      return;
    }
    persist(String(active.id), stage, position, before);
  }

  function onDragCancel() {
    setActiveId(null);
    if (beforeDrag.current) setColumns(beforeDrag.current);
    beforeDrag.current = null;
  }

  const name = (id: UniqueIdentifier) => byId.get(id)?.full_name ?? 'lead';
  const stageName = (id: UniqueIdentifier) => {
    const s = stageOf(id);
    return s ? LEAD_STATUS[s].label : 'unknown stage';
  };
  const announcements: Announcements = {
    onDragStart: ({ active }) => `Picked up ${name(active.id)} in ${stageName(active.id)}. Use arrow keys to move, space to drop, escape to cancel.`,
    onDragOver: ({ active, over }) => (over ? `${name(active.id)} is over ${stageName(over.id)}.` : undefined),
    onDragEnd: ({ active, over }) => (over ? `Dropped ${name(active.id)} in ${stageName(over.id)}.` : `Dropped ${name(active.id)}.`),
    onDragCancel: ({ active }) => `Move cancelled. ${name(active.id)} stays where it was.`,
  };

  const activeCard = activeId ? byId.get(activeId) : undefined;

  return (
    <>
      <DndContext
        id="lead-pipeline" // stable ids for SSR → no hydration mismatch on aria attributes
        sensors={sensors}
        collisionDetection={closestCorners}
        onDragStart={onDragStart}
        onDragOver={onDragOver}
        onDragEnd={onDragEnd}
        onDragCancel={onDragCancel}
        accessibility={{ announcements }}
      >
        <div className="-mx-6 overflow-x-auto px-6 pb-4">
          <div className="flex min-w-max items-start gap-3">
            {STAGES.map((stage) => (
              <Column key={stage} stage={stage} cards={columns[stage]} />
            ))}
          </div>
        </div>
        <DragOverlay dropAnimation={{ duration: 150 }}>
          {activeCard ? <CardBody card={activeCard} overlay /> : null}
        </DragOverlay>
      </DndContext>

      <AlertDialog
        open={!!pendingLost}
        onOpenChange={(open) => {
          if (!open && pendingLost) {
            setColumns(pendingLost.before); // Escape / cancel → undo the drop
            setPendingLost(null);
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Mark {pendingLost ? name(pendingLost.id) : 'lead'} as lost?</AlertDialogTitle>
            <AlertDialogDescription>A short reason helps you spot patterns later. Optional.</AlertDialogDescription>
          </AlertDialogHeader>
          <Input
            autoFocus
            placeholder="e.g. Went with another agent"
            aria-label="Reason lost"
            value={lostReason}
            maxLength={500}
            onChange={(e) => setLostReason(e.target.value)}
          />
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (!pendingLost) return;
                persist(pendingLost.id, 'closed_lost', pendingLost.position, pendingLost.before, lostReason.trim() || undefined);
                setPendingLost(null);
              }}
            >
              Mark as lost
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function Column({ stage, cards }: { stage: LeadStatus; cards: PipelineCard[] }) {
  const { setNodeRef, isOver } = useDroppable({ id: `${COL}${stage}` });
  const total = cards.reduce((sum, c) => sum + money(c), 0);
  const closed = CLOSED_STAGES.includes(stage);

  return (
    <section
      aria-label={`${LEAD_STATUS[stage].label}, ${cards.length} leads`}
      className={cn('flex w-72 shrink-0 flex-col rounded-xl bg-muted/50 ring-1 ring-foreground/5', isOver && 'ring-2 ring-primary/40')}
    >
      <header className="flex items-baseline justify-between gap-2 px-3 pt-3 pb-2">
        <h2 className="text-sm font-semibold">
          {LEAD_STATUS[stage].label} <span className="font-normal text-muted-foreground tabular-nums">{cards.length}</span>
        </h2>
        {total > 0 && (
          <span className="text-xs text-muted-foreground tabular-nums" title={closed ? 'Total budget (last 90 days)' : 'Total budget'}>
            {formatCurrency(total, { compact: true })}
          </span>
        )}
      </header>
      <SortableContext id={stage} items={cards.map((c) => c.id)} strategy={verticalListSortingStrategy}>
        <ol ref={setNodeRef} className="flex min-h-24 flex-col gap-2 px-2 pb-2" data-stage={stage}>
          {cards.map((card) => <SortableCard key={card.id} card={card} />)}
          {cards.length === 0 && (
            <li className="flex flex-1 items-center justify-center rounded-lg border border-dashed py-6 text-xs text-muted-foreground">
              Drop leads here
            </li>
          )}
        </ol>
      </SortableContext>
    </section>
  );
}

function SortableCard({ card }: { card: PipelineCard }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: card.id });
  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn('touch-none', isDragging && 'opacity-40')}
      data-lead-id={card.id}
      {...attributes}
      {...listeners}
      aria-roledescription="draggable lead"
      aria-label={`${card.full_name}, ${LEAD_STATUS[card.status].label}`}
    >
      <CardBody card={card} />
    </li>
  );
}

function CardBody({ card, overlay }: { card: PipelineCard; overlay?: boolean }) {
  const budget = card.budget_max ?? card.budget_min;
  return (
    <div
      className={cn(
        'group cursor-grab rounded-lg bg-background p-3 text-sm shadow-xs ring-1 ring-foreground/10 select-none active:cursor-grabbing',
        overlay && 'rotate-1 cursor-grabbing shadow-lg ring-primary/40',
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <Link
          href={`/leads/${card.id}`}
          className="min-w-0 truncate font-medium hover:underline"
          // Keyboard users focus the card (Space to pick up, Enter on the card's
          // link isn't needed); the 6px drag threshold keeps mouse clicks working.
          tabIndex={-1}
        >
          {card.full_name}
        </Link>
        <GripVertical className="size-4 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" aria-hidden />
      </div>
      <p className="mt-0.5 truncate text-xs text-muted-foreground">
        {LEAD_INTENT[card.intent]}{card.source && ` · ${sourceLabel(card.source)}`}
      </p>
      {card.ai_temperature && <ScoreBadge score={card.score} temperature={card.ai_temperature} className="mt-1.5" />}
      <div className="mt-2 flex items-center justify-between gap-2 text-xs">
        <span className="tabular-nums">{budget !== null ? formatCurrency(budget, { compact: true }) : '—'}</span>
        <span className="truncate text-muted-foreground">{card.assigned_name ?? 'Unassigned'}</span>
      </div>
    </div>
  );
}
