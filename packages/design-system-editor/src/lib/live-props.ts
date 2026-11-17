/**
 * Live props: controls for a component's declared props, their starting
 * values, and the frame script that renders the component from the
 * bundle with them (re-rendering on each change, without a reload). Pure.
 */

import type { PropInfo } from '@open-artifact/design-system-core';

/** The control of one prop. */
export type PropControl =
  | { kind: 'boolean' }
  | { kind: 'number' }
  | { kind: 'text'; multiline?: boolean }
  | { kind: 'select'; options: (string | number | boolean)[] }
  | { kind: 'json' };

/** Splits a union type on its top-level `|`. */
function unionMembers(type: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let quote: string | null = null;
  let current = '';
  for (const char of type) {
    if (quote) {
      current += char;
      if (char === quote) quote = null;
      continue;
    }
    if (char === '"' || char === "'" || char === '`') quote = char;
    else if ('([{<'.includes(char)) depth++;
    else if (')]}>'.includes(char)) depth--;
    if (char === '|' && depth === 0) {
      out.push(current.trim());
      current = '';
      continue;
    }
    current += char;
  }
  if (current.trim()) out.push(current.trim());
  return out.filter(Boolean);
}

/** A literal type's value (`'primary'`, `2`, `true`), or `undefined`. */
function literal(member: string): string | number | boolean | undefined {
  const quoted = /^(['"`])(.*)\1$/.exec(member);
  if (quoted) return quoted[2];
  if (/^-?\d+(\.\d+)?$/.test(member)) return Number(member);
  if (member === 'true') return true;
  if (member === 'false') return false;
  return undefined;
}

/** The control for a prop; `null` for functions, refs and other values a form cannot make. */
export function controlFor(prop: Pick<PropInfo, 'name' | 'type'>): PropControl | null {
  const members = unionMembers(prop.type.replace(/\s+/g, ' ')).filter((member) => member !== 'undefined' && member !== 'null');
  if (!members.length) return null;
  if (members.some((member) => /=>|^\(?\s*\(|Ref\b|^Function$|Event\b|Handler\b/.test(member))) return null;
  if (members.every((member) => member === 'boolean' || member === 'true' || member === 'false')) return { kind: 'boolean' };
  const literals = members.map(literal);
  if (literals.every((value) => value !== undefined)) return { kind: 'select', options: literals as (string | number | boolean)[] };
  if (members.length === 1 && members[0] === 'number') return { kind: 'number' };
  if (members.every((member) => member === 'string' || literal(member) !== undefined)) return { kind: 'text' };
  if (members.some((member) => /^(React\.)?(ReactNode|ReactElement|ReactChild|JSX\.Element)$/.test(member))) return { kind: 'text', multiline: prop.name === 'children' };
  if (members.every((member) => /^[\w.]+\[\]$|^Array<|^\{|^Record</.test(member))) return { kind: 'json' };
  return null;
}

/** A `@default` value as the control holds it. */
export function parseDefault(control: PropControl, text: string | undefined): unknown {
  if (text === undefined) return undefined;
  const value = text.trim();
  switch (control.kind) {
    case 'boolean':
      return value === 'true' ? true : value === 'false' ? false : undefined;
    case 'number': {
      const n = Number(value);
      return Number.isFinite(n) ? n : undefined;
    }
    case 'select': {
      const lit = literal(value);
      return lit !== undefined && control.options.includes(lit) ? lit : control.options.includes(value) ? value : undefined;
    }
    case 'text':
      return literal(value) ?? value;
    case 'json':
      try {
        return JSON.parse(value) as unknown;
      } catch {
        return undefined;
      }
  }
}

/** The props a live preview starts with: defaults, and something to show for required text and choices. */
export function initialProps(props: readonly PropInfo[]): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const prop of props) {
    const control = controlFor(prop);
    if (!control) continue;
    const value = parseDefault(control, prop.defaultValue);
    if (value !== undefined) out[prop.name] = value;
    else if (prop.name === 'children' && control.kind === 'text') out.children = 'Label';
    else if (!prop.optional) {
      if (control.kind === 'select') out[prop.name] = control.options[0];
      else if (control.kind === 'text') out[prop.name] = prop.name.charAt(0).toUpperCase() + prop.name.slice(1);
      else if (control.kind === 'boolean') out[prop.name] = false;
      else if (control.kind === 'number') out[prop.name] = 0;
    }
  }
  return out;
}

/**
 * The frame's script: renders `window[namespace][component]` with the
 * props into `#root`, and again whenever the page posts
 * `{openArtifactProps: {...}}`. Reports failures as preview errors.
 */
export function liveScript(namespace: string, component: string, props: Record<string, unknown>, id: string): string {
  const json = (value: unknown): string => JSON.stringify(value).replace(/</g, '\\u003c');
  return `<script>(function(){
var ns=${json(namespace)},name=${json(component)},id=${json(id)},root=document.getElementById('root'),handle=null;
function fail(m){try{parent.postMessage({openArtifactPreviewError:String(m).slice(0,600),id:id},'*')}catch(e){}}
function render(p){
  var R=window.React,D=window.ReactDOM,lib=window[ns],C=lib&&lib[name];
  if(!R||!D){fail('React is not loaded: the system lists no React library.');return}
  if(!C){fail(name+' is not on window.'+ns+'.');return}
  try{var el=R.createElement(C,p);
    if(D.createRoot){handle=handle||D.createRoot(root);handle.render(el)}else{D.render(el,root)}
  }catch(e){fail(e&&e.message||e)}
}
addEventListener('message',function(e){var d=e.data;if(e.source===parent&&d&&d.id===id&&d.openArtifactProps)render(d.openArtifactProps)});
render(${json(props)});
})();</script>`;
}
