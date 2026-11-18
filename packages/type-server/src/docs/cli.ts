/**
 * The agent's commands on a doc, as a command line gives them: each becomes one of the doc's actions (`actions.ts`)
 * with its JSON, files and stdin read here, so the action can run on the server or on the folder alike.
 *
 *     create <dir> <birth> | --markdown <file> [--name n]
 *     read   <dir> [<tab> [--view | --parent <id> | --since <rev> | --at <rev> | --search <text> | --markdown | --history | --suggestions]] [--json]
 *     read   <dir> <call>
 *     update <dir> <call> [--tab t] [--compact]
 *     batch  <dir> <call> [--compact]
 *     delete <dir> <call>
 *     export <dir> [--tab t] [--format markdown|docx|pdf|html] [--paper a4|letter] [--out file]
 *     import <dir> <file> [--name n]
 */
import fs from 'node:fs';
import path from 'node:path';
import type { DocActionName } from './actions.ts';

type Json = Record<string, unknown>;

export const DOCS_COMMANDS = ['create', 'read', 'update', 'batch', 'delete', 'export', 'import'] as const satisfies readonly DocActionName[];

export type DocsCommand = (typeof DOCS_COMMANDS)[number];

export const isDocsCommand = (name: string): name is DocsCommand => (DOCS_COMMANDS as readonly string[]).includes(name);

/** A command given wrong (exit 2): nothing was sent. */
export class DocsCommandError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
  }
}

/** How an answer is printed: JSON, one-line JSON, or a read's JSON line followed by its XML or markdown as it is. */
export type DocOutput = 'json' | 'compact' | 'raw';

export interface DocCommand {
  name: DocsCommand;
  args: Json;
  output: DocOutput;
}

/** Flags that take no value. */
const SWITCHES = new Set(['view', 'markdown', 'history', 'suggestions', 'json', 'compact']);

const isRecord = (value: unknown): value is Json => typeof value === 'object' && value !== null && !Array.isArray(value);

function splitArgs(argv: readonly string[]): { words: string[]; flags: Map<string, string> } {
  const words: string[] = [];
  const flags = new Map<string, string>();
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    if (arg.startsWith('--') && arg.length > 2) {
      const eq = arg.indexOf('=');
      if (eq > 0) flags.set(arg.slice(2, eq), arg.slice(eq + 1));
      else if (!SWITCHES.has(arg.slice(2)) && i + 1 < argv.length && !argv[i + 1]!.startsWith('--')) flags.set(arg.slice(2), argv[++i]!);
      else flags.set(arg.slice(2), 'true');
    } else words.push(arg);
  }
  return { words, flags };
}

const readStdin = (): string => fs.readFileSync(0, 'utf8');

/** A call given on the command line: `-` (stdin), a JSON file, or the JSON itself. */
function jsonArg(given: string | undefined, what: string): unknown {
  if (given === undefined) throw new DocsCommandError('MISSING_CALL', `Give the ${what}: a JSON file, - to read it from stdin, or the JSON itself.`);
  let text: string;
  if (given === '-') text = readStdin();
  else if (/^\s*[[{]/.test(given)) text = given;
  else {
    try {
      text = fs.readFileSync(path.resolve(given), 'utf8');
    } catch {
      throw new DocsCommandError('FILE_NOT_FOUND', `No such file: ${given}`);
    }
  }
  try {
    return JSON.parse(text) as unknown;
  } catch (error) {
    throw new DocsCommandError('INVALID_JSON', `The ${what} is not JSON: ${(error as Error).message}`);
  }
}

const looksLikeCall = (arg: string | undefined) => arg !== undefined && (arg === '-' || /^\s*[[{]/.test(arg) || /\.json$/i.test(arg));

/** The format a file's name says. */
function formatOfFile(file: string): string | undefined {
  const ext = path.extname(file).toLowerCase();
  if (ext === '.md' || ext === '.markdown') return 'markdown';
  if (ext === '.docx') return 'docx';
  if (ext === '.pdf') return 'pdf';
  if (ext === '.html' || ext === '.htm') return 'html';
  return undefined;
}

function revisionOf(given: string | undefined, flag: string): number {
  const rev = Number(given);
  if (!Number.isInteger(rev) || rev < 0) throw new DocsCommandError('NOT_A_REVISION', `--${flag} takes a revision: 0, 1, 2, …`);
  return rev;
}

/** The action a command line asks for. */
export function docCommandOf(command: DocsCommand, argv: readonly string[]): DocCommand {
  const { words, flags } = splitArgs(argv);
  const output: DocOutput = flags.has('json') ? 'json' : flags.has('compact') ? 'compact' : 'json';
  switch (command) {
    case 'create': {
      if (flags.has('markdown')) {
        // --markdown is also read's switch, so its file arrives as the next word.
        const from = flags.get('markdown') === 'true' ? words[0] : flags.get('markdown');
        if (from === undefined) throw new DocsCommandError('MISSING_MARKDOWN', '--markdown takes a file (or - for stdin).');
        let markdown: string;
        try {
          markdown = from === '-' ? readStdin() : fs.readFileSync(path.resolve(from), 'utf8');
        } catch {
          throw new DocsCommandError('FILE_NOT_FOUND', `No such file: ${from}`);
        }
        const name = flags.get('name') ?? /^#\s+(.+)$/m.exec(markdown)?.[1]?.trim();
        if (!name) throw new DocsCommandError('MISSING_NAME', 'Give the doc a name with --name (or start the markdown with a # title).');
        return { name: command, args: { call: { name, doc: { markdown } } }, output };
      }
      return { name: command, args: { call: jsonArg(words[0], 'birth call') }, output };
    }
    case 'read': {
      const raw: DocOutput = flags.has('json') ? 'json' : 'raw';
      const [first] = words;
      if (looksLikeCall(first)) {
        const given = jsonArg(first, 'read call');
        return { name: command, args: { call: isRecord(given) ? given : {} }, output: raw };
      }
      const tab = first ?? flags.get('tab');
      const shaped = ['view', 'parent', 'since', 'search', 'markdown', 'at', 'history', 'suggestions'].some((flag) => flags.has(flag));
      if (tab === undefined && !shaped) return { name: command, args: { call: {} }, output: 'json' };
      const payload: Json = { kind: 'outline' };
      if (flags.has('search')) Object.assign(payload, { kind: 'search', text: flags.get('search') });
      else if (flags.has('markdown')) payload.kind = 'markdown';
      else if (flags.has('history')) payload.kind = 'history';
      else if (flags.has('suggestions')) payload.kind = 'suggestions';
      else if (flags.has('view') || flags.has('parent') || flags.has('since') || flags.has('at')) {
        payload.kind = 'view';
        if (flags.has('parent')) payload.parentId = flags.get('parent');
        if (flags.has('since')) payload.sinceRev = revisionOf(flags.get('since'), 'since');
        if (flags.has('at')) payload.atRev = revisionOf(flags.get('at'), 'at');
      }
      return { name: command, args: { call: { ref: { object: 'node', id: tab ?? '' }, payload } }, output: raw };
    }
    case 'update': {
      const given = jsonArg(words[0], 'update call');
      if (!isRecord(given)) throw new DocsCommandError('INVALID_CALL', 'An update is a JSON object: {ref, payload: {ops}} (or {tab?, ops} for a tab body).');
      if (isRecord(given.ref)) return { name: command, args: { call: given }, output };
      const payload = isRecord(given.payload) ? given.payload : given;
      const tab = typeof given.tab === 'string' ? given.tab : (flags.get('tab') ?? '');
      const { tab: _tab, ...rest } = payload;
      return { name: command, args: { call: { ref: { object: 'node', id: tab }, payload: rest } }, output };
    }
    case 'batch': {
      const given = jsonArg(words[0], 'batch');
      const call = Array.isArray(given) ? { batch: given } : isRecord(given) ? given : null;
      if (!call) throw new DocsCommandError('INVALID_CALL', 'A batch is {batch: [members]} or the array of members.');
      return { name: command, args: { call }, output };
    }
    case 'delete': {
      const given = jsonArg(words[0], 'delete call');
      if (!isRecord(given)) throw new DocsCommandError('INVALID_CALL', 'A delete call is a JSON object: {ref: {object: "file", id}}.');
      return { name: command, args: { call: given }, output };
    }
    case 'export': {
      const out = flags.get('out');
      const format = flags.get('format') ?? (out ? formatOfFile(out) : undefined) ?? 'markdown';
      return {
        name: command,
        args: {
          format,
          ...(flags.has('tab') ? { tab: flags.get('tab') } : {}),
          ...(flags.has('paper') ? { paper: flags.get('paper') } : {}),
          ...(out ? { out: path.resolve(out) } : {}),
        },
        output: 'compact',
      };
    }
    case 'import': {
      const file = words[0];
      if (!file) throw new DocsCommandError('MISSING_FILE', 'Give the file to import: a .md, .docx or .pdf.');
      return { name: command, args: { file: path.resolve(file), ...(flags.has('name') ? { name: flags.get('name') } : {}) }, output: 'json' };
    }
  }
}

/** Prints an answer and returns the exit code: 0, or 1 when the doc refused the call (nothing was written). */
export function printDocAnswer(command: DocCommand, body: Json): number {
  const ok = body.ok === true;
  const write = (text: string) => process.stdout.write(text.endsWith('\n') ? text : `${text}\n`);
  if (ok && command.name === 'export' && typeof body.markdown === 'string') {
    write(body.markdown);
    return 0;
  }
  if (ok && command.output === 'raw' && (typeof body.xml === 'string' || typeof body.markdown === 'string')) {
    const { xml, markdown, ...rest } = body;
    write(JSON.stringify(rest));
    write(String(xml ?? markdown));
    return 0;
  }
  write(command.output === 'compact' ? JSON.stringify(body) : JSON.stringify(body, null, 2));
  return ok ? 0 : 1;
}
