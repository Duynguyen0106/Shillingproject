import Link from "next/link";
import ActivityFeed from "./ActivityFeed";
import ContractSearch from "./ContractSearch";
import JoinCta from "./JoinCta";
import { getRequestCommunityId } from "../lib/communityServer";

export default async function HomePage() {
  const communityId = getRequestCommunityId();
  return (
    <main className="container">
      <section className="hero">
        <div className="kicker">Signal to action</div>
        <h1>Memecoin Shill Ops</h1>
        <p className="muted">
          Search the DexScreener contract, then operate in the only community bound to that mint.
          Telegram CTOs can fake a name. They cannot fake this contract.
        </p>
        <div className="row" style={{ margin: "18px 0 24px" }}>
          <Link href="/app" className="btn">Open Mission Board</Link>
          <Link href="/app/me" className="btn secondary">My Ops</Link>
          <Link href="/app/admin/signals" className="btn secondary">Ingest a signal</Link>
        </div>
      </section>
      <ContractSearch />
      <JoinCta />
      <ActivityFeed communityId={communityId} />
    </main>
  );
}
