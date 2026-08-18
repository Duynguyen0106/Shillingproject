const API_BASE = process.env.API_BASE || "http://localhost:4000";
const COMMUNITY_ID = process.env.COMMUNITY_ID || "demo-community";

async function post(path, body) {
  const res = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body)
  });
  if (!res.ok) throw new Error(`POST ${path} failed: ${res.status}`);
  return res.json();
}

async function get(path) {
  const res = await fetch(`${API_BASE}${path}`);
  if (!res.ok) throw new Error(`GET ${path} failed: ${res.status}`);
  return res.json();
}

async function main() {
  const ingest = await post("/signals/ingest", {
    communityId: COMMUNITY_ID,
    type: "MENTION_SPIKE",
    severity: 85,
    sourceRef: `smoke-${Date.now()}`,
    metadata: { ticker: "PEPE", spikePct: 42 }
  });

  const missionId = ingest?.mission?.id;
  if (!missionId) throw new Error("No mission returned from signal ingest");
  const mission = await get(`/missions/${missionId}`);
  const taskId = mission?.tasks?.[0]?.id;
  if (!taskId) throw new Error("No mission task found");

  await post(`/missions/${missionId}/claim`, {
    wallet: "0xsmoke0001"
  });

  await post(`/tasks/${taskId}/submissions`, {
    wallet: "0xsmoke0001",
    proofUrl: "https://x.com/example/smoke",
    proofText: "smoke proof text",
    engagementValue: 33
  });

  const link = await post("/links", {
    communityId: COMMUNITY_ID,
    missionId,
    targetUrl: `http://localhost:3000/app/missions/${missionId}`
  });

  const leaderboard = await get(`/communities/${COMMUNITY_ID}/leaderboard`);
  const attribution = await get(`/communities/${COMMUNITY_ID}/attribution`);
  const me = await get(`/me?wallet=0xsmoke0001&communityId=${COMMUNITY_ID}`);

  console.log(
    JSON.stringify(
      {
        ok: true,
        missionId,
        taskId,
        shortCode: link.code,
        leaderboardTop: leaderboard[0] ?? null,
        attributionCount: attribution.length,
        myPoints: me.points,
        myRank: me.rank
      },
      null,
      2
    )
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
