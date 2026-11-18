/**
 * Components: a card per component with its live preview, its README
 * (editable in place) and the props read from its type declaration.
 */

import { Bot, RotateCcw, SlidersHorizontal } from 'lucide-react';
import { useMemo, useState } from 'react';
import { componentProps, type ComponentInfo, type PropInfo } from '@open-artifact/design-system-core';
import { Button, CommitInput, Popover, Segmented, SelectInput, SwitchInput, TextInput } from '@open-artifact/ui';
import { controlFor, initialProps, type PropControl } from '../lib/live-props.ts';
import { CommentBadge } from '../components/Comments.tsx';
import { useFiles } from '../state/files.ts';
import { useModel } from '../state/model.ts';
import { anchorId, useView } from '../state/view.ts';
import { EditableMarkdown } from '../components/Markdown.tsx';
import { LivePropsFrame, PreviewFrame } from '../components/PreviewFrame.tsx';
import { editText } from '../services/edit.ts';
import { PageHeader, useFocusProps } from './common.tsx';
import { maybeSession } from '../services/session.ts';

/** The component's declared props (from its .d.ts or index.d.ts). */
function useDeclaredProps(name: string) {
  const own = useFiles((s) => s.texts[`components/${name}/${name}.d.ts`]);
  const shared = useFiles((s) => s.texts['components/index.d.ts']);
  return useMemo(
    () => componentProps((path) => (path === 'components/index.d.ts' ? shared : path.endsWith(`${name}.d.ts`) ? own : undefined) ?? undefined, name),
    [own, shared, name],
  );
}

/** One prop's control in the live props popover. */
function PropField({ prop, control, value, onChange }: { prop: PropInfo; control: PropControl; value: unknown; onChange(value: unknown): void }) {
  const label = `${prop.name}${prop.optional ? '' : ' *'}`;
  let field;
  switch (control.kind) {
    case 'boolean':
      field = <SwitchInput checked={value === true} onChange={(checked) => onChange(checked)} aria-label={prop.name} />;
      break;
    case 'select':
      field = (
        <SelectInput
          aria-label={prop.name}
          value={value === undefined ? '' : String(value)}
          onChange={(text) => onChange(text === '' ? undefined : control.options.find((option) => String(option) === text))}
          options={[...(prop.optional ? [{ value: '', label: '—' }] : []), ...control.options.map((option) => ({ value: String(option), label: String(option) }))]}
        />
      );
      break;
    case 'number':
      field = <TextInput type="number" aria-label={prop.name} value={value === undefined ? '' : String(value)} onChange={(event) => onChange(event.target.value === '' ? undefined : Number(event.target.value))} className="h-7 font-mono text-[12px]" />;
      break;
    case 'text':
      field = <TextInput aria-label={prop.name} value={typeof value === 'string' ? value : ''} onChange={(event) => onChange(event.target.value || undefined)} className="h-7 text-[12px]" />;
      break;
    case 'json':
      field = (
        <CommitInput
          aria-label={prop.name}
          value={value === undefined ? '' : JSON.stringify(value)}
          onCommit={(text) => {
            if (!text.trim()) return onChange(undefined);
            try {
              onChange(JSON.parse(text));
            } catch {
              // Not JSON yet: keep the last value.
            }
          }}
          className="h-7 font-mono text-[12px]"
        />
      );
      break;
  }
  return (
    <label className="grid grid-cols-[120px_minmax(0,1fr)] items-center gap-2" title={prop.doc ?? prop.type}>
      <span className="truncate font-mono text-[11px] text-fg-muted">{label}</span>
      {field}
    </label>
  );
}

/** "Try props": the component from the bundle with props set by hand; nothing is saved. */
function LiveProps({ name, props }: { name: string; props: PropInfo[] }) {
  const start = useMemo(() => initialProps(props), [props]);
  const [values, setValues] = useState<Record<string, unknown>>(start);
  const controls = props.map((prop) => ({ prop, control: controlFor(prop) }));
  const skipped = controls.filter((entry) => !entry.control).map((entry) => entry.prop.name);
  return (
    // The popover is portaled, but its clicks still bubble to the card (React tree): keep them here.
    <div className="flex w-[min(560px,90vw)] flex-col gap-3" onClick={(event) => event.stopPropagation()}>
      <LivePropsFrame component={name} props={values} className="overflow-hidden rounded-lg border border-line" />
      <div className="flex max-h-72 flex-col gap-1.5 overflow-y-auto pr-1">
        {controls.map(({ prop, control }) =>
          control ? (
            <PropField
              key={prop.name}
              prop={prop}
              control={control}
              value={values[prop.name]}
              onChange={(value) =>
                setValues((current) => {
                  const next = { ...current };
                  if (value === undefined) delete next[prop.name];
                  else next[prop.name] = value;
                  return next;
                })
              }
            />
          ) : null,
        )}
      </div>
      <div className="flex items-center gap-2 text-[11px] text-fg-subtle">
        <span className="min-w-0 flex-1 truncate">{skipped.length ? `Not editable here: ${skipped.join(', ')}` : 'Changes here are not saved.'}</span>
        <Button size="sm" icon={<RotateCcw className="size-3.5" />} onClick={() => setValues(start)}>
          Reset
        </Button>
      </div>
    </div>
  );
}

function PropsTable({ name }: { name: string }) {
  const declared = useDeclaredProps(name);
  if (!declared) return <p className="text-[12px] text-fg-subtle">No type declaration ({name}.d.ts or a {name}Props in index.d.ts).</p>;
  const { props, dts } = declared;
  if (!props) return <pre className="overflow-x-auto rounded-lg bg-surface-2 p-3 font-mono text-[12px] text-fg">{dts}</pre>;
  if (!props.length) return <p className="text-[12px] text-fg-subtle">No props.</p>;
  return (
    <table className="w-full text-[12px]">
      <thead className="text-left text-fg-subtle">
        <tr>
          <th className="py-1 pr-3 font-medium">Prop</th>
          <th className="py-1 pr-3 font-medium">Type</th>
          <th className="py-1 pr-3 font-medium">Default</th>
          <th className="py-1 font-medium">Description</th>
        </tr>
      </thead>
      <tbody>
        {props.map((prop) => (
          <tr key={prop.name} className="border-t border-line align-top">
            <td className="py-1.5 pr-3 font-mono text-fg">
              {prop.name}
              {prop.optional ? <span className="text-fg-subtle">?</span> : null}
            </td>
            <td className="max-w-64 py-1.5 pr-3 font-mono text-fg-muted">{prop.type}</td>
            <td className="py-1.5 pr-3 font-mono text-fg-muted">{prop.defaultValue ?? ''}</td>
            <td className="py-1.5 text-fg-muted">{prop.doc ?? ''}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function ComponentCard({ component, readOnly }: { component: ComponentInfo; readOnly: boolean }) {
  const [tab, setTab] = useState<'readme' | 'props'>('readme');
  const focus = useFocusProps({ kind: 'component', name: component.name });
  const readmePath = `components/${component.name}/README.md`;
  const readme = useFiles((s) => s.texts[readmePath]);
  const declared = useDeclaredProps(component.name);
  const { files } = useModel();
  const live = files.has('components/bundle.js') && !component.page && Boolean(declared?.props?.length);
  const owner = Boolean(maybeSession()?.isOwner);
  return (
    <article
      id={anchorId('component', component.name)}
      {...focus}
      className="group overflow-hidden rounded-xl border border-line bg-surface data-[focused]:border-accent data-[focused]:ring-2 data-[focused]:ring-accent/30"
    >
      <header className="flex items-center gap-3 border-b border-line px-4 py-2.5">
        <div className="min-w-0 flex-1">
          <h3 className="text-[14px] font-semibold text-fg">{component.name}</h3>
          {component.marker?.subtitle || component.summary ? <p className="truncate text-[12px] text-fg-muted">{component.marker?.subtitle ?? component.summary}</p> : null}
        </div>
        {component.page ? <span className="rounded bg-surface-2 px-1.5 py-0.5 text-[11px] text-fg-muted">Page</span> : null}
        <CommentBadge focus={{ kind: 'component', name: component.name }} />
        {live ? (
          <Popover
            side="bottom"
            align="end"
            trigger={
              <Button size="sm" variant="ghost" icon={<SlidersHorizontal className="size-3.5" />} onClick={(event) => event.stopPropagation()}>
                Try props
              </Button>
            }
          >
            <LiveProps name={component.name} props={declared!.props!} />
          </Popover>
        ) : null}
        {owner ? <Button
          size="sm"
          variant="ghost"
          icon={<Bot className="size-3.5" />}
          onClick={(event) => {
            event.stopPropagation();
            useView.getState().setFocus({ kind: 'component', name: component.name });
            useView.getState().openComposer();
          }}
        >
          Ask agent
        </Button> : null}
      </header>
      {component.hasPreview ? <PreviewFrame component={component.name} className="border-b border-line" /> : null}
      <div className="px-4 py-3">
        <Segmented
          value={tab}
          onChange={setTab}
          options={[
            { value: 'readme', label: 'README' },
            { value: 'props', label: 'Props' },
          ]}
          aria-label={`${component.name} details`}
          className="mb-3 w-44"
        />
        {tab === 'readme' ? (
          <EditableMarkdown
            source={readme ?? ''}
            from={readmePath}
            readOnly={readOnly}
            placeholder="No README. Double-click to write when and how to use it."
            onCommit={(text) => editText(readmePath, text, readmePath)}
          />
        ) : (
          <PropsTable name={component.name} />
        )}
      </div>
    </article>
  );
}

export function Components() {
  const { components, index, files, tokens } = useModel();
  const theme = useView((s) => s.theme);
  const readOnly = useFiles((s) => s.readOnly);
  const groups = useMemo(() => {
    const out = new Map<string, ComponentInfo[]>();
    for (const component of components) {
      const group = component.group ?? (component.page ? 'Pages' : 'Components');
      out.set(group, [...(out.get(group) ?? []), component]);
    }
    return [...out];
  }, [components]);

  return (
    <div>
      <PageHeader
        title="Components"
        actions={tokens.themes.length > 1 && components.length ? (
          <label className="flex items-center gap-2 text-sm">Preview theme
            <select aria-label="Component preview theme" value={tokens.themes.find((t) => t.id === theme)?.id ?? tokens.themes[0]!.id}
              onChange={(event) => useView.getState().setTheme(event.target.value)} className="rounded border border-line bg-surface px-2 py-1">
              {tokens.themes.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </label>
        ) : null}
        description={
          files.has('components/bundle.js') ? (
            <>
              {components.length} components on <code className="font-mono">window.{index.namespace}</code> once <code className="font-mono">components/bundle.js</code> is loaded.
            </>
          ) : (
            `${components.length} components. There is no bundle: these are documented, not loadable.`
          )
        }
      />
      {components.length ? (
        groups.map(([group, list]) => (
          <section key={group} className="mb-10">
            {groups.length > 1 ? <h2 className="mb-3 text-[13px] font-semibold uppercase tracking-wide text-fg-subtle">{group}</h2> : null}
            <div className="flex flex-col gap-6">
              {list.map((component) => (
                <ComponentCard key={component.name} component={component} readOnly={readOnly} />
              ))}
            </div>
          </section>
        ))
      ) : (
        <p className="text-[13px] text-fg-subtle">No components. Ask the agent to add them from your code or design files.</p>
      )}
    </div>
  );
}
