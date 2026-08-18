import { apiGet } from "../../../../lib/api";
import ClaimButton from "./ClaimButton";
import CompleteMissionButton from "./CompleteMissionButton";
import SubmissionForm from "./SubmissionForm";

type Task = {
  id: string;
  title: string;
  actionType: string;
  platform: string;
  basePoints: number;
};

type ShortLink = {
  code: string;
  targetUrl: string;
};

type Mission = {
  id: string;
  title: string;
  description: string;
  priority: string;
  urgency: number;
  status: string;
  tasks: Task[];
  signal?: { type: string; severity: number } | null;
  shortLinks?: ShortLink[];
  claims?: { id: string }[];
};

const API_BASE = process.env.NEXT_PUBLIC_API_BASE || "http://localhost:4000";

export default async function MissionDetailsPage({ params }: { params: { id: string } }) {
  const mission = await apiGet<Mission>(`/missions/${params.id}`);
  const tracked = mission.shortLinks?.[0];
  return (
    <main className="container">
      <h1>{mission.title}</h1>
      <p className="muted">{mission.description}</p>
      <div className="row">
        <span className={`badge ${mission.priority === "HIGH" ? "high" : ""}`}>Priority: {mission.priority}</span>
        <span>Urgency: {mission.urgency}</span>
        <span>Status: {mission.status}</span>
        {mission.signal && <span>Signal: {mission.signal.type}</span>}
        <span>Claims: {mission.claims?.length ?? 0}</span>
      </div>
      {tracked && (
        <div className="card">
          <strong>Tracked CTA</strong>
          <p>
            <a href={`${API_BASE}/r/${tracked.code}`} target="_blank" rel="noreferrer">
              {API_BASE}/r/{tracked.code}
            </a>
          </p>
        </div>
      )}
      <ClaimButton missionId={mission.id} />
      <CompleteMissionButton missionId={mission.id} status={mission.status} />
      {mission.tasks.map((task) => (
        <div key={task.id} className="card">
          <h3>{task.title}</h3>
          <p>{task.actionType} on {task.platform} · Base points {task.basePoints}</p>
          <SubmissionForm taskId={task.id} />
        </div>
      ))}
    </main>
  );
}
