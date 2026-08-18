import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { Priority, SignalType } from "@prisma/client";
import { createApp } from "./app";

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
      priority: Priority.HIGH
    });

    const app = createApp({
      signal: { upsert: upsertSignal },
      mission: { findFirst: findMission, create: createMission }
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
