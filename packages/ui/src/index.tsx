import type { ReactNode } from "react";

export function Panel({ children }: { children: ReactNode }) {
  return <div style={{ border: "1px solid #27272a", borderRadius: 12, padding: 16 }}>{children}</div>;
}
