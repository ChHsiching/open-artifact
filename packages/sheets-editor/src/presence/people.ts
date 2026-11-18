import type { Dynamic } from '../dynamic.ts';
import { isNonNullObject } from '../utils/objects.ts';
import type { PageApi } from '../host/sheets-host.ts';
export function readProfile(profile?: Dynamic) {
  if (!isNonNullObject(profile)) return null;
  let { id: userId, name: profileName, avatarUrl: avatarUrl, color: color, isMe: isMe, guest: guest } = profile;
  if (typeof userId !== 'string' || typeof profileName !== 'string' || typeof avatarUrl !== 'string') return null;
  return {
    userId: userId,
    name: profileName,
    avatarUrl: avatarUrl,
    color: typeof color === 'string' ? color : null,
    isViewer: isMe === true,
    isGuest: guest === true,
  };
}
export function createPeopleDirectory(page: PageApi) {
  let userApi: Dynamic = null;
  let useUser = () => {
    userApi ??= page.use('user');
    return userApi;
  };
  let callUser = async (method?: Dynamic, argument?: Dynamic): Promise<Dynamic> => {
    try {
      let value = await useUser();
      let call = isNonNullObject(value) && value.available !== false ? value[method] : null;
      return typeof call === 'function' ? await call.call(value, argument) : null;
    } catch (value: Dynamic) {
      reportError(value);
      return null;
    }
  };
  return {
    async viewer(): Promise<Dynamic> {
      let me = await callUser('me');
      if (!isNonNullObject(me)) return null;
      let { id: userId, name: displayName } = me;
      return typeof userId === 'string' && typeof displayName === 'string' && displayName !== ''
        ? {
            userId: userId,
            name: displayName,
          }
        : null;
    },
    async search(query?: Dynamic): Promise<Dynamic> {
      let found = await callUser('search', query);
      return Array.isArray(found) ? readProfiles(found) : [];
    },
    async profiles(userIds?: Dynamic): Promise<Dynamic> {
      let found = await callUser('profiles', userIds);
      return isNonNullObject(found) ? readProfiles(Object.values(found)) : [];
    },
  };
}
export const readProfiles = (profiles?: Dynamic) => profiles.map(readProfile).filter((input?: Dynamic) => input !== null);
