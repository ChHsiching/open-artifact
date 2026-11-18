import { FieldLabel, FieldRoot, FieldTextInput } from '../kit/field.tsx';
import { TextInput } from '../kit/text-input.tsx';
import { Checkbox } from '../kit/checkbox.tsx';
import { Surface } from '../kit/surface.tsx';
import { UiRoot } from '../kit/theme.tsx';
import { Button } from '../kit/button.tsx';
import { Tooltip, TooltipGroup } from '../kit/tooltip.tsx';
import type { Dynamic } from '../dynamic.ts';
import * as React from 'react';
import { describeLastDone } from '../i18n/last-done-labels.ts';
import { describeUndoOffer } from '../i18n/change-labels.ts';
import { useTopLayerClose } from './list-under-cell.ts';
import { offerKeyboardWhenReady } from './keyboard-handoff.ts';
import { findMatchCounterText, findMatchHeardAs, findBarMessages, selectedCellsScopeLabel, searchInButtonLabel } from '../i18n/find-labels.ts';
import { jsxs, jsx, Fragment } from 'react/jsx-runtime';
import { SidePane, PANE_START_ATTRIBUTE, PaneSelect } from './side-pane/side-pane.ts';
import { IS_APPLE_PLATFORM } from './dom-events.ts';
import { latinKeyOf } from '../keys/key-press.ts';
export function findStepShortcut(event?: Dynamic) {
  if (!(event.key === 'F3' ? !event.altKey && !event.metaKey && !event.ctrlKey : isPrimaryShortcut(event, 'g'))) return null;
  return event.shiftKey ? -1 : 1;
}
export function replacedAnnouncement(replaced?: Dynamic, matchWords?: Dynamic) {
  if (!('kind' in replaced))
    return `${describeLastDone(replaced)}
${matchWords}`.trim();
  let { title: title, description = '' } = describeUndoOffer(replaced);
  return `${title}
${description}`.trim();
}
export function FindBar({
  find: find,
  fieldRef: fieldRef,
  replaceFieldRef: replaceFieldRef,
  canReplace: canReplace,
  areFormulasShown: areFormulasShown,
  replaced: replaced,
  textGiven: textGiven,
  onText: onText,
  onStep: onStep,
  onReplaceAsked: onReplaceAsked,
  onOptions: onOptions,
  pane: pane,
  onReplace: onReplace,
  onUndoOrRedo: onUndoOrRedo,
  onLookAgain: onLookAgain,
  onGoOn: onGoOn,
  onClose: onClose,
}: Dynamic) {
  let [text, setText] = React.useState('');
  let [textGivenSeen, setTextGivenSeen] = React.useState(null);
  if (textGiven !== textGivenSeen) {
    setTextGivenSeen(textGiven);
    if (textGiven !== null) setText(textGiven.text);
  }
  let [replaceText, setReplaceText] = React.useState('');
  let [replacedSeen, setReplacedSeen] = React.useState(replaced);
  let buttonsRef = React.useRef(null);
  let [replaceCount, setReplaceCount] = React.useState(0);
  let [canUndoReplace, setCanUndoReplace] = React.useState(false);
  let [replacedBefore, setReplacedBefore] = React.useState(replaced);
  if (replaced !== replacedBefore) {
    setReplacedBefore(replaced);
    if (replaced !== null) setCanUndoReplace(true);
  }
  let [isFocused, setIsFocused] = React.useState(true);
  let typingTimerRef = React.useRef(null);
  React.useEffect(() => () => clearTimeout(typingTimerRef.current ?? undefined), []);
  let { isReplaceShown: isReplaceShown } = find;
  useTopLayerClose(!isReplaceShown, onClose);
  let focusField = React.useEffectEvent((isReplace?: Dynamic) => {
    let field = isReplace && text !== '' ? replaceFieldRef.current : fieldRef.current;
    if (field === null) return;
    return offerKeyboardWhenReady(
      field,
      () =>
        field.focus({
          preventScroll: true,
        }),
      {
        keys: {
          onShut: onClose,
        },
      },
    );
  });
  React.useEffect(() => focusField(isReplaceShown), [isReplaceShown]);
  React.useEffect(() => {
    let replaceField = isReplaceShown ? replaceFieldRef.current : null;
    let blockHistoryInput = (event?: Dynamic) => {
      if (event.inputType.startsWith('history')) event.preventDefault();
    };
    replaceField?.addEventListener('beforeinput', blockHistoryInput);
    return () => replaceField?.removeEventListener('beforeinput', blockHistoryInput);
  }, [replaceFieldRef, isReplaceShown]);
  let lookAgain = React.useEffectEvent(onLookAgain);
  let hasEditsSinceLooked = find.editsSinceLooked > 0;
  React.useEffect(() => {
    if (!hasEditsSinceLooked) return;
    let timer = setTimeout(lookAgain, FIND_RELOOK_DELAY_MS);
    return () => clearTimeout(timer);
  }, [hasEditsSinceLooked]);
  let onTextTyped = (typed?: Dynamic) => {
    setCanUndoReplace(false);
    setReplacedSeen(replaced);
    clearTimeout(typingTimerRef.current ?? undefined);
    typingTimerRef.current = setTimeout(() => {
      typingTimerRef.current = null;
      onText(typed);
    }, FIND_TYPING_DELAY_MS);
  };
  let onOptionsChanged = (options?: Dynamic) => {
    setReplacedSeen(replaced);
    onOptions(options);
  };
  let step = (stepBy?: Dynamic) => {
    setReplacedSeen(replaced);
    if (typingTimerRef.current === null) return onStep(stepBy);
    clearTimeout(typingTimerRef.current);
    typingTimerRef.current = null;
    return onText(text);
  };
  let replace = (scope?: Dynamic) => {
    if (text === '')
      return fieldRef.current?.focus({
        preventScroll: true,
      });
    setReplaceCount((count?: Dynamic) => count + 1);
    setReplacedSeen(replaced);
    let isStale = typingTimerRef.current !== null || text !== find.text;
    clearTimeout(typingTimerRef.current ?? undefined);
    typingTimerRef.current = null;
    if (isStale) onText(text);
    if (!isStale || scope === 'everyCell') onReplace(replaceText, scope);
  };
  let onKeyDown = (event?: Dynamic) => {
    if (event.nativeEvent.isComposing || event.keyCode === 229) return;
    let isEnterInFind = event.key === 'Enter' && event.target === fieldRef.current;
    let isEnterInReplace = event.key === 'Enter' && event.target === replaceFieldRef.current;
    let isBackward = (isEnterInFind || isEnterInReplace) && event.shiftKey;
    let stepBy = isBackward ? -1 : isEnterInFind ? 1 : findStepShortcut(event);
    let isOnButtons = event.target instanceof Node && buttonsRef.current?.contains(event.target) === true;
    let isHeldEnter = event.repeat && event.key === 'Enter' && !isBackward && (isEnterInReplace || isOnButtons);
    if (event.key === 'Escape') onClose();
    else if (isEnterInReplace && !isBackward && !event.repeat) replace('cellFound');
    else if (stepBy !== null) step(stepBy);
    else if (isUndoRedoShortcut(event) && canUndoReplace) onUndoOrRedo(event.nativeEvent);
    else if (event.key === 'F6' && !event.altKey) {
      if (!onGoOn(event.shiftKey ? -1 : 1)) return;
    } else if (!isHeldEnter && (!isUndoRedoShortcut(event) || !find.isReplaceShown || event.target === fieldRef.current)) return;
    event.preventDefault();
    event.stopPropagation();
  };
  let onButtonsMouseDown = (event?: Dynamic) => {
    if (event.target !== fieldRef.current && event.target !== replaceFieldRef.current) event.preventDefault();
  };
  let countText = find.text === '' || text === '' ? '' : findMatchCounterText(find);
  let matchText = countText === '' ? '' : findMatchHeardAs(find);
  let announcedMatch = isFocused ? matchText : '';
  let isReplaceNews = replaced !== null && replaced !== replacedSeen && (isFocused || !('kind' in replaced));
  let announcement = isReplaceNews ? replacedAnnouncement(replaced, announcedMatch) : announcedMatch;
  let announcementOfReplace = isReplaceNews ? replaced : null;
  let [shownAnnouncement, setShownAnnouncement] = React.useState({
    words: announcement,
    ofReplace: announcementOfReplace,
  });
  if (!hasEditsSinceLooked && (shownAnnouncement.words !== announcement || shownAnnouncement.ofReplace !== announcementOfReplace))
    setShownAnnouncement({
      words: announcement,
      ofReplace: announcementOfReplace,
    });
  let announced = shownAnnouncement.ofReplace === null || shownAnnouncement.ofReplace === replaced ? shownAnnouncement.words : '';
  let isNothingFound = find.count === 0;
  React.useLayoutEffect(() => {
    let field = fieldRef.current;
    if (isNothingFound && field?.ownerDocument.activeElement?.matches('search :disabled') === true)
      field.focus({
        preventScroll: true,
      });
  }, [isNothingFound, fieldRef]);
  let onFocusIn = () => {
    if (!isFocused) setReplacedSeen(replaced);
    setIsFocused(true);
  };
  let onFocusOut = ({ currentTarget: currentTarget, relatedTarget: relatedTarget }: Dynamic) =>
    setIsFocused(currentTarget.contains(relatedTarget));
  let findFieldProps = {
    ref: fieldRef,
    value: text,
    onChange: (event?: Dynamic) => {
      setText(event.target.value);
      let { nativeEvent: nativeEvent } = event;
      if (!(nativeEvent instanceof InputEvent && nativeEvent.isComposing)) onTextTyped(event.target.value);
    },
    onCompositionEnd: (event?: Dynamic) => onTextTyped(event.currentTarget.value),
    autoComplete: 'off',
    autoCapitalize: 'off',
    autoCorrect: 'off',
    spellCheck: false,
    maxLength: 200,
  };
  let countOutput = jsxs('output', {
    'aria-live': 'polite',
    'aria-atomic': 'true',
    className: `text-secondary text-caption ${isReplaceShown ? 'whitespace-nowrap tabular-nums' : 'sheet-find-count'}`,
    children: [
      jsx('span', {
        'aria-hidden': 'true',
        children: countText,
      }),
      jsx(
        'span',
        {
          className: 'sr-only',
          children: (announced === ''
            ? []
            : announced.split(`
`)
          ).map(
            (part?: Dynamic) =>
              jsx(
                'span',
                {
                  className: 'block',
                  children: `${part} `,
                },
                part,
              ),
          ),
        },
        replaceCount,
      ),
    ],
  });
  let stepButtons = jsxs(Fragment, {
    children: [
      jsx(Button, {
        variant: 'ghost',
        iconOnly: true,
        icon: 'ArrowUp',
        'aria-label': findBarMessages.previous(),
        disabled: isNothingFound,
        onClick: () => step(-1),
      }),
      jsx(Button, {
        variant: 'ghost',
        iconOnly: true,
        icon: 'ArrowDown',
        'aria-label': findBarMessages.next(),
        disabled: isNothingFound,
        onClick: () => step(1),
      }),
    ],
  });
  if (isReplaceShown) {
    let withinChoices = [...new (Set as Dynamic)([find.within, find.selectedCells])].filter((count?: Dynamic) => count !== null);
    let searchInItems = [
      {
        value: 'sheet',
        label: findBarMessages.thisSheet(),
      },
      {
        value: 'allSheets',
        label: findBarMessages.allSheets(),
      },
      ...withinChoices.map(
        (range?: Dynamic) => ({
          value: `cells ${range}`,
          label: selectedCellsScopeLabel(range),
        }),
      ),
    ];
    let searchIn = find.isInAllSheets ? 'allSheets' : find.within === null ? 'sheet' : `cells ${find.within}`;
    return jsx('search', {
      className: 'contents',
      onFocus: onFocusIn,
      onBlur: onFocusOut,
      children: jsx(SidePane, {
        ...pane,
        title: findBarMessages.findAndReplace(),
        onClose: onClose,
        onKeyDown: onKeyDown,
        children: jsxs('div', {
          className: 'flex shrink-0 flex-col gap-md ps-lg pe-md pt-lg max-[600px]:gap-sm',
          children: [
            jsxs(FieldRoot, {
              children: [
                jsxs('div', {
                  className: 'flex items-center justify-between',
                  children: [
                    jsx(FieldLabel, {
                      children: findBarMessages.findWhat(),
                    }),
                    jsx('div', {
                      role: 'presentation',
                      className: '-my-2 -me-1 flex gap-0.5',
                      onMouseDown: onButtonsMouseDown,
                      children: jsx(TooltipGroup, {
                        children: stepButtons,
                      }),
                    }),
                  ],
                }),
                jsx(TextInput, {
                  ...findFieldProps,
                  ...{
                    [PANE_START_ATTRIBUTE]: true,
                  },
                  slotEnd: countOutput,
                }),
              ],
            }),
            jsx(FieldTextInput, {
              ref: replaceFieldRef,
              label: findBarMessages.replaceWith(),
              value: replaceText,
              onChange: ({ target: target, nativeEvent: nativeEvent }: Dynamic) => {
                if (nativeEvent instanceof InputEvent && nativeEvent.inputType.startsWith('history')) return;
                setCanUndoReplace(false);
                setReplaceText(target.value);
              },
              autoComplete: 'off',
              autoCapitalize: 'off',
              autoCorrect: 'off',
              spellCheck: false,
              maxLength: 200,
            }),
            jsxs(FieldRoot, {
              children: [
                jsx(FieldLabel, {
                  render: jsx('span', {
                    'aria-hidden': 'true',
                  }),
                  children: findBarMessages.searchIn(),
                }),
                jsx('div', {
                  className: 'flex',
                  children: jsx(PaneSelect, {
                    name: searchInButtonLabel(searchInItems.find(({ value: value }: Dynamic) => value === searchIn)?.label ?? ''),
                    value: searchIn,
                    items: searchInItems,
                    onChange: (within?: Dynamic) =>
                      onOptionsChanged({
                        within: within === 'sheet' || within === 'allSheets' ? within : 'selectedCells',
                      }),
                  }),
                }),
              ],
            }),
            jsxs('div', {
              className: 'flex flex-col gap-sm',
              children: [
                jsx(Checkbox, {
                  label: findBarMessages.matchCase(),
                  checked: find.options.matchesCase,
                  onCheckedChange: (matchesCase?: Dynamic) =>
                    onOptionsChanged({
                      matchesCase: matchesCase,
                    }),
                }),
                jsx(Checkbox, {
                  label: findBarMessages.matchEntireCell(),
                  checked: find.options.isWholeCell,
                  onCheckedChange: (isWholeCell?: Dynamic) =>
                    onOptionsChanged({
                      isWholeCell: isWholeCell,
                    }),
                }),
                jsx(Checkbox, {
                  label: findBarMessages.alsoInFormulas(),
                  checked: find.options.isInFormulas || areFormulasShown,
                  disabled: areFormulasShown,
                  disabledReason: findBarMessages.whyAlsoInFormulas(),
                  onCheckedChange: (isInFormulas?: Dynamic) =>
                    onOptionsChanged({
                      isInFormulas: isInFormulas,
                    }),
                }),
              ],
            }),
            jsx('div', {
              role: 'presentation',
              onMouseDown: onButtonsMouseDown,
              children: jsxs('div', {
                ref: buttonsRef,
                className: `grid gap-sm ${find.isInAllSheets ? 'grid-cols-[1fr_auto]' : 'grid-cols-2'}`,
                children: [
                  jsx(Button, {
                    variant: 'secondary',
                    onClick: () => replace('cellFound'),
                    children: findBarMessages.replace(),
                  }),
                  jsx(Button, {
                    variant: 'secondary',
                    onClick: ({ detail: detail }: Dynamic) => detail < 2 && replace('everyCell'),
                    children: find.isInAllSheets ? findBarMessages.replaceAllInSheet() : findBarMessages.replaceAll(),
                  }),
                ],
              }),
            }),
          ],
        }),
      }),
    });
  }
  return jsx('search', {
    'aria-label': findBarMessages.find(),
    className: 'sheet-find-over-grid',
    children: jsx(UiRoot, {
      density: 'compact',
      render: jsx(Surface, {
        elevation: 'panel',
        className: 'sheet-find-parts',
        onFocus: onFocusIn,
        onBlur: onFocusOut,
        onKeyDown: onKeyDown,
        onMouseDown: onButtonsMouseDown,
      }),
      children: jsxs(TooltipGroup, {
        children: [
          jsx(TextInput, {
            ...findFieldProps,
            className: 'sheet-find-field',
            placeholder: findBarMessages.find(),
            'aria-label': findBarMessages.find(),
          }),
          countOutput,
          stepButtons,
          canReplace &&
            jsx(Tooltip, {
              content: findBarMessages.findAndReplace(),
              shortcut: REPLACE_SHORTCUT,
              children: jsx(Button, {
                variant: 'ghost',
                'aria-description': findBarMessages.findAndReplace(),
                'aria-keyshortcuts': IS_APPLE_PLATFORM ? 'Meta+Shift+H' : 'Control+H',
                onClick: onReplaceAsked,
                children: findBarMessages.toReplace(),
              }),
            }),
          jsx(Button, {
            variant: 'ghost',
            iconOnly: true,
            icon: 'X',
            'aria-label': findBarMessages.close(),
            onClick: onClose,
          }),
        ],
      }),
    }),
  });
}
export function FindBarUnlessGivenUp({ hasLeftSinceAsked: hasLeftSinceAsked, onGivenUp: onGivenUp, ...findBarProps }: Dynamic) {
  let [isGivenUp, setIsGivenUp] = React.useState(hasLeftSinceAsked);
  let { isReplaceShown: isReplaceShown } = findBarProps.find;
  let [replaceShownSeen, setReplaceShownSeen] = React.useState(isReplaceShown);
  if (isReplaceShown !== replaceShownSeen) {
    setReplaceShownSeen(isReplaceShown);
    if (isReplaceShown && hasLeftSinceAsked()) setIsGivenUp(true);
  }
  let giveUp = React.useEffectEvent(onGivenUp);
  React.useLayoutEffect(() => {
    if (isGivenUp) giveUp();
  }, [isGivenUp]);
  return isGivenUp
    ? null
    : jsx(FindBar, {
        ...findBarProps,
      });
}
export const FIND_TYPING_DELAY_MS = 120;
export const isPrimaryShortcut = (event?: Dynamic, letter?: Dynamic) =>
  !event.altKey &&
  (IS_APPLE_PLATFORM ? event.metaKey && !event.ctrlKey : event.ctrlKey && !event.metaKey) &&
  latinKeyOf(event, true).toLowerCase() === letter;
export const isFindShortcut = (event?: Dynamic) => !event.shiftKey && isPrimaryShortcut(event, 'f');
export const isReplaceShortcut = (event?: Dynamic) => event.shiftKey === IS_APPLE_PLATFORM && isPrimaryShortcut(event, 'h');
export const REPLACE_SHORTCUT = IS_APPLE_PLATFORM ? 'cmd+shift+h' : 'cmd+h';
export const isUndoRedoShortcut = (event?: Dynamic) =>
  isPrimaryShortcut(event, 'z') || (!event.shiftKey && isPrimaryShortcut(event, 'y'));
export const FIND_RELOOK_DELAY_MS = 1000;
