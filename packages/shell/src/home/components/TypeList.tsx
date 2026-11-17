/** The installed types, with "New" on the ones the home page can create. */

import type { TypeView } from '@open-artifact/protocol';
import { Plus, Shapes, TriangleAlert } from 'lucide-react';
import { useState } from 'react';
import { Button, EmptyState } from '@open-artifact/ui';
import { api } from '../../lib/api.ts';
import { t } from '../../lib/i18n.ts';
import { isCreatable } from '../model.ts';
import { useHome } from '../store.ts';
import { Chip } from './ArtifactList.tsx';

/** The type's icon, or a generic one when it has none or it fails to load. */
function TypeIcon({ type }: { type: TypeView }) {
  const [failed, setFailed] = useState(false);
  if (!type.icon || failed) {
    return (
      <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-surface-2 text-fg-muted">
        <Shapes className="size-4" />
      </span>
    );
  }
  return <img src={api.typeIconUrl(type.id)} alt="" className="size-8 shrink-0 rounded-lg" onError={() => setFailed(true)} />;
}

function TypeCard({ type }: { type: TypeView }) {
  return (
    <div className="flex min-w-0 flex-col gap-1.5 rounded-xl border border-line bg-surface p-3.5">
      <div className="flex items-center gap-2.5">
        <TypeIcon type={type} />
        <div className="min-w-0">
          <div className="truncate font-semibold">{type.title}</div>
          <div className="truncate text-xs text-fg-muted">{type.id}</div>
        </div>
      </div>
      <div className="flex flex-wrap gap-1.5">
        <Chip>{type.scope}</Chip>
        <Chip>{type.runtime}</Chip>
        {type.version ? <Chip>v{type.version}</Chip> : null}
        {type.enabled ? null : <Chip>{t('disabled')}</Chip>}
        {type.shadowedBy ? <Chip>{t('shadowedBy', { root: type.shadowedBy })}</Chip> : null}
      </div>
      {type.description ? <div className="line-clamp-4 text-xs text-fg-muted">{type.description}</div> : null}
      {type.problems.length ? (
        <div className="flex items-start gap-1 text-xs text-warning">
          <TriangleAlert className="mt-px size-3.5 shrink-0" />
          {type.problems.join(' ')}
        </div>
      ) : null}
      {isCreatable(type) ? (
        <div className="mt-auto pt-1">
          <Button size="sm" variant="primary" icon={<Plus className="size-3" />} onClick={() => useHome.getState().setCreating(type)}>
            {t('newOf', { type: type.title })}
          </Button>
        </div>
      ) : null}
    </div>
  );
}

/** The type grid and where types are looked for. */
export function TypeList() {
  const types = useHome((state) => state.types);
  if (types === null) return <p className="py-8 text-fg-muted">{t('loading')}</p>;
  const roots = types.roots.map((root) => `${root.dir} (${root.scope})`).join(', ');
  return (
    <>
      {roots ? <p className="mb-3 mt-0 break-all text-xs text-fg-muted">{t('typeRoots', { roots })}</p> : null}
      {types.types.length ? (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(260px,1fr))] gap-3">
          {types.types.map((type) => (
            <TypeCard key={`${type.root}:${type.id}`} type={type} />
          ))}
        </div>
      ) : (
        <EmptyState title={t('noTypes')} />
      )}
    </>
  );
}
