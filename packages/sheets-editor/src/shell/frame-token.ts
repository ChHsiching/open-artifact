import type { Dynamic } from '../dynamic.ts';
export function reloadOpaqueSandboxedFrames(root?: Dynamic) {
  for (let frame of root.querySelectorAll('iframe[sandbox]:not([sandbox~="allow-same-origin"])') as Dynamic) {
    let { parentNode: parent, nextSibling: nextSibling } = frame;
    frame.remove();
    frame.srcdoc = '';
    parent?.insertBefore(frame, nextSibling);
  }
}
export function stripFrameTimestampParams(win: Dynamic = window) {
  try {
    if (!windowsWatchingFrameParams.has(win)) {
      win.addEventListener('popstate', () => {
        if (!stripFrameTimestampParams(win)) reloadOpaqueSandboxedFrames(win.document);
      });
      windowsWatchingFrameParams.add(win);
    }
    let { search: search, pathname: pathname, hash: hash } = win.location;
    if (hasFrameTimestampParam(search)) {
      let kept = search
        .slice(1)
        .split('&')
        .filter((param?: Dynamic) => !frameTimestampParamPattern.test(param))
        .join('&');
      win.history.replaceState(win.history.state, '', pathname + (kept === '' ? '' : '?' + kept) + hash);
    }
    return !hasFrameTimestampParam(win.location.search) && !hasFrameTimestampParam(new (URL as Dynamic)(win.document.baseURI).search);
  } catch {
    return false;
  }
}
export const frameTimestampParamPattern = /^__frame_t(?:=|$)/;
export const hasFrameTimestampParam = (search?: Dynamic) =>
  search
    .slice(1)
    .split('&')
    .some((param?: Dynamic) => frameTimestampParamPattern.test(param));
export const windowsWatchingFrameParams = new (WeakSet as Dynamic)();
