/** The team's KPI Google Sheet (from its URL: /d/<id>/edit#gid=<tab>). */
export const KPI_SHEET = {
  id: '1wY_zWuoYzCv3TcZLKTsKTqLObtNblxPdCfP8jWjKvj4',
  gid: '2030718027',
} as const;

export const kpiSheetUrl = `https://docs.google.com/spreadsheets/d/${KPI_SHEET.id}/edit#gid=${KPI_SHEET.gid}`;
/** Read-only CSV of the KPI tab. Works because the sheet can be viewed by anyone with the link. */
export const kpiCsvUrl = `https://docs.google.com/spreadsheets/d/${KPI_SHEET.id}/export?format=csv&gid=${KPI_SHEET.gid}`;
