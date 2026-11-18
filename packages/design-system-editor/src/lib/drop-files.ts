/** Capture drag entries during the drop event, then walk every batch of each folder. */
export async function droppedBrandFiles(data: DataTransfer): Promise<File[]> {
  const items = [...data.items].filter((item) => item.kind === 'file');
  if (!items.length) return [...data.files];
  async function walk(entry: FileSystemEntry): Promise<File[]> {
    if (entry.isFile) {
      const file = await new Promise<File>((resolve, reject) => (entry as FileSystemFileEntry).file(resolve, reject));
      Object.defineProperty(file, 'webkitRelativePath', { configurable: true, value: entry.fullPath.replace(/^\//, '') });
      return [file];
    }
    const reader = (entry as FileSystemDirectoryEntry).createReader();
    const files: File[] = [];
    while (true) {
      const children = await new Promise<FileSystemEntry[]>((resolve, reject) => reader.readEntries(resolve, reject));
      if (!children.length) return files;
      for (const child of children) {
        if (!child.name.startsWith('.')) files.push(...await walk(child));
      }
    }
  }
  return (await Promise.all(items.map((item) => {
    const entry = item.webkitGetAsEntry?.();
    const file = item.getAsFile();
    return entry ? walk(entry) : file ? [file] : [];
  }))).flat();
}
