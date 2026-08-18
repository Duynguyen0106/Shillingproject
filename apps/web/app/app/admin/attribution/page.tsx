import CreateLinkForm from "./CreateLinkForm";
import { getRequestCommunityId } from "../../../../lib/communityServer";
import { apiGetSafe } from "../../../../lib/api";

type LinkStats = {
  code: string;
  targetUrl: string;
  clicks: number;
  wallet?: string | null;
  displayName?: string | null;
};

const API_BASE = process.env.NEXT_PUBLIC_API_BASE || "http://localhost:4000";

export default async function AdminAttributionPage() {
  const communityId = getRequestCommunityId();
  const rows = await apiGetSafe<LinkStats[]>(`/communities/${communityId}/attribution`, []);
  return (
    <main className="container">
      <h1>Admin: Attribution</h1>
      <p>Create tracked short links and review click counts.</p>
      <CreateLinkForm />
      {rows.length === 0 && <p>No tracked links yet.</p>}
      {rows.map((row) => (
        <div key={row.code} className="card">
          <strong>{row.code}</strong> → {row.targetUrl} ({row.clicks} clicks)
          <div className="muted">
            {row.wallet ? `Contributor: ${row.displayName || row.wallet}` : "Community link"}
          </div>
          <div>
            <a href={`${API_BASE}/r/${row.code}`} target="_blank" rel="noreferrer">Open tracked link</a>
          </div>
        </div>
      ))}
    </main>
  );
}
