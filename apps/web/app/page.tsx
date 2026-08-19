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
          The raid feed lists KOL posts and ticker/CA mentions. Call a focus raid so the room replies under one tweet instead of hunting on X.
        </p>
        <div className="row" style={{ margin: "18px 0 24px" }}>
          <Link href="/app/feed" className="btn">Open raid feed</Link>
          <Link href="/app" className="btn secondary">Missions</Link>
          <Link href="/app/me" className="btn secondary">My Ops</Link>
        </div>
      </section>
      <ContractSearch />
      <JoinCta />
      <ActivityFeed communityId={communityId} />
    </main>
  );
}
