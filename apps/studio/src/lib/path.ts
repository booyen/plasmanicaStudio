// Dotted-path get/set over the config tree (e.g. `cursor.lag`, `flow.amount`,
// `center.0`). Arrays are indexed by numeric string keys. Shared by the store
// and the controls so a slider can bind to one leaf.

export function getByPath(root: unknown, path: string): unknown {
  return path.split('.').reduce<any>((acc, k) => (acc == null ? acc : acc[k]), root);
}

/** Immutable nested set — clones each node along the path. */
export function setByPath<T>(root: T, path: string, value: unknown): T {
  const keys = path.split('.');
  const clone: any = Array.isArray(root) ? [...(root as any)] : { ...(root as any) };
  let cur = clone;
  for (let i = 0; i < keys.length - 1; i++) {
    const k = keys[i];
    const child = cur[k];
    cur[k] = Array.isArray(child) ? [...child] : { ...child };
    cur = cur[k];
  }
  cur[keys[keys.length - 1]] = value;
  return clone;
}
