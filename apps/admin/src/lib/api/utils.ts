export { withApiFeedback } from "@repo/frontend";

/** Collect every page of a paginated list endpoint. `fetchPage` receives the
 * offset and returns the page's items plus the endpoint's reported total. */
export async function fetchAllPages<T>(
  fetchPage: (offset: number) => Promise<{ items: T[]; total: number }>,
): Promise<T[]> {
  const items: T[] = [];
  let offset = 0;
  for (;;) {
    const { items: pageItems, total } = await fetchPage(offset);
    items.push(...pageItems);
    offset += pageItems.length;
    if (offset >= total || pageItems.length === 0) break;
  }
  return items;
}
