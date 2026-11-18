import type { Dynamic } from '../../dynamic.ts';
import * as React from 'react';
export function useTooltipHeldAsPaneOpens() {
  let [isHeld, setIsHeld] = React.useState(true);
  let end = () => setIsHeld(false);
  return {
    ofButton: {
      ...(isHeld && {
        tooltip: '',
      }),
      onBlur: end,
    },
    end: end,
  };
}
