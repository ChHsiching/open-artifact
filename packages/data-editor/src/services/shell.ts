/**
 * The bridge to an Open Artifact Shell framing this page
 * (`createShellBridge`, `@open-artifact/editor-kit`). Each part of the page
 * sets its own part of the report (sync owns `saved`, `leaveLosesWork` and
 * `hasContent`); commands fan out to every handler. Outside a Shell every
 * call is a no-op.
 */

import { createShellBridge } from '@open-artifact/editor-kit';
import { maybeSession } from './session.ts';

export const { useShellDraws, setShellReport, onShellCommand, startShell } = createShellBridge(() => maybeSession()?.shell);
