import { apiGet } from "../../../../lib/api";
import SubmissionForm from "./SubmissionForm";

type Task = {
  id: string;
  title: string;
  actionType: string;
  platform: string;
  basePoints: number;
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
};

export default async function MissionDetailsPage({ params }: { params: { id: string } }) {
  const mission = await apiGet<Mission>(`/missions/${params.id}`);
  return (
    <main className="container">
      <h1>{mission.title}</h1>
      <p>{mission.description}</p>
      <div className="row">
        <span className={`badge ${mission.priority === "HIGH" ? "high" : ""}`}>Priority: {mission.priority}</span>
        <span>Urgency: {mission.urgency}</span>
        <span>Status: {mission.status}</span>
        {mission.signal && <span>Signal: {mission.signal.type}</span>}
      </div>
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
