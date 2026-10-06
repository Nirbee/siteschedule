/** Widths of server-rendered page images (shared by the renderer and the client viewer). */
export const PAGE_WIDTHS = [800, 1200, 1800, 2400] as const;
export type PageWidth = (typeof PAGE_WIDTHS)[number];

export function isPageWidth(value: number): value is PageWidth {
  return (PAGE_WIDTHS as readonly number[]).includes(value);
}
