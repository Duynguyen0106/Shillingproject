import { apiGet } from "../../../../lib/api";
import ClaimButton from "./ClaimButton";
import CompleteMissionButton from "./CompleteMissionButton";
import ShareKit from "../../../ShareKit";
import PlayTasks, { type PlayTask } from "./PlayTasks";
import WarRoom, { type WarRoomData } from "./WarRoom";
import FocusRaidCard from "../../../FocusRaidCard";
import { formatRemaining } from "../../../../lib/missionTime";
import type { FocusRaid } from "../../../../lib/shillAction";

type ShortLink = {
  code: string;
  targetUrl: string;
  clicks?: number;
};

type Claim = {
  id: string;
  user?: { wallet: string; displayName?: string | null };
};

type Mission = {
  id: string;
  title: string;
  description: string;
  priority: string;
  urgency: number;
  status: string;
  tasks: PlayTask[];
  signal?: { type: string; severity: number; metadata?: Record<string, unknown> | null } | null;
  shortLinks?: ShortLink[];
  claims?: Claim[];
  claimsCount?: number;
  remainingMs?: number | null;
  communityId?: string;
  warRoom?: WarRoomData;
  raidTarget?: string | null;
  focus?: FocusRaid | null;
};

const API_BASE = process.env.NEXT_PUBLIC_API_BASE || "http://localhost:4000";

export default async function MissionDetailsPage({ params }: { params: { id: string } }) {
  const mission = await apiGet<Mission>(`/missions/${params.id}`);
  const tracked = mission.shortLinks?.[0];
  return (
    <main className="container">
      <h1>{mission.title}</h1>
      <p className="muted">{mission.description}</p>
      <p className="muted">
        {mission.signal
          ? "Standing plays are always on this raid. Quote/KOL overlays appear because this mission was created from a live signal."
          : "This daily pulse does not wait on X posts, KOL mentions, or volume. Ingest a signal to overlay a raid."}
      </p>
      <div className="row">
        <span className={`badge ${mission.priority === "HIGH" ? "high" : ""}`}>Priority: {mission.priority}</span>
        <span>Urgency: {mission.urgency}</span>
        <span>Status: {mission.status}</span>
        {mission.signal && <span>Signal: {mission.signal.type}</span>}
        {!mission.signal && <span>Daily pulse</span>}
        <span>Claims: {mission.claimsCount ?? mission.claims?.length ?? 0}</span>
        {typeof mission.remainingMs === "number" && <span>{formatRemaining(mission.remainingMs)}</span>}
      </div>
      {mission.focus && <FocusRaidCard focus={mission.focus} compact />}
      {mission.raidTarget && (
        <div className="card">
          <strong>Reply / quote this post</strong>
          <p>
            <a href={mission.raidTarget} target="_blank" rel="noreferrer">{mission.raidTarget}</a>
          </p>
          <p className="muted">This URL was attached when the signal was ingested. The app does not search X for you.</p>
        </div>
      )}
      <WarRoom
        missionId={mission.id}
        communityId={mission.communityId}
        initial={mission.warRoom ?? {
          closed: mission.status !== "ACTIVE",
          pin: null,
          checkIns: [],
          checkInCount: 0,
          claimsCount: mission.claimsCount ?? mission.claims?.length ?? 0,
          proofCount: 0,
          clickCount: tracked?.clicks ?? 0
        }}
      />
      {tracked && (
        <div className="card">
          <strong>Tracked CTA</strong>
          <p>
            <a href={`${API_BASE}/r/${tracked.code}`} target="_blank" rel="noreferrer">
              {API_BASE}/r/{tracked.code}
            </a>
          </p>
          <p className="muted">{tracked.clicks ?? 0} clicks attributed</p>
        </div>
      )}
      {mission.status === "ACTIVE" ? (
        <>
          <ClaimButton missionId={mission.id} />
          <ShareKit
            missionId={mission.id}
            title={mission.title}
            signalType={mission.signal?.type}
            metadata={(mission.signal?.metadata ?? undefined) as Record<string, unknown> | undefined}
            communityCode={tracked?.code}
          />
          <CompleteMissionButton missionId={mission.id} status={mission.status} />
          <PlayTasks missionId={mission.id} tasks={mission.tasks} closed={false} />
        </>
      ) : (
        <div className="card">
          <p>This mission is {mission.status.toLowerCase()}. Claims, shares, and new proofs are closed.</p>
        </div>
      )}
      {mission.status !== "ACTIVE" && (
        <PlayTasks missionId={mission.id} tasks={mission.tasks} closed />
      )}
    </main>
  );
}
