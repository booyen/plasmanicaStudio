// Trigger a browser download for an exported Blob.
export function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

/** Legacy-style filename: plasma_<material>_<motion>_<suffix>.<ext> */
export function exportName(material: string, motion: string, suffix: string, ext: string): string {
  const slug = (s: string) => s.toLowerCase().replace(/ /g, '-');
  return `plasma_${slug(material)}_${slug(motion)}_${suffix}.${ext}`;
}
