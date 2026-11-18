import { useEffect, useMemo, useRef, useState, type ReactElement, type ReactNode } from 'react';
import { Download, Expand } from 'lucide-react';
import { saveFile } from '@open-artifact/editor-kit';
import { Dialog, IconButton, cn, toast } from '@open-artifact/ui';
import {
  cellToString,
  getNonemptyTable,
  isPlainObject,
  type Dataset,
  type DatasetRun,
  type ResultMetadata as ResultMetadataEntry,
  type Table,
  type UnknownRecord,
} from '@open-artifact/data-core';
import { maybeSession } from '../services/session.ts';
import { CODE_BOX_CLASS, CollapsibleCodeBlock, CopyButton, HighlightedCode, LabeledField } from './code.tsx';
import {
  MAX_RECORD_DEPTH,
  asDisplayedRecord,
  copyableResultText,
  createCsvDownload,
  describeTableResult,
  getCommonColumnPrefix,
  getInlineValueText,
  getNumericColumns,
  getSingleRowRecord,
  hasLineBreak,
  isShortSingleLineValue,
  summarizeNestedValue,
  type ResultHighlightTarget,
  type ShownDatasetResult,
} from './result.ts';
import {
  DOWNLOADED_MESSAGE,
  DOWNLOAD_FAILED_MESSAGE,
  DOWNLOAD_LABEL,
  EXPAND_LABEL,
  RESULT_ROWS_LABEL,
  SHOW_MORE_LABEL,
  TEST_RESULT_LABEL,
  copyNamedLabel,
  copyResultLabel,
  downloadSourceLabel,
  expandNamedLabel,
  expandResultLabel,
  resultOfLabel,
  testResultNoteLabel,
} from './words.ts';

const ROWS_PER_PAGE = 200;
const WIDE_DIALOG_CLASS = 'w-[min(56rem,calc(100vw-2rem))]! max-h-[calc(100dvh-2rem)] flex flex-col';

/** Saves a source's rows as CSV through the host's downloads. */
export async function downloadCsv(filename: string, text: string): Promise<void> {
  try {
    await saveFile(maybeSession()?.downloads, filename, new Blob([text], { type: 'text/csv;charset=utf-8' }));
    toast.add({ title: DOWNLOADED_MESSAGE });
  } catch {
    toast.add({ title: DOWNLOAD_FAILED_MESSAGE });
  }
}

function pickedCell(target: ResultHighlightTarget): { row?: number; field?: string } | null {
  return target !== null && typeof target === 'object' && !('entry' in target) ? target : null;
}

export interface ResultTableProps {
  table: Table;
  target?: ResultHighlightTarget;
  /** The namespace every column shares, left out of the headers. */
  prefix?: string;
}

/** A result's rows; a picked row or cell is ringed and scrolled into view. */
export function ResultTable({ table, target = null, prefix = '' }: ResultTableProps): ReactElement {
  const numeric = useMemo(() => getNumericColumns(table), [table]);
  const pick = pickedCell(target);
  const [shown, setShown] = useState(() => Math.max(ROWS_PER_PAGE, (pick?.row ?? 0) + 1));
  const ref = useRef<HTMLTableElement | null>(null);
  useEffect(() => {
    ref.current?.querySelector('[data-picked]')?.scrollIntoView?.({ block: 'center', inline: 'center' });
  }, [pick?.row, pick?.field]);
  const rows = table.rows.slice(0, shown);
  return (
    <>
      <table ref={ref} className="w-full border-collapse text-xs">
        <thead className="sticky top-0 bg-surface-2">
          <tr>
            {table.columns.map((column) => (
              <th
                key={column}
                scope="col"
                data-picked={pick?.field === column && pick.row === undefined ? '' : undefined}
                className={cn(
                  'whitespace-nowrap border-b border-line px-2 py-1 font-medium text-fg-muted',
                  numeric.has(column) ? 'text-right' : 'text-left',
                )}
              >
                {prefix !== '' && column.startsWith(prefix) ? column.slice(prefix.length) : column}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => {
            const rowPicked = pick !== null && pick.row === index;
            return (
              <tr key={index} data-picked={rowPicked && pick.field === undefined ? '' : undefined} className={cn(rowPicked && 'bg-accent-soft')}>
                {table.columns.map((column) => {
                  const cellPicked = pick !== null && pick.field === column && (pick.row === undefined || rowPicked);
                  return (
                    <td
                      key={column}
                      data-picked={cellPicked && pick.row !== undefined ? '' : undefined}
                      className={cn(
                        'max-w-80 truncate border-b border-line px-2 py-1 text-fg',
                        numeric.has(column) && 'text-right tabular-nums',
                        cellPicked && 'outline-2 -outline-offset-2 outline-accent',
                      )}
                    >
                      {cellToString(row[column])}
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
      {table.rows.length > shown ? (
        <button type="button" className="px-2 py-1 text-xs text-accent hover:underline" onClick={() => setShown(shown + ROWS_PER_PAGE)}>
          {SHOW_MORE_LABEL}
        </button>
      ) : null}
    </>
  );
}

function RecordEntry({ name, picked, listed, children }: { name: string; picked: boolean; listed: boolean; children: ReactNode }): ReactElement {
  const Key = listed ? 'dt' : 'div';
  const Value = listed ? 'dd' : 'div';
  return (
    <div data-record-entry="" data-picked={picked ? '' : undefined} className={cn('flex min-w-0 flex-col gap-0.5 py-1', picked && 'rounded bg-accent-soft px-1')}>
      <Key className="text-xs text-fg-muted [overflow-wrap:anywhere]">{name}</Key>
      <Value className="m-0 min-w-0 text-[13px] text-fg [overflow-wrap:anywhere]">{children}</Value>
    </div>
  );
}

function NestedValue({ value, depth }: { value: unknown; depth: number }): ReactElement {
  const table = getNonemptyTable(value);
  if (table !== null)
    return (
      <div className="max-h-80 overflow-auto rounded-control border border-line">
        <ResultTable table={table} />
      </div>
    );
  if (isPlainObject(value) && depth < MAX_RECORD_DEPTH) return <RecordView value={value} depth={depth + 1} />;
  return (
    <CollapsibleCodeBlock label={summarizeNestedValue(value as object, null)} unwrapped>
      <HighlightedCode code={JSON.stringify(value, null, 2) ?? ''} lang="json" />
    </CollapsibleCodeBlock>
  );
}

function ExpandableRecordEntry({ name, value, depth, picked }: { name: string; value: object; depth: number; picked: boolean }): ReactElement {
  const [open, setOpen] = useState(picked);
  const summary = summarizeNestedValue(value, getNonemptyTable(value));
  return (
    <div data-record-entry="" data-picked={picked ? '' : undefined} className={cn('flex min-w-0 flex-col gap-1 py-1', picked && 'rounded bg-accent-soft px-1')}>
      <button
        type="button"
        aria-expanded={open}
        aria-label={`${name}: ${summary}`}
        className="flex items-center justify-between gap-2 text-left text-[13px]"
        onClick={() => setOpen(!open)}
      >
        <span className="text-xs text-fg-muted [overflow-wrap:anywhere]">{name}</span>
        <span className="text-fg">{summary}</span>
      </button>
      {open ? (
        <div className="pl-2">
          <NestedValue value={value} depth={depth} />
        </div>
      ) : null}
    </div>
  );
}

export interface RecordViewProps {
  value: UnknownRecord;
  keys?: readonly string[];
  depth?: number;
  picked?: string | null;
  prefix?: string;
  /** The record is a numbered list: short values show as a table of two columns. */
  numbered?: boolean;
}

/** A record's entries: short values inline, long text in a code block, nested values to expand. */
export function RecordView({ value, keys, depth = 0, picked = null, prefix = '', numbered = false }: RecordViewProps): ReactElement {
  const names = keys ?? Object.keys(value);
  const label = (name: string): string => (prefix !== '' && name.startsWith(prefix) ? name.slice(prefix.length) : name);
  const inline = names.filter((name) => getInlineValueText(value[name]) !== null);
  const nested = names.filter((name) => getInlineValueText(value[name]) === null);
  const short = inline.every((name) => isShortSingleLineValue(getInlineValueText(value[name]) ?? ''));
  return (
    <div className="flex min-w-0 flex-col">
      {numbered && short && inline.length > 0 ? (
        <table className="w-full border-collapse text-[13px]">
          <tbody>
            {inline.map((name) => (
              <tr key={name} data-record-entry="" data-picked={picked === name ? '' : undefined} className={cn(picked === name && 'bg-accent-soft')}>
                <th scope="row" className="w-10 border-b border-line px-2 py-1 text-right text-xs font-normal text-fg-muted">
                  {label(name)}
                </th>
                <td className="border-b border-line px-2 py-1 text-fg [overflow-wrap:anywhere]">{getInlineValueText(value[name])}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : inline.length > 0 ? (
        <dl className="m-0 flex flex-col">
          {inline.map((name) => {
            const text = getInlineValueText(value[name]) ?? '';
            return (
              <RecordEntry key={name} name={label(name)} picked={picked === name} listed>
                {hasLineBreak(text) ? (
                  <CollapsibleCodeBlock label={label(name)}>{text}</CollapsibleCodeBlock>
                ) : (
                  text
                )}
              </RecordEntry>
            );
          })}
        </dl>
      ) : null}
      {nested.map((name) => (
        <ExpandableRecordEntry key={name} name={label(name)} value={value[name] as object} depth={depth} picked={picked === name} />
      ))}
    </div>
  );
}

function ResultValue({ data, keys, text, target, prefix = '' }: { data: unknown; keys?: readonly string[]; text: string; target: ResultHighlightTarget; prefix?: string }): ReactElement {
  const ref = useRef<HTMLDivElement | null>(null);
  const entry = target !== null && typeof target === 'object' && 'entry' in target ? target.entry : null;
  useEffect(() => {
    ref.current?.querySelector('[data-record-entry][data-picked]')?.scrollIntoView?.({ block: 'center' });
  }, [entry]);
  const record = asDisplayedRecord(data);
  return (
    <div ref={ref} className="min-w-0">
      {record !== null ? (
        <RecordView value={record} {...(keys === undefined ? {} : { keys })} picked={entry} prefix={prefix} numbered={Array.isArray(data)} />
      ) : (
        <div className={cn('whitespace-pre-wrap text-[13px] text-fg [overflow-wrap:anywhere]', target === 'value' && 'rounded bg-accent-soft px-1')}>{text}</div>
      )}
    </div>
  );
}

function ResultPrefix({ prefix }: { prefix: string }): ReactElement | null {
  return prefix === '' ? null : <p className="px-2 pt-1 text-xs text-fg-muted">{prefix}</p>;
}

function ResultBody({ shown, target, wide = false }: { shown: ShownDatasetResult; target: ResultHighlightTarget; wide?: boolean }): ReactElement {
  const { table, data, text } = shown;
  const record = getSingleRowRecord(table);
  const rows = record === null ? table : null;
  const prefix = table === null ? '' : getCommonColumnPrefix(table.columns);
  return (
    <div className={cn('min-w-0 rounded-control', target === 'body' && 'outline-2 outline-accent')}>
      {rows !== null ? (
        <div tabIndex={0} role="region" aria-label={RESULT_ROWS_LABEL} className={cn('overflow-auto rounded-control border border-line', wide ? 'max-h-[70dvh]' : 'max-h-96')}>
          <ResultPrefix prefix={prefix} />
          <ResultTable table={rows} target={target} prefix={prefix} />
        </div>
      ) : null}
      {record !== null && table !== null ? (
        <div tabIndex={0} role="region" aria-label={RESULT_ROWS_LABEL} className="min-w-0">
          <ResultPrefix prefix={prefix} />
          <ResultValue data={record} keys={table.columns} text="" target={target} prefix={prefix} />
        </div>
      ) : null}
      {table === null && data !== undefined && text !== null ? <ResultValue data={data} text={text} target={target} /> : null}
    </div>
  );
}

export interface DatasetResultProps {
  ds: Dataset;
  run: DatasetRun;
  shown: ShownDatasetResult;
  caption: string;
  target: ResultHighlightTarget;
  /** The file's Edit button, for an editor. */
  edit?: ReactNode;
}

/** A source's result: its rows or value, with Copy, Download (rows as CSV) and Expand. */
export function DatasetResult({ ds, run, shown, caption, target, edit }: DatasetResultProps): ReactElement {
  const name = ds.title || ds.id;
  const { table, text } = shown;
  const rows = getSingleRowRecord(table) === null ? table : null;
  const download = table === null ? null : createCsvDownload(ds.id, table);
  const refreshing = run.status === 'running';
  const [expanded, setExpanded] = useState(false);
  const fileName = ds.source.kind === 'file' ? ds.source.name : null;
  const verbs = (
    <>
      <CopyButton text={() => copyableResultText(table, text)} label={copyResultLabel(name)} />
      {download === null ? null : (
        <IconButton
          size="sm"
          label={DOWNLOAD_LABEL}
          aria-label={downloadSourceLabel(name)}
          icon={<Download className="size-3.5" />}
          onClick={() => void downloadCsv(download.filename, download.text())}
        />
      )}
    </>
  );
  const strip = (whole: boolean, extra?: ReactNode): ReactElement => (
    <div className="flex min-h-7 min-w-0 items-center gap-1">
      <span className={cn('min-w-0 flex-1 text-xs text-fg-muted', whole ? '[overflow-wrap:anywhere]' : 'truncate')} title={whole ? undefined : (fileName ?? undefined)}>
        {fileName}
      </span>
      <span className="flex flex-none items-center gap-0.5">{extra}</span>
    </div>
  );
  return (
    <section aria-label={resultOfLabel(name)} data-refreshing={refreshing ? '' : undefined} className={cn('flex min-w-0 flex-col gap-1', refreshing && 'opacity-70')}>
      {strip(
        false,
        <>
          {rows !== null && rows.rows.length > 0 ? (
            <IconButton size="sm" label={EXPAND_LABEL} aria-label={expandResultLabel(name)} aria-haspopup="dialog" icon={<Expand className="size-3.5" />} onClick={() => setExpanded(true)} />
          ) : null}
          {verbs}
          {edit}
        </>,
      )}
      <ResultBody shown={shown} target={target} />
      {caption === '' ? null : <p className="text-xs text-fg-muted [overflow-wrap:anywhere]">{caption}</p>}
      {rows === null ? null : (
        <Dialog
          open={expanded}
          onOpenChange={setExpanded}
          title={name}
          description={ds.description === '' ? undefined : <span className="line-clamp-3 whitespace-pre-line">{ds.description}</span>}
          className={WIDE_DIALOG_CLASS}
        >
          <section aria-label={resultOfLabel(name)} className="flex min-h-0 flex-col gap-1">
            {strip(true, verbs)}
            <ResultBody shown={shown} target={target} wide />
            {caption === '' ? null : <p className="text-xs text-fg-muted">{caption}</p>}
          </section>
        </Dialog>
      )}
    </section>
  );
}

/** What a test run returned (not saved). */
export function QueryTestResult({ table, stale }: { table: Table; stale: boolean }): ReactElement {
  const ref = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const active = document.activeElement;
    if (active === null || active === document.body || !active.matches(':disabled')) return;
    ref.current?.focus();
  }, [table]);
  return (
    <div ref={ref} tabIndex={-1} aria-label={TEST_RESULT_LABEL} className={cn('outline-none', stale && 'opacity-60')}>
      <LabeledField label={TEST_RESULT_LABEL} note={testResultNoteLabel(describeTableResult(table), stale)}>
        <div className="max-h-64 overflow-auto rounded-control border border-line">
          <ResultTable table={table} />
        </div>
      </LabeledField>
    </div>
  );
}

/** Code a result's metadata carries: in a block, with Expand (a dialog) and Copy. */
export function CodeMetadataField({ label, code, copyLabel, lang = null }: { label: string; code: string; copyLabel: string; lang?: string | null }): ReactElement {
  const [open, setOpen] = useState(false);
  const highlighted = <HighlightedCode code={code} lang={lang} laidOut />;
  return (
    <LabeledField
      label={label}
      end={
        <>
          <IconButton size="sm" label={expandNamedLabel(label)} aria-haspopup="dialog" icon={<Expand className="size-3.5" />} onClick={() => setOpen(true)} />
          <CopyButton text={code} label={copyLabel} />
        </>
      }
    >
      <CollapsibleCodeBlock label={label} unwrapped={code.includes('\n')}>
        {highlighted}
      </CollapsibleCodeBlock>
      <Dialog open={open} onOpenChange={setOpen} title={label} className={WIDE_DIALOG_CLASS}>
        <pre tabIndex={0} role="region" aria-label={label} className={cn(CODE_BOX_CLASS, 'm-0 min-h-0 overflow-auto whitespace-pre')}>
          {highlighted}
        </pre>
      </Dialog>
    </LabeledField>
  );
}

function MetadataFacts({ rows }: { rows: readonly (readonly [string, string])[] }): ReactElement {
  return (
    <dl className="m-0 grid grid-cols-[minmax(0,auto)_minmax(0,1fr)] gap-x-3 gap-y-1 text-[13px]">
      {rows.map(([label, value], index) => (
        <div key={index} className="contents">
          <dt className="text-fg-muted [overflow-wrap:anywhere]">{label}</dt>
          <dd className="m-0 text-fg [overflow-wrap:anywhere]">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

/** A result's metadata: facts as a list, code in blocks of their own. */
export function ResultMetadata({ meta }: { meta: readonly ResultMetadataEntry[] }): ReactElement {
  const facts = meta.filter((entry) => entry.type !== 'code');
  return (
    <>
      {facts.length > 0 ? <MetadataFacts rows={facts.map((entry) => [entry.label, entry.value] as const)} /> : null}
      {meta.map((entry, index) =>
        entry.type === 'code' ? (
          <CodeMetadataField key={index} label={entry.label} code={entry.value} copyLabel={copyNamedLabel(entry.label)} lang={entry.lang ?? null} />
        ) : null,
      )}
    </>
  );
}

