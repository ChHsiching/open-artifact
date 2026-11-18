import type { Dynamic } from '../dynamic.ts';
import { translateMessage } from '../i18n/messages.ts';
export const toolSearchMessages = {
  suggestTools: () =>
    translateMessage({
      defaultMessage: 'Suggest tools',
      id: 'k7wmePXJUW',
    }),
  findingTools: () =>
    translateMessage({
      defaultMessage: 'Finding tools…',
      id: 'BTVXk29Nfk',
    }),
  noTool: () =>
    translateMessage({
      defaultMessage: 'No tool for this',
      id: '+RNYUijT8l',
    }),
  couldNotSuggest: () =>
    translateMessage({
      defaultMessage: 'Couldn’t suggest tools',
      id: 'L5SzKvovbt',
    }),
  namesOfAgent: () =>
    new (Set as Dynamic)(
      translateMessage({
        defaultMessage: 'ai agent assistant chatbot',
        id: 'MdaZqp2Hye',
      }).split(/[^\p{L}\p{M}\p{N}]+/u),
    ),
  wordsOfAQuestion: () =>
    new (Set as Dynamic)(
      translateMessage({
        defaultMessage: 'ask why how what explain if',
        id: 'RVGrUnafNT',
      }).split(/[^\p{L}\p{M}\p{N}]+/u),
    ),
  littleWords: () =>
    new (Set as Dynamic)(
      translateMessage({
        defaultMessage:
          'a an the this that these those here there it its for and or to of in on as at by if is are be with all my me i you we please make add put show set get turn give want need can based from into than when then them some more less very like cell cells',
        id: '/RIlQiHyTu',
      }).split(/\s+/),
    ),
};
