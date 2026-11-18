import type { Dynamic } from '../dynamic.ts';
import * as React from 'react';
import * as ReactDOM from 'react-dom';
import { asThemeMode, VIEWER_FONT_ATTRIBUTE } from '../shell/root-theme.ts';
import { useDocumentElementAttribute } from '../dom/use-document-element-attribute.ts';
import { holdFocusLeftChecksForATick } from '../grid/focus-left.ts';
import { parseChartFrameReply, CHART_FRAME_PORT_MESSAGE, pressedAtMessage } from './frame-messages.ts';
import { jsx } from 'react/jsx-runtime';
export function ChartFrame({
  frameDocument: frameDocument,
  artifact: artifact,
  inputs: inputs,
  name: name,
  isOnShow: isOnShow,
  tellsOfPointer: tellsOfPointer,
  onTold: onTold,
  onLeaving: onLeaving,
  onCaretTaken: onCaretTaken,
}: Dynamic) {
  let [theme, viewerFont] = [asThemeMode(useDocumentElementAttribute('data-mode')), useDocumentElementAttribute(VIEWER_FONT_ATTRIBUTE)];
  let look = React.useMemo(
    () => ({
      theme: theme,
      viewerFont: viewerFont,
    }),
    [theme, viewerFont],
  );
  let portRef = React.useRef(null);
  let wasLoadedRef = React.useRef(false);
  let frameRef = React.useRef(null);
  let isWindowBlurringRef = React.useRef(false);
  let finishLeavingRef = React.useRef(null);
  let tellTold = React.useEffectEvent(onTold);
  let tellLeaving = React.useEffectEvent(onLeaving);
  let post = React.useCallback((message?: Dynamic) => portRef.current?.postMessage(message), []);
  let currentInputs = React.useEffectEvent(() => inputs);
  let closePort = React.useEffectEvent((outcome?: Dynamic, inputsOfOutcome: Dynamic = inputs) => {
    if (portRef.current === null) return;
    portRef.current.close();
    portRef.current = null;
    if (outcome !== null) ReactDOM.flushSync(() => tellTold(outcome, inputsOfOutcome));
  });
  let drawMessage = React.useEffectEvent(
    () => ({
      kind: 'draw',
      artifact: artifact,
      inputs: inputs,
      look: look,
    }),
  );
  let checkCaretTaken = React.useEffectEvent(() => {
    if (frameRef.current === null || frameRef.current.ownerDocument.activeElement !== frameRef.current) return false;
    holdFocusLeftChecksForATick();
    closePort({
      kind: 'failed',
      fault: 'tookCaret',
    });
    if (isWindowBlurringRef.current) onCaretTaken();
    return true;
  });
  let leave = (fault?: Dynamic, inputsOfOutcome: Dynamic = currentInputs()) => {
    if (checkCaretTaken() || portRef.current === null || finishLeavingRef.current !== null) return;
    let caretWatch = setInterval(() => checkCaretTaken() && clearInterval(caretWatch), CHART_FRAME_CARET_CHECK_MS);
    let finish = (finalFault?: Dynamic) => {
      clearInterval(caretWatch);
      if (!checkCaretTaken())
        closePort(
          {
            kind: 'failed',
            fault: finalFault,
          },
          inputsOfOutcome,
        );
    };
    setTimeout(() => finish('tookCaret'), CHART_FRAME_LEAVE_TIMEOUT_MS * (1 + Math.random()));
    let settleTimer: Dynamic;
    finishLeavingRef.current = () => {
      clearTimeout(settleTimer);
      settleTimer = setTimeout(() => finish(fault), CHART_FRAME_CARET_CHECK_MS);
    };
    post({
      kind: 'leave',
    });
    tellLeaving();
  };
  let connect = (frame?: Dynamic) => {
    if (wasLoadedRef.current) {
      leave('threw');
      return finishLeavingRef.current?.();
    }
    wasLoadedRef.current = true;
    let { port1: port, port2: framePort } = new (MessageChannel as Dynamic)();
    portRef.current = port;
    let replyTimer = setTimeout(() => portRef.current === port && leave('threw'), CHART_FRAME_REPLY_TIMEOUT_MS);
    port.addEventListener('message', ({ data: data }: Dynamic) => {
      let reply = parseChartFrameReply(data);
      if (reply === null || portRef.current !== port) return;
      clearTimeout(replyTimer);
      if (checkCaretTaken() || finishLeavingRef.current !== null) return;
      let inputsNow = currentInputs();
      if (reply.kind === 'drawn') return tellTold(reply, inputsNow);
      return leave(reply.fault, inputsNow);
    });
    port.start();
    frame.contentWindow?.postMessage(CHART_FRAME_PORT_MESSAGE, '*', [framePort]);
    return post(drawMessage());
  };
  React.useEffect(() => () => closePort(null), []);
  React.useEffect(() => {
    let frameWindow = frameRef.current?.ownerDocument.defaultView;
    let onBlur = () => {
      isWindowBlurringRef.current = true;
      checkCaretTaken();
      frameWindow?.setTimeout(() => {
        checkCaretTaken();
        isWindowBlurringRef.current = false;
      });
    };
    frameWindow?.addEventListener('blur', onBlur);
    return () => frameWindow?.removeEventListener('blur', onBlur);
  }, []);
  React.useEffect(
    () =>
      post({
        kind: 'inputsChanged',
        inputs: inputs,
      }),
    [post, inputs],
  );
  React.useEffect(
    () =>
      post({
        kind: 'lookChanged',
        look: look,
      }),
    [post, look],
  );
  React.useImperativeHandle(
    tellsOfPointer,
    () => ({
      isAt: (at?: Dynamic) =>
        post({
          kind: 'pointerAt',
          at: at,
        }),
      hasPressedAt(at?: Dynamic) {
        if (!isOnShow || finishLeavingRef.current !== null) return;
        let { clientWidth: width = 0, clientHeight: height = 0 } = frameRef.current ?? {};
        let message = pressedAtMessage(at, {
          width: width,
          height: height,
        });
        if (message !== null) post(message);
      },
    }),
    [post, isOnShow],
  );
  return jsx('figure', {
    className: 'sheet-figure-of-chart size-full',
    children: jsx('iframe', {
      className: 'sheet-chart-frame',
      sandbox: 'allow-scripts',
      srcDoc: frameDocument,
      title: name,
      'aria-hidden': true,
      ref: frameRef,
      tabIndex: -1,
      'data-is-on-show': isOnShow,
      onLoad: ({ currentTarget: currentTarget }: Dynamic) => connect(currentTarget),
    }),
  });
}
export const CHART_FRAME_REPLY_TIMEOUT_MS = 40000;
export const CHART_FRAME_CARET_CHECK_MS = 100;
export const CHART_FRAME_LEAVE_TIMEOUT_MS = 1e4;
