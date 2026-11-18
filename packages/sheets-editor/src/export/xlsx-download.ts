import type { Dynamic } from '../dynamic.ts';
import { createFileExport } from './file-export.ts';
import { zipXlsxParts } from './zip.ts';
export function createXlsxDownload(shell?: Dynamic, compress?: Dynamic) {
  let { offer: offerFile, isFileOnItsWay: isFileOnItsWay } = createFileExport('xlsx', shell);
  return {
    isFileOnItsWay: isFileOnItsWay,
    offer: (makeXlsx?: Dynamic) =>
      offerFile(
        makeXlsx === null
          ? null
          : async (reason?: Dynamic): Promise<Dynamic> => {
              let made = await makeXlsx(true, reason);
              if (made === null || made === 'threw') return made;
              let { filename: filename, onSaved: onSaved } = made;
              let zipped = await zipXlsxParts(made, compress);
              return {
                filename: filename,
                data: zipped,
                onSaved: () => onSaved('downloaded', null),
              };
            },
      ),
  };
}
