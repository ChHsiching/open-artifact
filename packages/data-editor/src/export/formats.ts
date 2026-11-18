import type { ChromeReport } from '@open-artifact/runtime';

export type ChromeFormat = NonNullable<ChromeReport['formats']>[number];

export type DashboardExportFormat = 'pdf' | 'html' | 'json';

export const DASHBOARD_EXPORT_FORMATS: readonly DashboardExportFormat[] = ['pdf', 'html', 'json'];

export const DASHBOARD_EXPORT_LABELS: Readonly<Record<DashboardExportFormat, { label: string; description: string }>> = {
  pdf: { label: 'PDF', description: 'Print the dashboard, or save it as a PDF, in the light look.' },
  html: { label: 'Web page (HTML)', description: 'A copy of the page as it shows now. Its numbers do not update.' },
  json: { label: 'Sources and page (JSON)', description: 'Where each number comes from, the filters in effect, and a copy of the page.' },
};

/** Whether the page can be exported now, and why not. */
export interface DashboardExportAvailability {
  ready: boolean;
  why?: ChromeFormat['why'];
  reason?: string;
}

export const isDashboardExportFormat = (format: string): format is DashboardExportFormat =>
  (DASHBOARD_EXPORT_FORMATS as readonly string[]).includes(format);

/** The formats as the Shell lists them, disabled (with why) while the page can't be exported. */
export function dashboardChromeFormats(
  availability: DashboardExportAvailability,
  offered: readonly DashboardExportFormat[] = DASHBOARD_EXPORT_FORMATS,
): ChromeFormat[] {
  const state: Partial<ChromeFormat> = availability.ready
    ? {}
    : {
        disabled: true,
        ...(availability.why === undefined ? {} : { why: availability.why }),
        ...(availability.reason === undefined ? {} : { disabledReason: availability.reason }),
      };
  return offered.map((format) => ({
    format,
    ...DASHBOARD_EXPORT_LABELS[format],
    ...(format === 'pdf' ? { more: true } : {}),
    ...state,
  }));
}
