"use client";

type Point = { date: string; points: number; cumulative?: number };

/** Minimal SVG sparkline — no chart library. */
export default function SeasonSparkline({
  data,
  mode = "daily",
  width = 280,
  height = 56,
  label
}: {
  data: Point[];
  mode?: "daily" | "cumulative";
  width?: number;
  height?: number;
  label?: string;
}) {
  if (!data.length) {
    return <div className="sparkline-empty muted">No activity yet this season</div>;
  }

  const values = data.map((d) => (mode === "cumulative" ? d.cumulative ?? d.points : d.points));
  const max = Math.max(...values, 1);
  const min = Math.min(...values, 0);
  const range = max - min || 1;
  const pad = 4;
  const innerW = width - pad * 2;
  const innerH = height - pad * 2;

  const coords = values.map((v, i) => {
    const x = pad + (i / Math.max(values.length - 1, 1)) * innerW;
    const y = pad + innerH - ((v - min) / range) * innerH;
    return `${x},${y}`;
  });

  const linePath = `M ${coords.join(" L ")}`;
  const areaPath = `${linePath} L ${pad + innerW},${pad + innerH} L ${pad},${pad + innerH} Z`;
  const latest = values[values.length - 1] ?? 0;
  const peak = Math.max(...values);

  return (
    <div className="sparkline-wrap">
      {label && <div className="sparkline-label">{label}</div>}
      <svg
        className="sparkline-svg"
        viewBox={`0 0 ${width} ${height}`}
        width={width}
        height={height}
        role="img"
        aria-label={`Season activity chart, latest ${latest} points`}
      >
        <defs>
          <linearGradient id="sparkFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#6c47ff" stopOpacity="0.35" />
            <stop offset="100%" stopColor="#6c47ff" stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d={areaPath} fill="url(#sparkFill)" />
        <path d={linePath} fill="none" stroke="#6c47ff" strokeWidth="2" strokeLinejoin="round" />
        {coords.length > 0 && (
          <circle
            cx={coords[coords.length - 1].split(",")[0]}
            cy={coords[coords.length - 1].split(",")[1]}
            r="3"
            fill="#a78bfa"
          />
        )}
      </svg>
      <div className="sparkline-stats">
        <span><strong>{latest.toLocaleString()}</strong> <span className="muted">latest day</span></span>
        <span><strong>{peak.toLocaleString()}</strong> <span className="muted">peak day</span></span>
        <span><strong>{values.reduce((a, b) => a + b, 0).toLocaleString()}</strong> <span className="muted">total</span></span>
      </div>
    </div>
  );
}
