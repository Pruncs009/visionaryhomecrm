import 'server-only';
import { createSign } from 'node:crypto';

/**
 * Minimal Google Sheets client for the Pipeline Review Tracker.
 *
 * Auth: a Google Cloud service account (no user sign-in). The sheet must be
 * shared with the service account's email as an Editor.
 *
 *   GOOGLE_SERVICE_ACCOUNT_EMAIL        …@….iam.gserviceaccount.com
 *   GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY  the "private_key" from the JSON key file
 *   PIPELINE_SHEET_ID                   the long id in the sheet's URL
 *   PIPELINE_SHEET_GID                  the tab id (#gid=… in the URL)
 *
 * GOOGLE_SHEETS_API_BASE / GOOGLE_OAUTH_TOKEN_URL can point at a stand-in for tests.
 */

const API_BASE = process.env.GOOGLE_SHEETS_API_BASE || 'https://sheets.googleapis.com';
const TOKEN_URL = process.env.GOOGLE_OAUTH_TOKEN_URL || 'https://oauth2.googleapis.com/token';
const SCOPE = 'https://www.googleapis.com/auth/spreadsheets';

export type SheetsConfig = { email: string; privateKey: string; sheetId: string; gid: string };

export function sheetsConfig(): SheetsConfig | null {
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL?.trim();
  // Vercel / .env often store the key with literal "\n" — turn them back into newlines.
  const privateKey = process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY?.replace(/\\n/g, '\n').trim();
  const sheetId = process.env.PIPELINE_SHEET_ID?.trim();
  const gid = process.env.PIPELINE_SHEET_GID?.trim() || '0';
  if (!email || !privateKey || !sheetId) return null;
  return { email, privateKey, sheetId, gid };
}

export class SheetsError extends Error {
  constructor(message: string, readonly status?: number) {
    super(message);
  }
}

// ----------------------------------------------------------------------------- auth
let cachedToken: { token: string; expires: number; email: string } | null = null;

const b64url = (s: string | Buffer) => Buffer.from(s).toString('base64url');

async function accessToken(cfg: SheetsConfig): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  if (cachedToken && cachedToken.email === cfg.email && cachedToken.expires - 60 > now) return cachedToken.token;

  const header = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claims = b64url(JSON.stringify({ iss: cfg.email, scope: SCOPE, aud: TOKEN_URL, iat: now, exp: now + 3600 }));
  let signature: string;
  try {
    signature = createSign('RSA-SHA256').update(`${header}.${claims}`).sign(cfg.privateKey).toString('base64url');
  } catch {
    throw new SheetsError('The Google service account private key is not valid. Check GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY.');
  }

  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: `${header}.${claims}.${signature}` }),
    cache: 'no-store',
  });
  const body = (await res.json().catch(() => ({}))) as { access_token?: string; expires_in?: number; error_description?: string };
  if (!res.ok || !body.access_token) {
    throw new SheetsError(`Google sign-in for the service account failed${body.error_description ? `: ${body.error_description}` : '.'}`, res.status);
  }
  cachedToken = { token: body.access_token, expires: now + (body.expires_in ?? 3600), email: cfg.email };
  return body.access_token;
}

async function api<T>(cfg: SheetsConfig, path: string, init?: RequestInit): Promise<T> {
  const token = await accessToken(cfg);
  const res = await fetch(`${API_BASE}/v4/spreadsheets/${encodeURIComponent(cfg.sheetId)}${path}`, {
    ...init,
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json', ...(init?.headers ?? {}) },
    cache: 'no-store',
  });
  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as { error?: { message?: string } };
    if (res.status === 403 || res.status === 404) {
      throw new SheetsError(`The CRM can't open the sheet. Share it with ${cfg.email} as an Editor.`, res.status);
    }
    throw new SheetsError(err.error?.message || `Google Sheets error (${res.status}).`, res.status);
  }
  return (await res.json()) as T;
}

// ----------------------------------------------------------------------------- A1 helpers
/** 0 → A, 25 → Z, 26 → AA */
export function columnLetter(index: number): string {
  let n = index + 1;
  let s = '';
  while (n > 0) {
    const r = (n - 1) % 26;
    s = String.fromCharCode(65 + r) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}
const quoteTab = (title: string) => `'${title.replace(/'/g, "''")}'`;
const range = (title: string, a1: string) => encodeURIComponent(`${quoteTab(title)}!${a1}`);

async function tabTitle(cfg: SheetsConfig): Promise<string> {
  const meta = await api<{ sheets?: { properties: { sheetId: number; title: string } }[] }>(cfg, '?fields=sheets.properties(sheetId,title)');
  const tabs = meta.sheets ?? [];
  const tab = tabs.find((s) => String(s.properties.sheetId) === cfg.gid) ?? tabs[0];
  if (!tab) throw new SheetsError('The spreadsheet has no tabs.');
  return tab.properties.title;
}

// ----------------------------------------------------------------------------- read / write
export type PipelineSheet = {
  title: string;
  /** Sheet row number (1-based) of the header row. */
  headerRow: number;
  headers: string[];
  rows: { rowNumber: number; cells: string[]; formula: boolean[] }[];
  url: string;
};

const MAX_COLS = 'ZZ';

export async function readPipelineSheet(cfg: SheetsConfig): Promise<PipelineSheet> {
  const title = await tabTitle(cfg);
  type Values = { values?: string[][] };
  const [shown, formulas] = await Promise.all([
    api<Values>(cfg, `/values/${range(title, `A1:${MAX_COLS}`)}?valueRenderOption=FORMATTED_VALUE`),
    api<Values>(cfg, `/values/${range(title, `A1:${MAX_COLS}`)}?valueRenderOption=FORMULA`),
  ]);
  const all = shown.values ?? [];
  // Header = first row with at least two filled cells (skips a title row above the table).
  const headerIndex = Math.max(0, all.findIndex((r) => r.filter((c) => String(c ?? '').trim()).length >= 2));
  const headers = (all[headerIndex] ?? []).map((h, i) => String(h ?? '').trim() || columnLetter(i));
  const width = Math.max(headers.length, ...all.slice(headerIndex + 1).map((r) => r.length), 0);
  while (headers.length < width) headers.push(columnLetter(headers.length));

  const rows = all.slice(headerIndex + 1).map((r, i) => {
    const sheetRow = headerIndex + 2 + i;
    const fRow = formulas.values?.[sheetRow - 1] ?? [];
    return {
      rowNumber: sheetRow,
      cells: headers.map((_, c) => String(r[c] ?? '')),
      formula: headers.map((_, c) => String(fRow[c] ?? '').startsWith('=')),
    };
  });
  return {
    title,
    headerRow: headerIndex + 1,
    headers,
    rows: rows.filter((r) => r.cells.some((c) => c.trim())),
    url: `https://docs.google.com/spreadsheets/d/${cfg.sheetId}/edit#gid=${cfg.gid}`,
  };
}

/**
 * Write one cell, but only if it still holds `expected` (what the CRM showed).
 * If someone changed it in Google Sheets meanwhile, nothing is written.
 */
export async function updatePipelineCell(
  cfg: SheetsConfig,
  rowNumber: number,
  column: number,
  value: string,
  expected: string,
): Promise<{ ok: true } | { ok: false; conflict: true; current: string }> {
  const title = await tabTitle(cfg);
  const a1 = `${columnLetter(column)}${rowNumber}`;
  const [now, formula] = await Promise.all([
    api<{ values?: string[][] }>(cfg, `/values/${range(title, a1)}?valueRenderOption=FORMATTED_VALUE`),
    api<{ values?: string[][] }>(cfg, `/values/${range(title, a1)}?valueRenderOption=FORMULA`),
  ]);
  const current = String(now.values?.[0]?.[0] ?? '');
  if (String(formula.values?.[0]?.[0] ?? '').startsWith('=')) throw new SheetsError('That cell is a formula; change it in Google Sheets.');
  if (current.trim() !== expected.trim()) return { ok: false, conflict: true, current };
  await api(cfg, `/values/${range(title, a1)}?valueInputOption=USER_ENTERED`, {
    method: 'PUT',
    body: JSON.stringify({ values: [[value]] }),
  });
  return { ok: true };
}

/** Add a row at the bottom of the table. */
export async function appendPipelineRow(cfg: SheetsConfig, values: string[]): Promise<void> {
  const title = await tabTitle(cfg);
  await api(cfg, `/values/${range(title, `A1:${MAX_COLS}`)}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`, {
    method: 'POST',
    body: JSON.stringify({ values: [values] }),
  });
}
