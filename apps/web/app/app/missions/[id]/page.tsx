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
  tasks: Task[];
};

export default async function MissionDetailsPage({ params }: { params: { id: string } }) {
  const mission = await apiGet<Mission>(`/missions/${params.id}`);
  return (
    <main className="container">
      <h1>{mission.title}</h1>
      <p>{mission.description}</p>
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
