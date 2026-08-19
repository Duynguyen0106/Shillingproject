import NotificationTestButtons from "./NotificationTestButtons";
import { apiGetSafe } from "../../../../lib/api";

type Alert = {
  id: string;
  channel: string;
  message: string;
  delivered: boolean;
  createdAt: string;
};

export default async function AdminNotificationsPage() {
  const alerts = await apiGetSafe<Alert[]>("/notifications", []);
  return (
    <main className="container">
      <h1>Admin: Alerts</h1>
      <p className="muted">Telegram and Discord mission alerts. Delivery requires webhook URLs in the API env.</p>
      <NotificationTestButtons />
      {alerts.length === 0 && <p>No alerts yet. Ingest a signal or send a test.</p>}
      {alerts.map((alert) => (
        <div key={alert.id} className="card">
          <div className="row">
            <strong>{alert.channel}</strong>
            <span className="badge">{alert.delivered ? "delivered" : "logged only"}</span>
          </div>
          <pre style={{ whiteSpace: "pre-wrap" }}>{alert.message}</pre>
        </div>
      ))}
    </main>
  );
}
