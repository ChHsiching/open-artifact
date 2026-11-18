import type { Dynamic } from '../dynamic.ts';
import { shortenUrlMiddle, MAX_SHOWN_LINK_LENGTH } from './cell-links.ts';
export function splitUrlForDisplay(url?: Dynamic) {
  let { origin: origin, host: host } = new (URL as Dynamic)(url);
  let rest = url.slice(origin.length);
  let isRestLong = rest.length > URL_REST_SHOWN_LENGTH;
  let restLeftOut = isRestLong ? 'some' : 'nothing';
  return {
    origin: origin,
    rest: isRestLong ? `${rest.slice(0, 16)}…${rest.slice(-8)}` : rest,
    leftOut: rest.length > URL_REST_LONG_LENGTH ? 'much' : restLeftOut,
    isSiteLong: host.length > LONG_SITE_LENGTH,
  };
}
export function shortenedUrlRest(url?: Dynamic) {
  let { origin: origin } = new (URL as Dynamic)(url);
  let restLength = Math.max(URL_REST_SHOWN_LENGTH, URL_TWO_LINE_LENGTH - origin.length);
  return shortenUrlMiddle(restLength, url).slice(origin.length);
}
export function urlsShownAlike(urls?: Dynamic) {
  let shownUrls = urls.map((url?: Dynamic) => {
    let { origin: origin, rest: rest } = splitUrlForDisplay(url);
    return `${origin}${rest}`;
  });
  return urls.filter(
    (url?: Dynamic, index?: Dynamic) => shownUrls.filter((input?: Dynamic) => input === shownUrls[index]).length > 1,
  );
}
export function urlForDisplay(url?: Dynamic, dropScheme?: Dynamic) {
  let shortened = shortenUrlMiddle(MAX_SHOWN_LINK_LENGTH, url);
  return dropScheme ? withoutHttpsScheme(shortened) : shortened;
}
export function githubReferenceOf(url?: Dynamic) {
  let { host: host, pathname: pathname } = new (URL as Dynamic)(url);
  for (let face of GITHUB_LINK_FACES as Dynamic) {
    let match = face.host.test(host) ? face.path.exec(pathname) : null;
    if (match !== null) return face.face(match);
  }
  return null;
}
export const LONG_SITE_LENGTH = 30;
export const URL_REST_SHOWN_LENGTH = 28;
export const URL_REST_LONG_LENGTH = 60;
export const URL_TWO_LINE_LENGTH = 72;
export const withoutHttpsScheme = (url?: Dynamic) => url.replace(/^https:\/\//, '').replace(/^([^/]+)\/$/, '$1');
export const githubReferenceFace =
  (kind?: Dynamic) =>
  ([, owner = '', repository = '', number = '']: Dynamic) => ({
    kind: kind,
    owner: owner,
    repository: repository,
    number: number,
  });
export const GITHUB_HOST_PATTERN = /^github\.com$/;
export const GITHUB_LINK_FACES = [
  {
    host: GITHUB_HOST_PATTERN,
    path: /^\/([^/]+)\/([^/]+)\/pull\/(\d+)(?:\/|$)/,
    face: githubReferenceFace('pullRequest'),
  },
  {
    host: GITHUB_HOST_PATTERN,
    path: /^\/([^/]+)\/([^/]+)\/issues\/(\d+)(?:\/|$)/,
    face: githubReferenceFace('issue'),
  },
];
export const isOpenLinkShortcut = (mode?: Dynamic, keyPress?: Dynamic) =>
  mode.kind === 'navigating' && keyPress.key === 'Enter' && keyPress.isAltHeld && !keyPress.isShiftHeld && !keyPress.isModifierHeld;
