/** Exact match for /app so it does not highlight for every /app/* route. */
export function isNavActive(href: string, pathname: string): boolean {
  if (href === "/app") return pathname === "/app";
  return pathname === href || pathname.startsWith(`${href}/`);
}
