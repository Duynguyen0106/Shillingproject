import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { ActionType, Priority, SignalType } from "@prisma/client";
import { createApp, scoreSubmission, buildMissionAlertMessage } from "./app";

describe("API validation and health", () => {
  const app = createApp({} as never);

  it("returns health status", async () => {
    const res = await request(app).get("/health");
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });

  it("rejects invalid signal ingest payload", async () => {
    const res = await request(app).post("/signals/ingest").send({
      communityId: "demo-community",
      type: "INVALID_SIGNAL",
      severity: 20
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("Validation failed");
  });

  it("rejects invalid short link payload", async () => {
    const res = await request(app).post("/links").send({
      communityId: "demo-community",
      targetUrl: "not-a-url"
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("Validation failed");
  });
});

describe("signal to mission flow", () => {
  it("auto-creates mission on first signal ingest", async () => {
    const upsertSignal = vi.fn().mockResolvedValue({
      id: "sig-1",
      type: SignalType.MENTION_SPIKE,
      severity: 85,
      metadata: { ticker: "PEPE", spikePct: 40 }
    });
    const findMission = vi.fn().mockResolvedValue(null);
    const createMission = vi.fn().mockResolvedValue({
      id: "mission-1",
      title: "MENTION SPIKE response",
      priority: Priority.HIGH,
      shortLinks: []
    });
    const createLink = vi.fn().mockResolvedValue({ id: "link-1", code: "cta12345" });

    const app = createApp({
      signal: { upsert: upsertSignal },
      mission: { findFirst: findMission, create: createMission },
      shortLink: { create: createLink }
    } as never);

    const res = await request(app).post("/signals/ingest").send({
      communityId: "demo-community",
      type: "MENTION_SPIKE",
      severity: 85,
      sourceRef: "ref-1",
      metadata: { ticker: "PEPE", spikePct: 40 }
    });

    expect(res.status).toBe(200);
    expect(createMission).toHaveBeenCalledTimes(1);
    expect(createLink).toHaveBeenCalledTimes(1);
    expect(res.body.mission.id).toBe("mission-1");
  });

  it("does not create duplicate mission for same signal", async () => {
    const upsertSignal = vi.fn().mockResolvedValue({
      id: "sig-dup",
      type: SignalType.KOL_POST,
      severity: 70,
      metadata: {}
    });
    const existingMission = { id: "mission-existing", title: "existing mission", priority: Priority.MEDIUM };
    const findMission = vi.fn().mockResolvedValue(existingMission);
    const createMission = vi.fn();

    const app = createApp({
      signal: { upsert: upsertSignal },
      mission: { findFirst: findMission, create: createMission }
    } as never);

    const res = await request(app).post("/signals/ingest").send({
      communityId: "demo-community",
      type: "KOL_POST",
      severity: 70,
      sourceRef: "same-ref"
    });

    expect(res.status).toBe(200);
    expect(findMission).toHaveBeenCalledTimes(1);
    expect(createMission).not.toHaveBeenCalled();
    expect(res.body.mission.id).toBe("mission-existing");
  });
});

describe("leaderboard aggregation response", () => {
  it("returns ranked leaderboard rows", async () => {
    const groupBy = vi.fn().mockResolvedValue([
      { userId: "u1", _sum: { points: 42 } },
      { userId: "u2", _sum: { points: 17 } }
    ]);
    const findManyUsers = vi.fn().mockResolvedValue([
      { id: "u1", wallet: "0x111", displayName: "Alpha" },
      { id: "u2", wallet: "0x222", displayName: "Beta" }
    ]);

    const app = createApp({
      score: { groupBy },
      user: { findMany: findManyUsers }
    } as never);

    const res = await request(app).get("/communities/demo-community/leaderboard");
    expect(res.status).toBe(200);
    expect(res.body[0]).toMatchObject({ rank: 1, userId: "u1", points: 42, displayName: "Alpha" });
    expect(res.body[1]).toMatchObject({ rank: 2, userId: "u2", points: 17, displayName: "Beta" });
  });
});

describe("scoring and alerts", () => {
  it("applies early bonus, high priority multiplier, and duplicate penalty", () => {
    const points = scoreSubmission({
      actionType: ActionType.REPLY,
      priority: Priority.HIGH,
      isEarly: true,
      duplicatePenalty: true,
      engagementValue: 25
    });
    expect(points).toBe(18);
  });

  it("builds whale and mention templates", () => {
    const whale = buildMissionAlertMessage({
      missionId: "m1",
      title: "Whale response",
      signalType: SignalType.WHALE_BUY,
      priority: Priority.HIGH,
      metadata: { token: "PEPE" }
    });
    expect(whale).toContain("Whale buy detected for PEPE");
    expect(whale).toContain("/app/missions/m1");

    const spike = buildMissionAlertMessage({
      missionId: "m2",
      title: "Spike response",
      signalType: SignalType.MENTION_SPIKE,
      priority: Priority.MEDIUM,
      metadata: { ticker: "PEPE", spikePct: 42 }
    });
    expect(spike).toContain("Mention spike: PEPE up 42%");
  });
});

describe("attribution tracking", () => {
  it("logs a click and redirects", async () => {
    const findUnique = vi.fn().mockResolvedValue({
      id: "link-1",
      code: "abc12345",
      targetUrl: "https://example.com/mission"
    });
    const createClick = vi.fn().mockResolvedValue({});
    const app = createApp({
      shortLink: { findUnique },
      shortLinkClick: { create: createClick }
    } as never);

    const res = await request(app).get("/r/abc12345");
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe("https://example.com/mission");
    expect(createClick).toHaveBeenCalledTimes(1);
  });

  it("returns attribution click counts", async () => {
    const findMany = vi.fn().mockResolvedValue([
      { code: "abc12345", targetUrl: "https://example.com", _count: { clicks: 3 } }
    ]);
    const app = createApp({
      shortLink: { findMany }
    } as never);

    const res = await request(app).get("/communities/demo-community/attribution");
    expect(res.status).toBe(200);
    expect(res.body[0]).toEqual({ code: "abc12345", targetUrl: "https://example.com", clicks: 3, missionId: undefined });
  });
});

describe("submissions", () => {
  it("awards points and writes a score row", async () => {
    const findUser = vi.fn().mockResolvedValue(null);
    const createUser = vi.fn().mockResolvedValue({ id: "user-1", wallet: "0xdemo" });
    const findTask = vi.fn().mockResolvedValue({
      id: "task-1",
      title: "Reply with narrative",
      actionType: ActionType.REPLY,
      createdAt: new Date(),
      mission: { communityId: "demo-community", priority: Priority.HIGH }
    });
    const createSubmission = vi.fn().mockResolvedValue({ id: "sub-1", pointsAwarded: 18 });
    const createScore = vi.fn().mockResolvedValue({});
    const createEngagement = vi.fn().mockResolvedValue({});
    const groupBy = vi.fn().mockResolvedValue([{ userId: "user-1", _sum: { points: 18 } }]);
    const createSnapshot = vi.fn().mockResolvedValue({});

    const app = createApp({
      user: { findUnique: findUser, create: createUser },
      missionTask: { findUnique: findTask },
      submission: { create: createSubmission },
      score: { create: createScore, groupBy },
      engagementEvent: { create: createEngagement },
      leaderboardSnapshot: { create: createSnapshot }
    } as never);

    const res = await request(app).post("/tasks/task-1/submissions").send({
      wallet: "0xdemo",
      proofUrl: "https://x.com/example/status/1",
      proofText: "copy pasta",
      engagementValue: 25
    });

    expect(res.status).toBe(200);
    expect(createSubmission).toHaveBeenCalledTimes(1);
    expect(createScore).toHaveBeenCalledTimes(1);
    expect(createScore.mock.calls[0][0].data.communityId).toBe("demo-community");
    expect(createEngagement).toHaveBeenCalledTimes(1);
    expect(createSnapshot).toHaveBeenCalledTimes(1);
  });
});

describe("mission claims", () => {
  it("persists a claim for a wallet", async () => {
    const findUser = vi.fn().mockResolvedValue({ id: "user-1", wallet: "0xdemo" });
    const findMission = vi.fn().mockResolvedValue({ id: "mission-1" });
    const upsertClaim = vi.fn().mockResolvedValue({ id: "claim-1", missionId: "mission-1", userId: "user-1" });
    const app = createApp({
      user: { findUnique: findUser },
      mission: { findUnique: findMission },
      missionClaim: { upsert: upsertClaim }
    } as never);

    const res = await request(app).post("/missions/mission-1/claim").send({ wallet: "0xdemo" });
    expect(res.status).toBe(200);
    expect(res.body.claimed).toBe(true);
    expect(upsertClaim).toHaveBeenCalledTimes(1);
  });
});

describe("notification log", () => {
  it("records telegram and discord alerts after a test send", async () => {
    const app = createApp({} as never);
    await request(app).post("/notifications/telegram/test");
    const res = await request(app).get("/notifications");
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.some((entry: { channel: string }) => entry.channel === "TELEGRAM")).toBe(true);
    expect(res.body[0].delivered).toBe(false);
  });
});
