import Link from "next/link";

export default function EmptyState({
  icon = "📭",
  title,
  description,
  actionHref,
  actionLabel
}: {
  icon?: string;
  title: string;
  description: string;
  actionHref?: string;
  actionLabel?: string;
}) {
  return (
    <div className="empty-state">
      <div className="empty-state-icon" aria-hidden>{icon}</div>
      <h3 className="empty-state-title">{title}</h3>
      <p className="muted empty-state-desc">{description}</p>
      {actionHref && actionLabel && (
        <Link href={actionHref} className="btn empty-state-action">{actionLabel}</Link>
      )}
    </div>
  );
}
