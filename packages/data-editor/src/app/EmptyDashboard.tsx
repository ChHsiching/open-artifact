/**
 * The empty page: "Nothing here yet", or, while the agent builds the first
 * page for someone who can edit, its working line cycling through how long
 * it takes and what the page will offer.
 */

import { useEffect, useMemo, useState, type ReactElement } from 'react';
import { LoaderCircle } from 'lucide-react';
import { AGENT_WORKING_TEXT } from '../page/check.ts';
import { EMPTY_DASHBOARD_TEXT } from './words.ts';
import { workingLineAt } from './working-line.ts';

function useCoarsePointer(): boolean {
  return useMemo(() => typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches, []);
}

function WorkingLine(): ReactElement {
  const coarse = useCoarsePointer();
  const [start] = useState(() => Date.now());
  const [line, setLine] = useState(() => workingLineAt(0, coarse));
  useEffect(() => {
    const timer = setTimeout(() => setLine(workingLineAt(Date.now() - start, coarse)), line.forMs);
    return () => clearTimeout(timer);
  }, [line, start, coarse]);
  return (
    <p role="status" aria-live="polite" className="dash-working-line flex items-center gap-2 text-[14px] text-chrome-muted">
      <LoaderCircle className="size-4 animate-spin" aria-hidden />
      <span key={line.text ?? ''} className="dash-working-text">
        {line.text ?? AGENT_WORKING_TEXT}
      </span>
    </p>
  );
}

/** The page with no files: the agent's working line while it builds one for an editor, else "Nothing here yet". */
export function EmptyDashboard({ editable, working }: { editable: boolean; working: boolean }): ReactElement {
  return (
    <div className="dash-empty" data-waits={editable ? '' : undefined} data-uncommentable="">
      {editable && working ? <WorkingLine /> : <p className="max-w-sm px-4 text-center text-[14px] text-chrome-muted">{EMPTY_DASHBOARD_TEXT}</p>}
    </div>
  );
}
