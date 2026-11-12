'use client';

import Link from 'next/link';
import { useMemo, useRef, useState } from 'react';
import { CheckCircle2, CircleAlert, Download, FileSpreadsheet, Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { normalizeHeader, parseCsv, type ParsedCsv } from '@/lib/csv';
import { importContactsBatch } from '../actions';
import {
  IMPORT_BATCH_SIZE, IMPORT_FIELDS, IMPORT_MAX_FILE_BYTES, IMPORT_MAX_ROWS, normalizeTag, type ImportFieldKey,
} from '../constants';
import type { ImportRow } from '../schemas';
import type { ImportResult } from '../types';

type Step = 'upload' | 'map' | 'importing' | 'done';
type Mapping = Record<ImportFieldKey, number>; // CSV column index, -1 = not imported

const TEMPLATE = 'First Name,Last Name,Email,Phone,Company,Address,City,State,Zip,Source,Tags\n' +
  'Jane,Doe,jane@example.com,555-0100,,12 Oak St,Austin,TX,78701,referral,"buyer;vip"\n';

function autoMap(headers: string[]): Mapping {
  const normalized = headers.map(normalizeHeader);
  const mapping = {} as Mapping;
  const used = new Set<number>();
  for (const f of IMPORT_FIELDS) {
    // Normalize aliases the same way as headers ("e-mail" → "e mail").
    const aliases = (f.aliases as readonly string[]).map(normalizeHeader);
    const idx = normalized.findIndex((h, i) => !used.has(i) && aliases.includes(h));
    mapping[f.key] = idx;
    if (idx >= 0) used.add(idx);
  }
  // Prefer explicit first/last columns over splitting a full name.
  if (mapping.first_name >= 0) mapping.full_name = -1;
  return mapping;
}

function buildRows(csv: ParsedCsv, m: Mapping): ImportRow[] {
  const cell = (row: string[], key: ImportFieldKey) => (m[key] >= 0 ? (row[m[key]] ?? '').trim() : '');
  const rows: ImportRow[] = [];
  csv.rows.forEach((row, i) => {
    let first = cell(row, 'first_name');
    let last = cell(row, 'last_name');
    if (!first && m.full_name >= 0) {
      const parts = cell(row, 'full_name').split(/\s+/).filter(Boolean);
      first = parts.shift() ?? '';
      last = last || parts.join(' ');
    }
    const tags = cell(row, 'tags').split(/[;,|]/).map(normalizeTag).filter(Boolean);
    rows.push({
      _line: i + 2, // +1 for 1-based, +1 for the header row → matches the line in Excel
      first_name: first.slice(0, 500),
      last_name: last.slice(0, 500),
      email: cell(row, 'email').slice(0, 500),
      phone: cell(row, 'phone').slice(0, 500),
      company: cell(row, 'company').slice(0, 500),
      address_line1: cell(row, 'address_line1').slice(0, 500),
      city: cell(row, 'city').slice(0, 500),
      state: cell(row, 'state').slice(0, 500),
      postal_code: cell(row, 'postal_code').slice(0, 500),
      source: cell(row, 'source').slice(0, 500),
      tags: Array.from(new Set(tags)).slice(0, 30),
    });
  });
  return rows;
}

export function ImportWizard() {
  const [step, setStep] = useState<Step>('upload');
  const [fileName, setFileName] = useState('');
  const [csv, setCsv] = useState<ParsedCsv | null>(null);
  const [mapping, setMapping] = useState<Mapping | null>(null);
  const [onDuplicate, setOnDuplicate] = useState<'skip' | 'update'>('skip');
  const [extraTags, setExtraTags] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [result, setResult] = useState<ImportResult | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const rows = useMemo(() => (csv && mapping ? buildRows(csv, mapping) : []), [csv, mapping]);
  const hasName = !!mapping && (mapping.first_name >= 0 || mapping.full_name >= 0);

  async function onFile(file: File | undefined) {
    setError(null);
    if (!file) return;
    if (file.size > IMPORT_MAX_FILE_BYTES) return setError('That file is larger than 5 MB. Split it into smaller files.');
    if (!/\.(csv|txt)$/i.test(file.name) && !file.type.includes('csv')) return setError('Please choose a .csv file (in Excel: File → Save As → CSV).');
    const parsed = parseCsv(await file.text());
    if (parsed.headers.length === 0 || parsed.rows.length === 0) return setError('That file has no data rows.');
    if (parsed.rows.length > IMPORT_MAX_ROWS) return setError(`That file has ${parsed.rows.length.toLocaleString()} rows; the limit is ${IMPORT_MAX_ROWS.toLocaleString()} per import.`);
    setFileName(file.name);
    setCsv(parsed);
    setMapping(autoMap(parsed.headers));
    setStep('map');
  }

  async function runImport() {
    if (!rows.length) return;
    setStep('importing');
    setError(null);
    const tags = Array.from(new Set(extraTags.split(',').map(normalizeTag).filter(Boolean))).slice(0, 10);
    const total: ImportResult = { inserted: 0, updated: 0, skipped: 0, errors: [] };
    setProgress({ done: 0, total: rows.length });

    for (let i = 0; i < rows.length; i += IMPORT_BATCH_SIZE) {
      const batch = rows.slice(i, i + IMPORT_BATCH_SIZE);
      const res = await importContactsBatch({ rows: batch, onDuplicate, tags });
      if (!res.ok) {
        setError(`${res.error} Rows before line ${batch[0]._line} were imported.`);
        break;
      }
      total.inserted += res.result.inserted;
      total.updated += res.result.updated;
      total.skipped += res.result.skipped;
      total.errors.push(...res.result.errors);
      setProgress({ done: Math.min(i + batch.length, rows.length), total: rows.length });
    }
    setResult(total);
    setStep('done');
  }

  function reset() {
    setStep('upload');
    setCsv(null);
    setMapping(null);
    setResult(null);
    setError(null);
    setExtraTags('');
    if (fileRef.current) fileRef.current.value = '';
  }

  // ---------------------------------------------------------------------------
  if (step === 'upload') {
    return (
      <Card>
        <CardHeader>
          <CardTitle>1. Upload a CSV file</CardTitle>
          <CardDescription>Export from your old CRM, Google Contacts, Outlook or a spreadsheet. Up to {IMPORT_MAX_ROWS.toLocaleString()} rows.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <label
            className="flex cursor-pointer flex-col items-center gap-2 rounded-xl border-2 border-dashed p-10 text-center hover:bg-muted/40"
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              void onFile(e.dataTransfer.files[0]);
            }}
          >
            <Upload className="size-8 text-muted-foreground" aria-hidden />
            <span className="font-medium">Drop a .csv file here, or click to choose</span>
            <span className="text-xs text-muted-foreground">Comma, semicolon or tab separated · first row must be column names</span>
            <input ref={fileRef} type="file" accept=".csv,text/csv" className="sr-only" onChange={(e) => void onFile(e.target.files?.[0])} />
          </label>
          {error && <ErrorText>{error}</ErrorText>}
          <Button
            variant="link"
            className="px-0"
            onClick={() => {
              const url = URL.createObjectURL(new Blob([TEMPLATE], { type: 'text/csv' }));
              const a = Object.assign(document.createElement('a'), { href: url, download: 'contacts-template.csv' });
              a.click();
              URL.revokeObjectURL(url);
            }}
          >
            <Download /> Download a template
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (step === 'map' && csv && mapping) {
    return (
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>2. Match columns</CardTitle>
            <CardDescription className="flex items-center gap-1.5">
              <FileSpreadsheet className="size-4" aria-hidden /> {fileName} · {csv.rows.length.toLocaleString()} rows · we matched what we could
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {IMPORT_FIELDS.map((f) => (
              <div key={f.key} className="space-y-1.5">
                <label htmlFor={`map-${f.key}`} className="text-sm font-medium">{f.label}</label>
                <NativeSelect
                  id={`map-${f.key}`}
                  className="w-full"
                  value={String(mapping[f.key])}
                  onChange={(e) => setMapping({ ...mapping, [f.key]: Number(e.target.value) })}
                >
                  <NativeSelectOption value="-1">— Don&apos;t import —</NativeSelectOption>
                  {csv.headers.map((h, i) => (
                    <NativeSelectOption key={i} value={String(i)}>{h || `Column ${i + 1}`}</NativeSelectOption>
                  ))}
                </NativeSelect>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>3. Options</CardTitle></CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <fieldset className="space-y-2">
              <legend className="text-sm font-medium">When the email already exists</legend>
              <label className="flex items-start gap-2 text-sm">
                <input type="radio" name="dup" checked={onDuplicate === 'skip'} onChange={() => setOnDuplicate('skip')} className="mt-0.5 accent-primary" />
                <span><strong>Skip</strong> the row (safest)</span>
              </label>
              <label className="flex items-start gap-2 text-sm">
                <input type="radio" name="dup" checked={onDuplicate === 'update'} onChange={() => setOnDuplicate('update')} className="mt-0.5 accent-primary" />
                <span><strong>Update</strong> the existing contact: fill in blanks, add tags. Never erases data.</span>
              </label>
            </fieldset>
            <div className="space-y-1.5">
              <label htmlFor="extra-tags" className="text-sm font-medium">Tag every imported contact</label>
              <Input id="extra-tags" placeholder="e.g. open house nov 2026" value={extraTags} onChange={(e) => setExtraTags(e.target.value)} />
              <p className="text-xs text-muted-foreground">Comma-separated. Handy for finding this batch later.</p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Preview</CardTitle>
            <CardDescription>First 5 rows as they will be imported.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="rounded-lg ring-1 ring-foreground/10">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Line</TableHead><TableHead>First</TableHead><TableHead>Last</TableHead>
                    <TableHead>Email</TableHead><TableHead>Phone</TableHead><TableHead>City</TableHead><TableHead>Tags</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.slice(0, 5).map((r) => (
                    <TableRow key={r._line}>
                      <TableCell className="text-muted-foreground">{r._line}</TableCell>
                      <TableCell>{r.first_name || <span className="text-critical">missing</span>}</TableCell>
                      <TableCell>{r.last_name}</TableCell>
                      <TableCell>{r.email}</TableCell>
                      <TableCell>{r.phone}</TableCell>
                      <TableCell>{r.city}</TableCell>
                      <TableCell>{r.tags?.join(', ')}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>

        {!hasName && <ErrorText>Match a column to <strong>First name</strong> or <strong>Full name</strong> to continue.</ErrorText>}
        <div className="flex justify-between gap-2">
          <Button variant="outline" onClick={reset}>Choose another file</Button>
          <Button onClick={runImport} disabled={!hasName}>Import {rows.length.toLocaleString()} contacts</Button>
        </div>
      </div>
    );
  }

  if (step === 'importing') {
    const pct = progress.total ? Math.round((progress.done / progress.total) * 100) : 0;
    return (
      <Card>
        <CardHeader><CardTitle>Importing…</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div className="h-2 overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
            <div className="h-full bg-primary transition-all" style={{ width: `${pct}%` }} />
          </div>
          <p className="text-sm text-muted-foreground">
            {progress.done.toLocaleString()} of {progress.total.toLocaleString()} rows processed. Keep this tab open.
          </p>
        </CardContent>
      </Card>
    );
  }

  // done
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <CheckCircle2 className="size-5 text-success" aria-hidden /> Import finished
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {error && <ErrorText>{error}</ErrorText>}
        <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Stat label="Added" value={result?.inserted ?? 0} />
          <Stat label="Updated" value={result?.updated ?? 0} />
          <Stat label="Skipped (duplicates)" value={result?.skipped ?? 0} />
          <Stat label="Errors" value={result?.errors.length ?? 0} />
        </dl>
        {!!result?.errors.length && (
          <div className="max-h-64 overflow-auto rounded-lg ring-1 ring-foreground/10">
            <Table>
              <TableHeader><TableRow><TableHead>Line</TableHead><TableHead>Problem</TableHead></TableRow></TableHeader>
              <TableBody>
                {result.errors.map((e) => (
                  <TableRow key={e.line}><TableCell>{e.line}</TableCell><TableCell>{e.message}</TableCell></TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
        <div className="flex gap-2">
          <Button render={<Link href="/contacts" />} nativeButton={false}>View contacts</Button>
          <Button variant="outline" onClick={reset}>Import another file</Button>
        </div>
      </CardContent>
    </Card>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg bg-muted/50 p-3">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="text-2xl font-semibold tabular-nums">{value.toLocaleString()}</dd>
    </div>
  );
}

function ErrorText({ children }: { children: React.ReactNode }) {
  return (
    <p role="alert" className="flex items-start gap-2 text-sm text-destructive">
      <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden /> <span>{children}</span>
    </p>
  );
}
