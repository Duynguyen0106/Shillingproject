import { apiGet } from "../../../../lib/api";

type LinkStats = {
  code: string;
  targetUrl: string;
  clicks: number;
};

const COMMUNITY_ID = process.env.NEXT_PUBLIC_DEMO_COMMUNITY_ID || "demo-community";

export default async function AdminAttributionPage() {
  const rows = await apiGet<LinkStats[]>(`/communities/${COMMUNITY_ID}/attribution`);
  return (
    <main className="container">
      <h1>Admin: Attribution</h1>
      {rows.map((row) => (
        <div key={row.code} className="card">
          <strong>{row.code}</strong> → {row.targetUrl} ({row.clicks} clicks)
        </div>
      ))}
    </main>
  );
}
