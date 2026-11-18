import { useToasts } from '../kit/toast.tsx';
import type { Dynamic } from '../dynamic.ts';
import * as React from 'react';
import { jsx } from 'react/jsx-runtime';
import { UncommentableToastText } from '../shell/ui-root.ts';
export function MountedToast({
  words: words,
  icon: icon,
  action: action,
  staysUntilClosed: staysUntilClosed,
  onOver: onOver,
  onTakenDown: onTakenDown,
}: Dynamic) {
  let value = useToasts();
  let value2 = React.useEffectEvent(
    (input?: Dynamic) =>
      value.add({
        title: jsx(UncommentableToastText, {
          children: words,
        }),
        icon: icon,
        action: action,
        ...(staysUntilClosed && {
          timeout: 0,
        }),
        onClose: (input2?: Dynamic) => {
          if (input.current) onOver(input2);
        },
      }),
  );
  let value3 = React.useEffectEvent((input?: Dynamic) => {
    value.close(input);
    onTakenDown();
  });
  React.useEffect(() => {
    let state = {
      current: true,
    };
    let value4 = value2(state);
    return () => {
      state.current = false;
      value3(value4);
    };
  }, []);
  return null;
}
