import type { Dynamic } from '../dynamic.ts';
import { withNoEffects } from '../state/transitions.ts';
import { queueEdit, IF_QUEUED_DEFAULTS } from '../model/edit-effects.ts';
import { MESSAGE_LOCALE, translateMessage } from '../i18n/messages.ts';
import { sortByLabel } from '../messages/locale.ts';
import type { PageState } from '../state/initial-state.ts';
import type { WorkbookReads } from '../model/workbook.ts';
export function workbookSettingPick(workbook: WorkbookReads, asked?: Dynamic) {
  if (asked.of === 'locale') {
    let locales = workbook.locales();
    return locales === null
      ? null
      : {
          of: 'locale',
          picked: null,
          ofWorkbook: workbook.locale,
          all: locales,
        };
  }
  let timeZones = workbook.timeZones();
  if (timeZones === null) return null;
  let browserTimeZone2 = workbook.timeZoneNamed(asked.nameInBrowser);
  return {
    of: 'timeZone',
    picked: null,
    ofWorkbook: workbook.timeZone,
    ofBrowser: browserTimeZone2,
    all: timeZones,
  };
}
export function openWorkbookSettingPick(state: PageState, workbook: WorkbookReads, asked?: Dynamic) {
  let pick = workbookSettingPick(workbook, asked);
  if (pick === null) return withNoEffects(state);
  return withNoEffects({
    ...state,
    menu: null,
    customNumberFormat: null,
    lastDone: null,
    notice: null,
    pickForWorkbook: pick,
  });
}
export function pickWorkbookSetting(state: PageState, pickKind?: Dynamic, picked?: Dynamic) {
  let pickForWorkbook = state.pickForWorkbook;
  if (pickForWorkbook?.of !== pickKind) return withNoEffects(state);
  let pickedOrNone = picked === pickForWorkbook.ofWorkbook ? null : picked;
  return withNoEffects({
    ...state,
    pickForWorkbook: {
      ...pickForWorkbook,
      picked: pickedOrNone,
    },
  });
}
export function editOfWorkbookSettingPick(pickForWorkbook?: Dynamic) {
  let picked = pickedOrWorkbookSetting(pickForWorkbook);
  return pickForWorkbook.of === 'locale'
    ? [
        {
          kind: 'setLocale',
          locale: picked,
        },
        {
          what: 'localeSet',
          locale: picked,
        },
      ]
    : [
        {
          kind: 'setTimeZone',
          timeZone: picked,
        },
        {
          what: 'timeZoneSet',
          timeZone: picked,
        },
      ];
}
export function commitWorkbookSettingPick(state: PageState) {
  let pickForWorkbook = state.pickForWorkbook;
  let closedState = {
    ...state,
    pickForWorkbook: null,
  };
  if (pickForWorkbook === null || !isWorkbookSettingChanged(pickForWorkbook)) return withNoEffects(closedState);
  let [edit, done] = editOfWorkbookSettingPick(pickForWorkbook);
  return queueEdit(closedState, edit, {
    ...IF_QUEUED_DEFAULTS,
    select: null,
    done: done,
  });
}
export function syncWorkbookSettingPick(state: PageState, workbook?: Dynamic) {
  let pickForWorkbook = state.pickForWorkbook;
  if (pickForWorkbook === null || pickForWorkbook.ofWorkbook === workbook[pickForWorkbook.of]) return state;
  return {
    ...state,
    pickForWorkbook:
      pickForWorkbook.of === 'locale'
        ? {
            ...pickForWorkbook,
            ofWorkbook: workbook.locale,
          }
        : {
            ...pickForWorkbook,
            ofWorkbook: workbook.timeZone,
          },
  };
}
export function longTimeZoneName(timeZone?: Dynamic) {
  let cached = longTimeZoneNameCache.get(timeZone);
  if (cached !== undefined) return cached;
  let longName: Dynamic = null;
  try {
    longName =
      new (Intl.DateTimeFormat as Dynamic)(MESSAGE_LOCALE, {
        timeZone: timeZone,
        timeZoneName: 'longGeneric',
      })
        .formatToParts()
        .find(({ type: type }: Dynamic) => type === 'timeZoneName')?.value ?? null;
  } catch {
    longName = null;
  }
  longTimeZoneNameCache.set(timeZone, longName);
  return longName;
}
export function shortTimeZoneLabel(timeZone?: Dynamic) {
  if (timeZone === null || timeZone === UTC_TIME_ZONE)
    return translateMessage({
      defaultMessage: 'UTC',
      id: 'xRXJ04SyLm',
    });
  return longTimeZoneName(timeZone) ?? timeZone;
}
export function timeZoneLabel(timeZone?: Dynamic) {
  if (timeZone === UTC_TIME_ZONE)
    return translateMessage({
      defaultMessage: 'UTC (Coordinated Universal Time)',
      id: 'WtS6hmNlJX',
    });
  let longName = longTimeZoneName(timeZone);
  if (longName === null) return timeZone;
  if (isEtcTimeZone(timeZone)) return longName;
  return translateMessage(
    {
      defaultMessage: '{city} ({name})',
      id: 'GPxg8ZkLyv',
    },
    {
      city: cityOfTimeZone(timeZone),
      name: longName,
    },
  );
}
export function timeZoneOptions(timeZones?: Dynamic, browserTimeZone2?: Dynamic, workbookTimeZone?: Dynamic) {
  let others = new (Set as Dynamic)([...(workbookTimeZone === null ? [] : [workbookTimeZone]), ...timeZones]);
  if (browserTimeZone2 === null) return sortedTimeZoneOptions(others);
  others.delete(browserTimeZone2);
  let [firstOther, ...restOthers] = sortedTimeZoneOptions(others);
  return [
    {
      ...timeZoneOption(browserTimeZone2),
      groupLabelBefore: timeZoneMessages.yourTimeZone(),
    },
    ...(firstOther === undefined
      ? []
      : [
          {
            ...firstOther,
            groupLabelBefore: timeZoneMessages.otherTimeZones(),
          },
        ]),
    ...restOthers,
  ];
}
export const UTC_TIME_ZONE = 'UTC';
export const isEtcTimeZone = (timeZone?: Dynamic) => timeZone.startsWith('Etc/');
export const pickedOrWorkbookSetting = (pickForWorkbook?: Dynamic) =>
  pickForWorkbook.picked ??
  (pickForWorkbook.of === 'locale' ? pickForWorkbook.ofWorkbook : (pickForWorkbook.ofWorkbook ?? pickForWorkbook.ofBrowser ?? UTC_TIME_ZONE));
export const isWorkbookSettingChanged = (pickForWorkbook?: Dynamic) =>
  pickedOrWorkbookSetting(pickForWorkbook) !== pickForWorkbook.ofWorkbook;
export const timeZoneMessages = {
  timeZone: () =>
    translateMessage({
      defaultMessage: 'Time zone',
      id: '91sDcgwHmb',
    }),
  whatGoesByIt: () =>
    translateMessage({
      defaultMessage: 'The current date and time (NOW and TODAY) use this time zone for everyone who opens this Sheet.',
      id: 'Bpl1YrmwuK',
    }),
  yourTimeZone: () =>
    translateMessage({
      defaultMessage: 'Your time zone',
      id: 'WE+ErqhfYO',
    }),
  otherTimeZones: () =>
    translateMessage({
      defaultMessage: 'Other time zones',
      id: 'dPC9M2UHPO',
    }),
};
export const longTimeZoneNameCache = new (Map as Dynamic)();
export const cityOfTimeZone = (timeZone?: Dynamic) => timeZone.slice(timeZone.lastIndexOf('/') + 1).replaceAll('_', ' ');
export const timeZoneSetText = (timeZone?: Dynamic) =>
  translateMessage(
    {
      defaultMessage: 'Time zone set to {timeZone}',
      id: '2dp9y+r8Nk',
    },
    {
      timeZone: timeZoneLabel(timeZone),
    },
  );
export const timeZoneOption = (timeZone?: Dynamic) => ({
  value: timeZone,
  label: timeZoneLabel(timeZone),
});
export const sortedTimeZoneOptions = (timeZones?: Dynamic) => sortByLabel(Array.from<Dynamic, Dynamic>(timeZones, timeZoneOption));
