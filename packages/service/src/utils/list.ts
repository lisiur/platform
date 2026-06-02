export function prepend<T>(list: T | T[] | undefined, item: T | undefined): T[] {
  if (item === undefined) {
    if (list === undefined) return [];
    if (Array.isArray(list)) return [...list];
    return [list];
  }
  if (list === undefined) return [item];
  if (Array.isArray(list)) return [item, ...list];
  return [item, list];
}
