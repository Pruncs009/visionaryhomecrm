/** The team's KPI Google Sheet (from its URL: /d/<id>/edit#gid=<tab>). */
export const KPI_SHEET = {
  id: '1wY_zWuoYzCv3TcZLKTsKTqLObtNblxPdCfP8jWjKvj4',
  /** The tab the KPI Dashboard page opens on. */
  gid: '2030718027',
} as const;

/**
 * Quarter tabs ("Q1 - 2026" …) if the tab list can't be read from Google.
 * Normally they're discovered from the sheet, so a new "Q1 - 2027" tab shows up by itself.
 */
export const FALLBACK_QUARTER_TABS: { quarter: number; year: number; gid: string }[] = [
  { quarter: 1, year: 2026, gid: '1991268088' },
  { quarter: 2, year: 2026, gid: '1918203708' },
  { quarter: 3, year: 2026, gid: '1909876279' },
  { quarter: 4, year: 2026, gid: '2030718027' },
];

export const kpiSheetUrlFor = (gid: string) => `https://docs.google.com/spreadsheets/d/${KPI_SHEET.id}/edit#gid=${gid}`;
export const kpiSheetUrl = kpiSheetUrlFor(KPI_SHEET.gid);
/** Read-only CSV of one tab. Works because the sheet can be viewed by anyone with the link. */
export const kpiCsvUrlFor = (gid: string) => `https://docs.google.com/spreadsheets/d/${KPI_SHEET.id}/export?format=csv&gid=${gid}`;
/** Public page that lists the sheet's tabs (names and gids). */
export const kpiTabsUrl = `https://docs.google.com/spreadsheets/d/${KPI_SHEET.id}/htmlview`;
