import { Dialog } from '../kit/dialog.tsx';
import { TextInput } from '../kit/text-input.tsx';
import { Form } from '../kit/form.tsx';
import { Button } from '../kit/button.tsx';
import type { Dynamic } from '../dynamic.ts';
import * as React from 'react';
import { createLateEnterTracker } from '../ui/menu-with-field.ts';
import { jsx, jsxs } from 'react/jsx-runtime';
import { sheetMessages } from '../i18n/sheet-messages.ts';
import { isHistoryOrDropInputType } from '../editor/commit-entry.ts';
import {
  customFormatStage,
  withoutOfferWhenTyping,
  CustomFormatAgentRow,
  formatCallFailedAnnouncement,
  formatWritingProblemText,
  CustomFormatAnnouncer,
} from './custom-format-row.ts';
import { customFormatProblemText, formatPreviewText } from '../i18n/format-labels.ts';
import { useActHoldAtAnswer } from '../agent/answer-holds.ts';
export function CustomFormatPatternInput({
  ref: ref,
  pattern: pattern,
  isInvalid: isInvalid,
  opensOnPatternOfCells: opensOnPatternOfCells,
  isHeldAsItIs: isHeldAsItIs,
  onKeyForAgent: onKeyForAgent,
  onKeyHeld: onKeyHeld,
  onTyped: onTyped,
}: Dynamic) {
  let hasFocusedRef = React.useRef(false);
  let [lateEnter] = React.useState(createLateEnterTracker);
  return jsx(TextInput, {
    ref: ref,
    'data-initial-focus': true,
    'aria-label': sheetMessages.customFormat(),
    'aria-invalid': isInvalid || undefined,
    'aria-describedby': CUSTOM_FORMAT_LINE_ID,
    readOnly: isHeldAsItIs,
    className: isHeldAsItIs ? 'text-secondary' : undefined,
    onKeyDown: (event?: Dynamic) => {
      let vendor = event.currentTarget.ownerDocument.defaultView?.navigator.vendor ?? '';
      let isLateEnter = lateEnter.isLateEnter(event, vendor);
      if (event.nativeEvent.isComposing || event.keyCode === 229) return;
      if (isLateEnter) event.preventDefault();
      if (isLateEnter || event.repeat) onKeyHeld(event.key);
      else if (onKeyForAgent(event.key)) event.preventDefault();
    },
    onCompositionEnd: lateEnter.compositionEnded,
    onFocus: ({ currentTarget: currentTarget }: Dynamic) => {
      if (!hasFocusedRef.current && opensOnPatternOfCells) currentTarget.select();
      hasFocusedRef.current = true;
    },
    autoComplete: 'off',
    autoCapitalize: 'off',
    autoCorrect: 'off',
    spellCheck: false,
    value: pattern,
    onChange: ({ currentTarget: currentTarget, nativeEvent: nativeEvent }: Dynamic) => {
      let inputType = nativeEvent instanceof InputEvent ? nativeEvent.inputType : '';
      onTyped(currentTarget.value, !/^(?:insert|delete)/.test(inputType) || isHistoryOrDropInputType(inputType));
    },
  });
}
export const CLOSED_CUSTOM_FORMAT_ENTRY = {
  pattern: '',
  reading: {
    kind: 'nothingTyped',
  },
  isRefusalTold: false,
  agent: null,
  hold: null,
  hasHeldTextOfOthers: false,
  typedIn: 'dialog',
  shownUnderPattern: new (Map as Dynamic)(),
};
export const CUSTOM_FORMAT_LINE_ID = 'custom-number-format-line';
export const CustomNumberFormatDialog = React.memo(function ({
  entry: entry,
  isAgentOffered: isAgentOffered,
  whatHasCaretAfter: whatHasCaretAfter,
  onTyped: onTyped,
  onEntered: onEntered,
  onDropped: onDropped,
  onEscaped: onEscaped,
  onAgentAsked: onAgentAsked,
  onActHeld: onActHeld,
}: Dynamic) {
  let [lastEntry, setLastEntry] = React.useState(CLOSED_CUSTOM_FORMAT_ENTRY);
  if (entry !== null && entry !== lastEntry) setLastEntry(entry);
  let { pattern: pattern, reading: reading, isRefusalTold: isRefusalTold, agent: agent, hold: hold } = entry ?? lastEntry;
  let agentState = customFormatStage(agent, isAgentOffered);
  let agentRefusal = withoutOfferWhenTyping(agentState, isRefusalTold);
  let refusalWords = reading.kind === 'refused' && isRefusalTold && agentRefusal === null ? customFormatProblemText(reading.why) : null;
  let exampleText = reading.kind === 'numberFormat' ? (reading.example?.trim() ?? '') : '';
  let patternFieldRef = React.useRef(null);
  let agentStage = agentState?.kind ?? null;
  let heldAct = useActHoldAtAnswer({
    hold: hold,
    tellOfActHeld: onActHeld,
    isNoAct: (target?: Dynamic) => target === patternFieldRef.current,
  });
  let agentButtonRef = React.useRef(null);
  let focusPatternField = () => {
    let activeElement = patternFieldRef.current?.ownerDocument.activeElement ?? null;
    if (activeElement !== null && (activeElement.id === CUSTOM_FORMAT_LINE_ID || activeElement === agentButtonRef.current))
      patternFieldRef.current?.focus({
        preventScroll: true,
      });
  };
  let askAgent = () => {
    if (!heldAct.isActRefused()) focusPatternField();
    onAgentAsked(heldAct.howActBegan());
  };
  let onKeyForAgent = (key?: Dynamic) => {
    if (key !== 'Enter' || (agentStage !== 'offered' && agentStage !== 'asked')) return false;
    if (isAgentOffered) askAgent();
    else heldAct.noteKeyThatTakesNothing();
    return true;
  };
  return jsx(Dialog.Root, {
    open: entry !== null,
    onOpenChange: (isOpen: Dynamic, { reason: reason }: Dynamic) => {
      if (isOpen) return;
      if (reason === 'escape-key') onEscaped();
      else onDropped();
    },
    children: jsx(Dialog.Popup, {
      size: 'sm',
      initialFocus: patternFieldRef,
      finalFocus: whatHasCaretAfter,
      children: jsxs(Form, {
        className: 'contents',
        onSubmit: () => onEntered(heldAct.howActBegan()),
        ...heldAct.handlers,
        onKeyDown: (event?: Dynamic) => {
          if (event.key === 'Enter' && event.repeat) event.preventDefault();
        },
        children: [
          jsx(Dialog.Header, {
            children: sheetMessages.customFormat(),
          }),
          jsxs('div', {
            className: 'sheet-field-over-line flex flex-col gap-1.5',
            children: [
              jsx(CustomFormatPatternInput, {
                ref: patternFieldRef,
                pattern: pattern,
                isInvalid: refusalWords !== null || (agentRefusal?.kind === 'cameToNothing' && agentRefusal.why === 'noFormat'),
                opensOnPatternOfCells: (entry ?? lastEntry).hasHeldTextOfOthers,
                isHeldAsItIs: agentStage === 'asked',
                onKeyForAgent: onKeyForAgent,
                onKeyHeld: (input?: Dynamic) => {
                  if (input === 'Enter') heldAct.noteKeyThatTakesNothing();
                },
                onTyped: onTyped,
              }),
              agentRefusal !== null
                ? jsx(CustomFormatAgentRow, {
                    id: CUSTOM_FORMAT_LINE_ID,
                    stage: agentRefusal,
                    onAgentAsked: askAgent,
                    onStopped: onEscaped,
                  })
                : jsx('p', {
                    id: CUSTOM_FORMAT_LINE_ID,
                    className: `sheet-line-under-field box-content min-h-[1lh] text-footnote wrap-anywhere ${refusalWords === null ? 'text-secondary' : 'text-danger'}`,
                    children: refusalWords ?? (exampleText !== '' && formatPreviewText(exampleText)),
                  }),
            ],
          }),
          jsx('p', {
            role: 'alert',
            className: 'sr-only',
            children:
              refusalWords ??
              (agent?.kind === 'cameToNothing' &&
                (agent.why === 'callFailed' ? formatCallFailedAnnouncement() : formatWritingProblemText(agent.why))),
          }),
          jsx(CustomFormatAnnouncer, {
            entry: entry ?? lastEntry,
            isOfferSaid: isAgentOffered,
            example: exampleText,
          }),
          jsxs(Dialog.Footer, {
            align: 'end',
            children: [
              jsx(Dialog.Close, {
                render: jsx(Button, {
                  variant: 'secondary',
                  children: sheetMessages.cancel(),
                }),
              }),
              jsx(Button, {
                ref: agentButtonRef,
                type: 'submit',
                variant: 'primary',
                disabled: reading.kind === 'nothingTyped' || agentStage === 'asked',
                children: sheetMessages.apply(),
              }),
            ],
          }),
        ],
      }),
    }),
  });
});
