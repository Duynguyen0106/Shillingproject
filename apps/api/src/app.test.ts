import request from "supertest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ActionType, Priority, SignalType } from "@prisma/client";
import { createApp, scoreSubmission, buildMissionAlertMessage, buildShareCopy, missionTtlMs } from "./app";
import { subscribeLiveFeed } from "./livefeed";

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

  it("routes ingest to the community bound to that contract", async () => {
    const findCommunity = vi.fn().mockResolvedValue({
      id: "pepe-community",
      ticker: "PEPE",
      chainId: "ethereum",
      contractAddress: "0x6982508145454ce325ddbe47a25d4ec3d2311933"
    });
    const upsertSignal = vi.fn().mockResolvedValue({
      id: "sig-mint",
      communityId: "pepe-community",
      type: SignalType.VOLUME_SPIKE,
      severity: 90,
      metadata: {
        ticker: "PEPE",
        chainId: "ethereum",
        contractAddress: "0x6982508145454ce325ddbe47a25d4ec3d2311933"
      }
    });
    const findMission = vi.fn().mockResolvedValue(null);
    const createMission = vi.fn().mockResolvedValue({
      id: "mission-mint",
      title: "PEPE · VOLUME SPIKE response",
      priority: Priority.HIGH,
      shortLinks: []
    });
    const createLink = vi.fn().mockResolvedValue({ id: "link-mint", code: "mintcta1" });

    const app = createApp({
      community: { findFirst: findCommunity },
      signal: { upsert: upsertSignal },
      mission: { findFirst: findMission, create: createMission },
      shortLink: { create: createLink }
    } as never);

    const res = await request(app).post("/signals/ingest").send({
      chainId: "ethereum",
      contractAddress: "0x6982508145454ce325ddbe47a25d4ec3d2311933",
      type: "VOLUME_SPIKE",
      severity: 90,
      sourceRef: "dex-vol-1"
    });

    expect(res.status).toBe(200);
    expect(findCommunity).toHaveBeenCalledWith({
      where: {
        chainId: "ethereum",
        contractAddress: "0x6982508145454ce325ddbe47a25d4ec3d2311933"
      }
    });
    expect(upsertSignal.mock.calls[0][0].create.communityId).toBe("pepe-community");
    expect(upsertSignal.mock.calls[0][0].create.metadata).toMatchObject({
      ticker: "PEPE",
      chainId: "ethereum",
      contractAddress: "0x6982508145454ce325ddbe47a25d4ec3d2311933"
    });
    expect(createMission.mock.calls[0][0].data.title).toBe("PEPE · VOLUME SPIKE response");
    const dealt = createMission.mock.calls[0][0].data.tasks.create as { title: string; details: string }[];
    expect(dealt.map((task) => task.details)).toEqual([
      "play:reply-narrative",
      "play:quote-signal",
      "play:share-telegram",
      "play:invite-raider"
    ]);
  });

  it("deals standing plays plus a quote overlay and an X Community bonus", async () => {
    const createMission = vi.fn().mockResolvedValue({
      id: "mission-kol",
      title: "KOL POST response",
      priority: Priority.HIGH,
      shortLinks: []
    });
    const app = createApp({
      community: {
        findUnique: vi.fn().mockResolvedValue({
          id: "demo-community",
          xCommunityId: "123456789",
          dexUrl: "https://dexscreener.com/ethereum/0xpair"
        })
      },
      signal: {
        upsert: vi.fn().mockResolvedValue({
          id: "sig-kol",
          communityId: "demo-community",
          type: SignalType.KOL_POST,
          severity: 88,
          metadata: { ticker: "PEPE" }
        })
      },
      mission: { findFirst: vi.fn().mockResolvedValue(null), create: createMission },
      shortLink: { create: vi.fn().mockResolvedValue({ id: "link-kol", code: "kolcta12" }) }
    } as never);

    const res = await request(app).post("/signals/ingest").send({
      communityId: "demo-community",
      type: "KOL_POST",
      severity: 88,
      sourceRef: "kol-1"
    });
    expect(res.status).toBe(200);
    const dealt = createMission.mock.calls[0][0].data.tasks.create as { details: string }[];
    expect(dealt.map((task) => task.details)).toEqual([
      "play:reply-narrative",
      "play:quote-signal",
      "play:share-telegram",
      "x-community:123456789",
      "play:invite-raider"
    ]);
  });

  it("stores the ingested X post URL on reply and quote plays", async () => {
    const createMission = vi.fn().mockResolvedValue({
      id: "mission-target",
      title: "KOL POST response",
      priority: Priority.HIGH,
      shortLinks: []
    });
    const upsertSignal = vi.fn().mockImplementation(async ({ create }: { create: { metadata: Record<string, unknown> } }) => ({
      id: "sig-target",
      communityId: "demo-community",
      type: SignalType.KOL_POST,
      severity: 80,
      metadata: create.metadata
    }));
    const app = createApp({
      community: { findUnique: vi.fn().mockResolvedValue({ id: "demo-community" }) },
      signal: { upsert: upsertSignal },
      mission: { findFirst: vi.fn().mockResolvedValue(null), create: createMission },
      shortLink: { create: vi.fn().mockResolvedValue({ id: "link-t", code: "target01" }) }
    } as never);

    const res = await request(app).post("/signals/ingest").send({
      communityId: "demo-community",
      type: "KOL_POST",
      severity: 80,
      sourceRef: "https://x.com/kol/status/99",
      metadata: { ticker: "PEPE" }
    });
    expect(res.status).toBe(200);
    expect(upsertSignal.mock.calls[0][0].create.metadata.targetUrl).toBe("https://x.com/kol/status/99");
    const dealt = createMission.mock.calls[0][0].data.tasks.create as { details: string }[];
    expect(dealt[0].details).toContain("target:https://x.com/kol/status/99");
    expect(dealt[1].details).toContain("target:https://x.com/kol/status/99");
  });

  it("rejects ticker-only ingest so signals cannot land on a spoofed name", async () => {
    const res = await request(createApp({} as never)).post("/signals/ingest").send({
      q: "PEPE",
      type: "MENTION_SPIKE",
      severity: 80,
      sourceRef: "ticker-only"
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("Ingest requires a contract or DexScreener URL, not a ticker");
  });

  it("returns 404 when the mint has no bound community", async () => {
    const app = createApp({
      community: { findFirst: vi.fn().mockResolvedValue(null) }
    } as never);
    const res = await request(app).post("/signals/ingest").send({
      chainId: "ethereum",
      contractAddress: "0x6982508145454ce325ddbe47a25d4ec3d2311933",
      type: "WHALE_BUY",
      severity: 70,
      sourceRef: "unbound"
    });
    expect(res.status).toBe(404);
    expect(res.body.bindPath).toBe("/c/ethereum/0x6982508145454ce325ddbe47a25d4ec3d2311933");
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
      metadata: { ticker: "PEPE", spikePct: 42, chainId: "ethereum", contractAddress: "0xpepe" }
    });
    expect(spike).toContain("Mention spike: PEPE up 42%");
    expect(spike).toContain("/c/ethereum/0xpepe");

    const pulse = buildMissionAlertMessage({
      missionId: "m3",
      title: "PEPE · Daily pulse",
      signalType: "DAILY_PULSE",
      priority: Priority.LOW,
      metadata: { ticker: "PEPE" }
    });
    expect(pulse).toContain("Daily pulse for PEPE");
    expect(pulse).toContain("No spike required");
  });

  it("builds social share copy with the CTA", () => {
    const copy = buildShareCopy({
      title: "Spike response",
      signalType: SignalType.MENTION_SPIKE,
      metadata: { ticker: "PEPE" },
      ctaUrl: "http://localhost:4000/r/raidcta1"
    });
    expect(copy.x).toContain("PEPE mentions are spiking");
    expect(copy.x).toContain("/r/raidcta1");
    expect(copy.telegram).toContain("CTA:");
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

  it("awards points for a unique click on a contributor CTA", async () => {
    const createClick = vi.fn().mockResolvedValue({});
    const createScore = vi.fn().mockResolvedValue({});
    const createEngagement = vi.fn().mockResolvedValue({});
    const app = createApp({
      shortLink: {
        findUnique: vi.fn().mockResolvedValue({
          id: "link-1",
          code: "raidcta1",
          targetUrl: "https://example.com/mission",
          userId: "user-1",
          communityId: "demo-community",
          mission: { status: "ACTIVE", priority: Priority.HIGH }
        })
      },
      shortLinkClick: { create: createClick, findFirst: vi.fn().mockResolvedValue(null) },
      score: {
        aggregate: vi.fn().mockResolvedValue({ _sum: { points: 0 } }),
        create: createScore
      },
      engagementEvent: { create: createEngagement }
    } as never);

    const res = await request(app).get("/r/raidcta1").set("User-Agent", "vitest");
    expect(res.status).toBe(302);
    expect(createScore).toHaveBeenCalledTimes(1);
    expect(createScore.mock.calls[0][0].data.points).toBe(2);
    expect(createScore.mock.calls[0][0].data.userId).toBe("user-1");
    expect(createEngagement).toHaveBeenCalledTimes(1);
  });

  it("does not award points for a duplicate click fingerprint", async () => {
    const createScore = vi.fn();
    const app = createApp({
      shortLink: {
        findUnique: vi.fn().mockResolvedValue({
          id: "link-1",
          code: "raidcta1",
          targetUrl: "https://example.com/mission",
          userId: "user-1",
          communityId: "demo-community",
          mission: { status: "ACTIVE", priority: Priority.HIGH }
        })
      },
      shortLinkClick: {
        create: vi.fn().mockResolvedValue({}),
        findFirst: vi.fn().mockResolvedValue({ id: "click-1" })
      },
      score: { create: createScore }
    } as never);

    const res = await request(app).get("/r/raidcta1");
    expect(res.status).toBe(302);
    expect(createScore).not.toHaveBeenCalled();
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
    expect(res.body[0]).toEqual({
      code: "abc12345",
      targetUrl: "https://example.com",
      clicks: 3,
      missionId: undefined,
      wallet: null,
      displayName: null
    });
  });
});

describe("submissions", () => {
  it("awards points and writes a score row", async () => {
    const findUser = vi.fn().mockResolvedValue(null);
    const createUser = vi.fn().mockResolvedValue({ id: "user-1", wallet: "0xdemo" });
    const findTask = vi.fn().mockResolvedValue({
      id: "task-1",
      missionId: "mission-1",
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
    const findClaim = vi.fn().mockResolvedValue({ id: "claim-1", missionId: "mission-1", userId: "user-1" });

    const app = createApp({
      user: { findUnique: findUser, create: createUser },
      missionTask: { findUnique: findTask },
      missionClaim: { findUnique: findClaim },
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

  it("rejects proof until the mission is claimed", async () => {
    const app = createApp({
      user: { findUnique: vi.fn().mockResolvedValue({ id: "user-1", wallet: "0xdemo" }) },
      missionTask: {
        findUnique: vi.fn().mockResolvedValue({
          id: "task-1",
          missionId: "mission-1",
          title: "Reply with narrative",
          actionType: ActionType.REPLY,
          createdAt: new Date(),
          mission: { communityId: "demo-community", priority: Priority.HIGH }
        })
      },
      missionClaim: { findUnique: vi.fn().mockResolvedValue(null) },
      submission: { create: vi.fn() }
    } as never);

    const res = await request(app).post("/tasks/task-1/submissions").send({
      wallet: "0xdemo",
      proofUrl: "https://x.com/example/status/1"
    });
    expect(res.status).toBe(403);
  });
});

describe("mission claims", () => {
  it("persists a claim and issues a personal tracked CTA", async () => {
    const findUser = vi.fn().mockResolvedValue({ id: "user-1", wallet: "0xdemo" });
    const findMission = vi.fn().mockResolvedValue({ id: "mission-1", communityId: "demo-community" });
    const upsertClaim = vi.fn().mockResolvedValue({ id: "claim-1", missionId: "mission-1", userId: "user-1" });
    const findLink = vi.fn().mockResolvedValue(null);
    const createLink = vi.fn().mockResolvedValue({
      id: "link-1",
      code: "raidcta1",
      targetUrl: "http://localhost:3000/app/missions/mission-1",
      missionId: "mission-1"
    });
    const app = createApp({
      user: { findUnique: findUser },
      mission: { findUnique: findMission },
      missionClaim: { upsert: upsertClaim },
      shortLink: { findFirst: findLink, create: createLink }
    } as never);

    const res = await request(app).post("/missions/mission-1/claim").send({ wallet: "0xdemo" });
    expect(res.status).toBe(200);
    expect(res.body.claimed).toBe(true);
    expect(res.body.shortLink.code).toBe("raidcta1");
    expect(upsertClaim).toHaveBeenCalledTimes(1);
    expect(createLink).toHaveBeenCalledTimes(1);
  });

  it("rejects claim without wallet or session", async () => {
    const res = await request(createApp({} as never)).post("/missions/mission-1/claim").send({});
    expect(res.status).toBe(401);
  });

  it("uses SIWE session wallet instead of a spoofed body wallet", async () => {
    const { generatePrivateKey, privateKeyToAccount } = await import("viem/accounts");
    const account = privateKeyToAccount(generatePrivateKey());
    const findUser = vi.fn()
      .mockResolvedValueOnce(null)
      .mockResolvedValue({ id: "u1", wallet: account.address });
    const createUser = vi.fn().mockResolvedValue({ id: "u1", wallet: account.address });
    const findMission = vi.fn().mockResolvedValue({ id: "mission-1", communityId: "demo-community" });
    const upsertClaim = vi.fn().mockResolvedValue({ id: "claim-1", missionId: "mission-1", userId: "u1" });
    const app = createApp({
      user: { findUnique: findUser, create: createUser },
      mission: { findUnique: findMission },
      missionClaim: { upsert: upsertClaim },
      shortLink: {
        findFirst: vi.fn().mockResolvedValue({
          id: "link-1",
          code: "raidcta1",
          targetUrl: "http://localhost:3000/app/missions/mission-1",
          missionId: "mission-1",
          _count: { clicks: 0 }
        })
      }
    } as never);

    const start = await request(app).post("/auth/siwe/start").send({ wallet: account.address });
    const signature = await account.signMessage({ message: start.body.message });
    const verify = await request(app).post("/auth/siwe/verify").send({
      message: start.body.message,
      signature
    });
    expect(verify.status).toBe(200);

    const res = await request(app)
      .post("/missions/mission-1/claim")
      .set("Authorization", `Bearer ${verify.body.token}`)
      .send({ wallet: "0xattacker" });
    expect(res.status).toBe(200);
    expect(findUser).toHaveBeenLastCalledWith({ where: { wallet: account.address } });
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

describe("SIWE wallet connect", () => {
  it("rejects an invalid wallet on start", async () => {
    const res = await request(createApp({} as never)).post("/auth/siwe/start").send({ wallet: "0xdemo" });
    expect(res.status).toBe(400);
  });

  it("verifies a signed SIWE message", async () => {
    const { generatePrivateKey, privateKeyToAccount } = await import("viem/accounts");
    const account = privateKeyToAccount(generatePrivateKey());
    const findUser = vi.fn().mockResolvedValue(null);
    const createUser = vi.fn().mockResolvedValue({ id: "u1", wallet: account.address });
    const app = createApp({ user: { findUnique: findUser, create: createUser } } as never);

    const start = await request(app).post("/auth/siwe/start").send({ wallet: account.address });
    expect(start.status).toBe(200);
    const signature = await account.signMessage({ message: start.body.message });
    const verify = await request(app).post("/auth/siwe/verify").send({
      message: start.body.message,
      signature
    });
    expect(verify.status).toBe(200);
    expect(verify.body.user.wallet).toBe(account.address);
    expect(verify.body.token).toBeTruthy();
  });
});

describe("contributor profile", () => {
  it("returns points, rank, claims, and submissions", async () => {
    const app = createApp({
      user: { findUnique: vi.fn().mockResolvedValue({ id: "u1", wallet: "0xabc", displayName: "Raider" }) },
      missionClaim: {
        findMany: vi.fn().mockResolvedValue([
          {
            missionId: "m1",
            claimedAt: "2026-08-18T00:00:00.000Z",
            mission: {
              id: "m1",
              title: "Spike",
              status: "ACTIVE",
              priority: "HIGH",
              urgency: 80,
              tasks: [
                { id: "t1", title: "Reply", details: "play:reply-narrative", actionType: "REPLY", platform: "X" },
                { id: "t2", title: "Share in Telegram", details: "play:share-telegram", actionType: "SHARE", platform: "TELEGRAM" }
              ]
            }
          }
        ])
      },
      submission: {
        findMany: vi.fn().mockResolvedValue([
          {
            id: "s1",
            taskId: "t1",
            proofUrl: "https://x.com/p",
            pointsAwarded: 18,
            isVerified: true,
            submittedAt: "2026-08-18T00:00:00.000Z",
            task: { id: "t1", title: "Reply", missionId: "m1", mission: { title: "Spike" } }
          }
        ])
      },
      score: {
        aggregate: vi.fn().mockResolvedValue({ _sum: { points: 18 } }),
        groupBy: vi.fn().mockResolvedValue([
          { userId: "u0", _sum: { points: 50 } },
          { userId: "u1", _sum: { points: 18 } }
        ])
      },
      shortLink: {
        findMany: vi.fn().mockResolvedValue([
          {
            code: "raidcta1",
            targetUrl: "http://localhost:3000/app/missions/m1",
            missionId: "m1",
            mission: { title: "Spike" },
            _count: { clicks: 7 }
          }
        ])
      }
    } as never);

    const res = await request(app).get("/me?wallet=0xabc&communityId=demo-community");
    expect(res.status).toBe(200);
    expect(res.body.points).toBe(18);
    expect(res.body.rank).toBe(2);
    expect(res.body.claimedMissionIds).toEqual(["m1"]);
    expect(res.body.submissions[0].pointsAwarded).toBe(18);
    expect(res.body.clicks).toBe(7);
    expect(res.body.links[0].code).toBe("raidcta1");
    expect(res.body.nextPlay).toMatchObject({
      missionId: "m1",
      taskId: "t2",
      playId: "share-telegram"
    });
  });

  it("includes click counts on mission details", async () => {
    const app = createApp({
      mission: {
        findUnique: vi.fn().mockResolvedValue({
          id: "m1",
          title: "Spike",
          description: "Boost it",
          tasks: [],
          signal: null,
          shortLinks: [{ code: "abc12345", targetUrl: "https://x.com", missionId: "m1", _count: { clicks: 4 } }],
          claims: [{ id: "c1", user: { wallet: "0xabc", displayName: "Raider" } }]
        })
      }
    } as never);

    const res = await request(app).get("/missions/m1");
    expect(res.status).toBe(200);
    expect(res.body.claimsCount).toBe(1);
    expect(res.body.shortLinks[0].clicks).toBe(4);
    expect(res.body.warRoom.clickCount).toBe(4);
    expect(res.body.warRoom.checkInCount).toBe(0);
    expect(res.body.nextPlay).toBeNull();
    expect(res.body.raidTarget).toBeNull();
  });

  it("returns a personal next play on mission details when a wallet is present", async () => {
    const app = createApp({
      mission: {
        findUnique: vi.fn().mockResolvedValue({
          id: "m1",
          title: "Spike",
          description: "Boost it",
          status: "ACTIVE",
          createdAt: new Date(),
          priority: Priority.HIGH,
          tasks: [
            {
              id: "t1",
              title: "Reply the narrative",
              details: "play:reply-narrative",
              actionType: "REPLY",
              platform: "X",
              submissions: [{ user: { wallet: "0xabc", displayName: "Raider" } }]
            },
            {
              id: "t2",
              title: "Quote the mention wave",
              details: "play:quote-signal",
              actionType: "SHARE",
              platform: "X",
              submissions: []
            }
          ],
          signal: { type: "MENTION_SPIKE" },
          shortLinks: [],
          claims: [],
          checkIns: []
        })
      }
    } as never);

    const res = await request(app).get("/missions/m1?wallet=0xabc");
    expect(res.status).toBe(200);
    expect(res.body.nextPlay).toMatchObject({
      missionId: "m1",
      taskId: "t2",
      playId: "quote-signal"
    });
  });
});

describe("mission expiry and activity", () => {
  it("uses a 2 hour TTL for high-priority missions", () => {
    expect(missionTtlMs(Priority.HIGH)).toBe(2 * 60 * 60 * 1000);
    expect(missionTtlMs(Priority.LOW)).toBe(24 * 60 * 60 * 1000);
  });

  it("expires stale active missions when listing the board", async () => {
    const old = new Date(Date.now() - 3 * 60 * 60 * 1000);
    const findMany = vi.fn()
      .mockResolvedValueOnce([{ id: "m-old", createdAt: old, priority: Priority.HIGH, status: "ACTIVE" }])
      .mockResolvedValueOnce([]);
    const updateMany = vi.fn().mockResolvedValue({ count: 1 });
    const app = createApp({
      mission: { findMany, updateMany }
    } as never);

    const res = await request(app).get("/communities/demo-community/missions?status=active");
    expect(res.status).toBe(200);
    expect(updateMany).toHaveBeenCalledTimes(1);
    expect(findMany).toHaveBeenCalledTimes(2);
  });

  it("auto-creates a daily pulse when the active board is empty", async () => {
    const findMany = vi.fn().mockResolvedValue([]);
    const createMission = vi.fn().mockResolvedValue({
      id: "pulse-1",
      title: "PEPE · Daily pulse",
      description: "Daily standing ops (pulse:demo-community:2026-08-18). Reply, share, invite — no live signal required.",
      status: "ACTIVE",
      priority: Priority.LOW,
      urgency: 25,
      createdAt: new Date(),
      tasks: [{ title: "Post the daily pulse", details: "play:daily-pulse" }],
      shortLinks: [],
      _count: { claims: 0, checkIns: 0 }
    });
    const createLink = vi.fn().mockResolvedValue({ id: "link-pulse", code: "pulse001", targetUrl: "http://localhost:3000/app/missions/pulse-1" });
    const app = createApp({
      community: {
        findUnique: vi.fn().mockResolvedValue({
          id: "demo-community",
          ticker: "PEPE",
          chainId: "ethereum",
          contractAddress: "0xpepe",
          xCommunityId: null,
          dexUrl: null
        })
      },
      mission: {
        findMany,
        findFirst: vi.fn().mockResolvedValue(null),
        create: createMission
      },
      shortLink: { create: createLink }
    } as never);

    const res = await request(app).get("/communities/demo-community/missions?status=active");
    expect(res.status).toBe(200);
    expect(createMission).toHaveBeenCalledTimes(1);
    expect(createLink).toHaveBeenCalledTimes(1);
    expect(res.body[0].title).toBe("PEPE · Daily pulse");
    const dealt = createMission.mock.calls[0][0].data.tasks.create as { details: string }[];
    expect(dealt.map((task) => task.details)).toEqual([
      "play:daily-pulse",
      "play:reply-narrative",
      "play:share-telegram",
      "play:invite-raider"
    ]);
  });

  it("rejects claims on expired missions", async () => {
    const res = await request(createApp({
      user: { findUnique: vi.fn().mockResolvedValue({ id: "user-1", wallet: "0xdemo" }) },
      mission: { findUnique: vi.fn().mockResolvedValue({ id: "mission-1", status: "EXPIRED", communityId: "demo-community" }) }
    } as never)).post("/missions/mission-1/claim").send({ wallet: "0xdemo" });
    expect(res.status).toBe(409);
  });

  it("returns a mixed community activity feed", async () => {
    const app = createApp({
      missionClaim: {
        findMany: vi.fn().mockResolvedValue([
          {
            claimedAt: "2026-08-18T12:00:00.000Z",
            user: { wallet: "0xabc", displayName: "Raider" },
            mission: { title: "Spike" }
          }
        ])
      },
      submission: { findMany: vi.fn().mockResolvedValue([]) },
      score: { findMany: vi.fn().mockResolvedValue([]) }
    } as never);
    const res = await request(app).get("/communities/demo-community/activity");
    expect(res.status).toBe(200);
    expect(res.body[0]).toMatchObject({ type: "CLAIM", title: "Spike", wallet: "0xabc" });
  });
});

describe("DexScreener contract lookup", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns the DexScreener token and the community bound to that contract", async () => {
    vi.stubGlobal("fetch", vi.fn().mockImplementation(async (url: string) => {
      if (String(url).includes("/orders/")) {
        return {
          ok: true,
          json: async () => [{ type: "communityTakeover", status: "approved" }]
        };
      }
      return {
        ok: true,
        json: async () => ({
          pairs: [{
            chainId: "ethereum",
            url: "https://dexscreener.com/ethereum/0xpair",
            pairAddress: "0xpair",
            baseToken: {
              address: "0x6982508145454ce325ddbe47a25d4ec3d2311933",
              name: "Pepe",
              symbol: "PEPE"
            },
            liquidity: { usd: 1_000_000 }
          }]
        })
      };
    }));
    const app = createApp({
      community: {
        findFirst: vi.fn().mockResolvedValue({
          id: "demo-community",
          name: "Pepe Raiders",
          ticker: "PEPE",
          chainId: "ethereum",
          contractAddress: "0x6982508145454ce325ddbe47a25d4ec3d2311933"
        })
      },
      communityMember: {
        findFirst: vi.fn().mockResolvedValue({
          role: "lead",
          lastActiveAt: new Date(),
          user: { wallet: "0xlead", displayName: "First CTO" }
        })
      }
    } as never);

    const res = await request(app).get("/tokens/lookup").query({
      q: "0x6982508145454ce325ddbe47a25d4ec3d2311933"
    });
    expect(res.status).toBe(200);
    expect(res.body.token.symbol).toBe("PEPE");
    expect(res.body.community.id).toBe("demo-community");
    expect(res.body.ambiguous).toBe(false);
    expect(res.body.trust.level).toBe("caution");
    expect(res.body.listings[0].chainId).toBe("ethereum");
    expect(res.body.proof.communityTakeover).toBe(true);
    expect(res.body.trust.reasons.some((reason: string) => reason.includes("community takeover"))).toBe(true);
    expect(res.body.lead.wallet).toBe("0xlead");
    expect(res.body.lead.vacant).toBe(false);
  });

  it("requires a wallet to bind a new contract community", async () => {
    const res = await request(createApp({} as never)).post("/communities/from-token").send({
      chainId: "ethereum",
      contractAddress: "0x6982508145454ce325ddbe47a25d4ec3d2311933"
    });
    expect(res.status).toBe(401);
  });
});

describe("CTO lead succession", () => {
  it("rejects claiming an occupied lead seat", async () => {
    const app = createApp({
      community: { findUnique: vi.fn().mockResolvedValue({ id: "demo-community" }) },
      user: { findUnique: vi.fn().mockResolvedValue({ id: "user-2", wallet: "0xchallenger" }) },
      communityMember: {
        findFirst: vi.fn().mockResolvedValue({
          role: "lead",
          lastActiveAt: new Date(),
          user: { wallet: "0xlead", displayName: "First" }
        }),
        updateMany: vi.fn(),
        upsert: vi.fn()
      }
    } as never);

    const res = await request(app).post("/communities/demo-community/lead/claim").send({ wallet: "0xchallenger" });
    expect(res.status).toBe(409);
    expect(res.body.lead.vacant).toBe(false);
  });

  it("lets a joined wallet claim lead after the previous CTO resigns", async () => {
    const updateMany = vi.fn().mockResolvedValue({ count: 0 });
    const upsert = vi.fn().mockResolvedValue({ role: "lead" });
    const findFirst = vi.fn()
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        role: "lead",
        lastActiveAt: new Date(),
        user: { wallet: "0xchallenger", displayName: "New CTO" }
      });
    const app = createApp({
      community: { findUnique: vi.fn().mockResolvedValue({ id: "demo-community" }) },
      user: { findUnique: vi.fn().mockResolvedValue({ id: "user-2", wallet: "0xchallenger" }) },
      communityMember: { findFirst, updateMany, upsert }
    } as never);

    const res = await request(app).post("/communities/demo-community/lead/claim").send({ wallet: "0xchallenger" });
    expect(res.status).toBe(200);
    expect(res.body.claimed).toBe(true);
    expect(res.body.you.isLead).toBe(true);
    expect(updateMany).toHaveBeenCalledTimes(1);
    expect(upsert).toHaveBeenCalledTimes(1);
  });

  it("opens the seat after 48h of inactivity so a new wallet can CTO", async () => {
    const stale = new Date(Date.now() - 49 * 60 * 60 * 1000);
    const findFirst = vi.fn()
      .mockResolvedValueOnce({
        role: "lead",
        lastActiveAt: stale,
        user: { wallet: "0xold", displayName: "Gone" }
      })
      .mockResolvedValueOnce({
        role: "lead",
        lastActiveAt: new Date(),
        user: { wallet: "0xnew", displayName: "New" }
      });
    const app = createApp({
      community: { findUnique: vi.fn().mockResolvedValue({ id: "demo-community" }) },
      user: { findUnique: vi.fn().mockResolvedValue({ id: "user-3", wallet: "0xnew" }) },
      communityMember: {
        findFirst,
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        upsert: vi.fn().mockResolvedValue({ role: "lead" })
      }
    } as never);

    const res = await request(app).post("/communities/demo-community/lead/claim").send({ wallet: "0xnew" });
    expect(res.status).toBe(200);
    expect(res.body.lead.wallet).toBe("0xnew");
  });

  it("only the current lead can resign", async () => {
    const app = createApp({
      user: { findUnique: vi.fn().mockResolvedValue({ id: "user-2", wallet: "0xmember" }) },
      communityMember: {
        findUnique: vi.fn().mockResolvedValue({ id: "mem-2", role: "member" })
      }
    } as never);
    const res = await request(app).post("/communities/demo-community/lead/resign").send({ wallet: "0xmember" });
    expect(res.status).toBe(403);
  });

  it("clears the seat when the lead resigns", async () => {
    const update = vi.fn().mockResolvedValue({ role: "member" });
    const app = createApp({
      user: { findUnique: vi.fn().mockResolvedValue({ id: "user-1", wallet: "0xlead" }) },
      communityMember: {
        findUnique: vi.fn().mockResolvedValue({ id: "mem-1", role: "lead" }),
        update,
        findFirst: vi.fn().mockResolvedValue(null)
      }
    } as never);
    const res = await request(app).post("/communities/demo-community/lead/resign").send({ wallet: "0xlead" });
    expect(res.status).toBe(200);
    expect(res.body.resigned).toBe(true);
    expect(res.body.lead.vacant).toBe(true);
    expect(res.body.lead.reason).toBe("resigned");
    expect(update).toHaveBeenCalledTimes(1);
  });
});

describe("mission war room", () => {
  it("lets only the active CTO lead pin a narrative", async () => {
    const update = vi.fn().mockResolvedValue({
      pinText: "Push the whale buy on X",
      pinnedAt: new Date(),
      pinnedBy: { wallet: "0xlead", displayName: "Lead" }
    });
    const app = createApp({
      mission: {
        findUnique: vi.fn().mockResolvedValue({
          id: "mission-1",
          communityId: "demo-community",
          status: "ACTIVE",
          createdAt: new Date(),
          priority: "HIGH"
        }),
        update
      },
      user: { findUnique: vi.fn().mockResolvedValue({ id: "user-1", wallet: "0xlead" }) },
      communityMember: {
        findFirst: vi.fn().mockResolvedValue({
          role: "lead",
          lastActiveAt: new Date(),
          user: { wallet: "0xlead", displayName: "Lead" }
        }),
        updateMany: vi.fn()
      }
    } as never);

    const denied = await request(app).post("/missions/mission-1/pin").send({
      wallet: "0xmember",
      body: "fake pin"
    });
    expect(denied.status).toBe(403);

    const ok = await request(app).post("/missions/mission-1/pin").send({
      wallet: "0xlead",
      body: "Push the whale buy on X"
    });
    expect(ok.status).toBe(200);
    expect(ok.body.pin.body).toBe("Push the whale buy on X");
    expect(update).toHaveBeenCalledTimes(1);
  });

  it("lets a joined wallet check in while the raid is live", async () => {
    const upsert = vi.fn().mockResolvedValue({ id: "in-1" });
    const app = createApp({
      mission: {
        findUnique: vi.fn().mockResolvedValue({
          id: "mission-1",
          communityId: "demo-community",
          status: "ACTIVE",
          createdAt: new Date(),
          priority: "HIGH"
        })
      },
      user: { findUnique: vi.fn().mockResolvedValue({ id: "user-2", wallet: "0xraid" }) },
      communityMember: {
        findUnique: vi.fn().mockResolvedValue({ role: "member" }),
        updateMany: vi.fn()
      },
      missionCheckIn: {
        upsert,
        count: vi.fn().mockResolvedValue(3)
      }
    } as never);

    const res = await request(app).post("/missions/mission-1/check-in").send({ wallet: "0xraid" });
    expect(res.status).toBe(200);
    expect(res.body.checkedIn).toBe(true);
    expect(res.body.checkInCount).toBe(3);
    expect(upsert).toHaveBeenCalledTimes(1);
  });

  it("locks check-ins when the mission has expired", async () => {
    const res = await request(createApp({
      mission: {
        findUnique: vi.fn().mockResolvedValue({
          id: "mission-1",
          communityId: "demo-community",
          status: "EXPIRED"
        })
      },
      user: { findUnique: vi.fn().mockResolvedValue({ id: "user-2", wallet: "0xraid" }) }
    } as never)).post("/missions/mission-1/check-in").send({ wallet: "0xraid" });
    expect(res.status).toBe(409);
  });

  it("rejects check-in from a wallet that has not joined the mint", async () => {
    const res = await request(createApp({
      mission: {
        findUnique: vi.fn().mockResolvedValue({
          id: "mission-1",
          communityId: "demo-community",
          status: "ACTIVE",
          createdAt: new Date(),
          priority: "HIGH"
        })
      },
      user: { findUnique: vi.fn().mockResolvedValue({ id: "user-9", wallet: "0xout" }) },
      communityMember: { findUnique: vi.fn().mockResolvedValue(null) }
    } as never)).post("/missions/mission-1/check-in").send({ wallet: "0xout" });
    expect(res.status).toBe(403);
  });
});

describe("X Community bind and bonus proof", () => {
  it("lets the active lead bind an X Community URL to the mint", async () => {
    const update = vi.fn().mockResolvedValue({
      id: "demo-community",
      xCommunityId: "123456789",
      xCommunityUrl: "https://x.com/i/communities/123456789"
    });
    const app = createApp({
      community: {
        findUnique: vi.fn().mockResolvedValue({ id: "demo-community" }),
        findFirst: vi.fn().mockResolvedValue(null),
        update
      },
      communityMember: {
        findFirst: vi.fn().mockResolvedValue({
          role: "lead",
          lastActiveAt: new Date(),
          user: { wallet: "0xlead", displayName: "Lead" }
        }),
        updateMany: vi.fn()
      },
      user: { findUnique: vi.fn().mockResolvedValue({ id: "user-1", wallet: "0xlead" }) }
    } as never);

    const denied = await request(app).post("/communities/demo-community/x-community").send({
      wallet: "0xmember",
      url: "https://x.com/i/communities/123456789"
    });
    expect(denied.status).toBe(403);

    const bad = await request(app).post("/communities/demo-community/x-community").send({
      wallet: "0xlead",
      url: "https://x.com/pepecoin"
    });
    expect(bad.status).toBe(400);

    const ok = await request(app).post("/communities/demo-community/x-community").send({
      wallet: "0xlead",
      url: "https://x.com/i/communities/123456789"
    });
    expect(ok.status).toBe(200);
    expect(ok.body.xCommunity.id).toBe("123456789");
    expect(update).toHaveBeenCalledTimes(1);
  });

  it("rejects a normal tweet as proof for the X Community bonus task", async () => {
    const createSubmission = vi.fn();
    const app = createApp({
      user: { findUnique: vi.fn().mockResolvedValue({ id: "user-1", wallet: "0xdemo" }) },
      missionTask: {
        findUnique: vi.fn().mockResolvedValue({
          id: "task-xc",
          missionId: "mission-1",
          title: "Post in the linked X Community",
          details: "x-community:123456789",
          actionType: ActionType.SHARE,
          createdAt: new Date(),
          mission: { communityId: "demo-community", priority: Priority.HIGH, status: "ACTIVE" }
        })
      },
      missionClaim: { findUnique: vi.fn().mockResolvedValue({ id: "claim-1" }) },
      submission: { create: createSubmission }
    } as never);

    const res = await request(app).post("/tasks/task-xc/submissions").send({
      wallet: "0xdemo",
      proofUrl: "https://x.com/user/status/1"
    });
    expect(res.status).toBe(400);
    expect(createSubmission).not.toHaveBeenCalled();
  });

  it("accepts an X Community post URL for the bonus task only", async () => {
    const createSubmission = vi.fn().mockResolvedValue({ id: "sub-xc", pointsAwarded: 12 });
    const app = createApp({
      user: { findUnique: vi.fn().mockResolvedValue({ id: "user-1", wallet: "0xdemo" }) },
      missionTask: {
        findUnique: vi.fn().mockResolvedValue({
          id: "task-xc",
          missionId: "mission-1",
          title: "Post in the linked X Community",
          details: "x-community:123456789",
          actionType: ActionType.SHARE,
          createdAt: new Date(),
          mission: { communityId: "demo-community", priority: Priority.HIGH, status: "ACTIVE" }
        })
      },
      missionClaim: { findUnique: vi.fn().mockResolvedValue({ id: "claim-1" }) },
      submission: { create: createSubmission },
      score: { create: vi.fn(), groupBy: vi.fn().mockResolvedValue([]) },
      engagementEvent: { create: vi.fn() },
      leaderboardSnapshot: { create: vi.fn() },
      communityMember: { updateMany: vi.fn() }
    } as never);

    const res = await request(app).post("/tasks/task-xc/submissions").send({
      wallet: "0xdemo",
      proofUrl: "https://x.com/i/communities/123456789/posts/55"
    });
    expect(res.status).toBe(200);
    expect(createSubmission).toHaveBeenCalledTimes(1);
  });

  it("rejects using the KOL post URL as reply proof", async () => {
    const createSubmission = vi.fn();
    const app = createApp({
      user: { findUnique: vi.fn().mockResolvedValue({ id: "user-1", wallet: "0xdemo" }) },
      missionTask: {
        findUnique: vi.fn().mockResolvedValue({
          id: "task-reply",
          missionId: "mission-1",
          title: "Reply the narrative",
          details: "play:reply-narrative\ntarget:https://x.com/whale/status/99",
          actionType: ActionType.REPLY,
          createdAt: new Date(),
          mission: { communityId: "demo-community", priority: Priority.HIGH, status: "ACTIVE" }
        })
      },
      missionClaim: { findUnique: vi.fn().mockResolvedValue({ id: "claim-1" }) },
      submission: { create: createSubmission }
    } as never);
    const same = await request(app).post("/tasks/task-reply/submissions").send({
      wallet: "0xdemo",
      proofUrl: "https://x.com/whale/status/99"
    });
    expect(same.status).toBe(400);
    expect(createSubmission).not.toHaveBeenCalled();
  });

  it("accepts a different status URL as the reply proof", async () => {
    const createSubmission = vi.fn().mockResolvedValue({ id: "sub-r", pointsAwarded: 10 });
    const app = createApp({
      user: { findUnique: vi.fn().mockResolvedValue({ id: "user-1", wallet: "0xdemo" }) },
      missionTask: {
        findUnique: vi.fn().mockResolvedValue({
          id: "task-reply",
          missionId: "mission-1",
          title: "Reply the narrative",
          details: "play:reply-narrative\ntarget:https://x.com/whale/status/99",
          actionType: ActionType.REPLY,
          createdAt: new Date(),
          mission: { communityId: "demo-community", priority: Priority.HIGH, status: "ACTIVE" }
        })
      },
      missionClaim: { findUnique: vi.fn().mockResolvedValue({ id: "claim-1" }) },
      submission: { create: createSubmission },
      score: { create: vi.fn(), groupBy: vi.fn().mockResolvedValue([]) },
      engagementEvent: { create: vi.fn() },
      leaderboardSnapshot: { create: vi.fn() },
      communityMember: { updateMany: vi.fn() }
    } as never);
    const res = await request(app).post("/tasks/task-reply/submissions").send({
      wallet: "0xdemo",
      proofUrl: "https://x.com/raider/status/100"
    });
    expect(res.status).toBe(200);
    expect(createSubmission).toHaveBeenCalledTimes(1);
  });
});

describe("raid feed", () => {
  it("lists watched KOLs and clickable posts", async () => {
    const app = createApp({
      community: { findUnique: vi.fn().mockResolvedValue({ id: "demo-community", ticker: "PEPE", contractAddress: "0xpepe" }) },
      feedPost: {
        findMany: vi.fn().mockResolvedValue([
          {
            id: "p1",
            kind: "MENTION",
            url: "https://x.com/random/status/2",
            authorHandle: "random",
            text: "$PEPE CA dropped",
            postedAt: new Date().toISOString()
          }
        ])
      },
      kolWatch: { findMany: vi.fn().mockResolvedValue([{ id: "k1", handle: "examplekol" }]) }
    } as never);

    const res = await request(app).get("/communities/demo-community/feed");
    expect(res.status).toBe(200);
    expect(res.body.posts[0].url).toBe("https://x.com/random/status/2");
    expect(res.body.shillCopy).toContain("$PEPE");
    expect(res.body.kols[0].handle).toBe("examplekol");
  });

  it("filters the feed by KOL handle and min followers", async () => {
    const app = createApp({
      community: { findUnique: vi.fn().mockResolvedValue({ id: "demo-community", ticker: "PEPE" }) },
      feedPost: {
        findMany: vi.fn().mockResolvedValue([
          { authorHandle: "whale", kind: "KOL_POST", authorFollowers: 200000, likeCount: 10, replyCount: 0, retweetCount: 0, quoteCount: 0, postedAt: new Date(), url: "https://x.com/whale/status/1" },
          { authorHandle: "micro", kind: "KOL_POST", authorFollowers: 12, likeCount: 1, replyCount: 0, retweetCount: 0, quoteCount: 0, postedAt: new Date(), url: "https://x.com/micro/status/2" }
        ])
      },
      kolWatch: { findMany: vi.fn().mockResolvedValue([]) }
    } as never);
    const res = await request(app).get("/communities/demo-community/feed?handle=whale&minFollowers=10000");
    expect(res.status).toBe(200);
    expect(res.body.posts).toHaveLength(1);
    expect(res.body.posts[0].authorHandle).toBe("whale");
  });

  it("filters watched KOLs by followers and search", async () => {
    const app = createApp({
      community: { findUnique: vi.fn().mockResolvedValue({ id: "demo-community", ticker: "PEPE" }) },
      feedPost: {
        findMany: vi.fn().mockResolvedValue([
          { authorHandle: "whale", kolWatchId: "k1", kind: "KOL_POST", authorFollowers: 200000, likeCount: 40, replyCount: 5, retweetCount: 2, quoteCount: 1, postedAt: new Date() }
        ])
      },
      kolWatch: {
        findMany: vi.fn().mockResolvedValue([
          { id: "k1", handle: "whale", displayName: "Whale", followers: 200000 },
          { id: "k2", handle: "micro", displayName: "Micro", followers: 800 }
        ])
      }
    } as never);
    const res = await request(app).get("/communities/demo-community/feed?minFollowers=10000");
    expect(res.status).toBe(200);
    expect(res.body.kols.map((kol: { handle: string }) => kol.handle)).toEqual(["whale"]);
    expect(res.body.kols[0].stats.heat).toBe(48);
  });

  it("lets the lead watch a KOL handle", async () => {
    const upsert = vi.fn().mockResolvedValue({ id: "k1", handle: "kol" });
    const app = createApp({
      community: { findUnique: vi.fn().mockResolvedValue({ id: "demo-community" }) },
      communityMember: {
        findFirst: vi.fn().mockResolvedValue({
          role: "lead",
          lastActiveAt: new Date(),
          user: { wallet: "0xlead", displayName: "Lead" }
        }),
        updateMany: vi.fn()
      },
      user: { findUnique: vi.fn().mockResolvedValue({ id: "user-1", wallet: "0xlead" }) },
      kolWatch: { upsert }
    } as never);

    const denied = await request(app).post("/communities/demo-community/kols").send({
      wallet: "0xmember",
      handle: "@kol"
    });
    expect(denied.status).toBe(403);

    const ok = await request(app).post("/communities/demo-community/kols").send({
      wallet: "0xlead",
      handle: "@KOL"
    });
    expect(ok.status).toBe(200);
    expect(upsert.mock.calls[0][0].create.handle).toBe("kol");
  });

  it("refuses live refresh when no X provider key is configured", async () => {
    const app = createApp({
      community: { findUnique: vi.fn().mockResolvedValue({ id: "demo-community", ticker: "PEPE", kolWatches: [] }) },
      user: { findUnique: vi.fn().mockResolvedValue({ id: "user-1", wallet: "0xraid" }) },
      communityMember: {
        findUnique: vi.fn().mockResolvedValue({ id: "m1", userId: "user-1", communityId: "demo-community" }),
        updateMany: vi.fn()
      }
    } as never);
    const res = await request(app).post("/communities/demo-community/feed/refresh").send({ wallet: "0xraid" });
    expect(res.status).toBe(200);
    expect(res.body.provider).toBe("none");
  });

  it("returns only posts ingested after since so clients can poll without reload", async () => {
    const app = createApp({
      community: { findUnique: vi.fn().mockResolvedValue({ id: "demo-community", ticker: "PEPE" }) },
      feedPost: {
        findMany: vi.fn().mockResolvedValue([
          { id: "old", authorHandle: "whale", kind: "KOL_POST", createdAt: new Date("2026-08-19T00:00:00.000Z"), postedAt: new Date("2026-08-19T00:00:00.000Z"), likeCount: 0, replyCount: 0, retweetCount: 0, quoteCount: 0, url: "https://x.com/whale/status/1" },
          { id: "fresh", authorHandle: "whale", kind: "KOL_POST", createdAt: new Date("2026-08-19T00:10:00.000Z"), postedAt: new Date("2026-08-19T00:10:00.000Z"), likeCount: 0, replyCount: 0, retweetCount: 0, quoteCount: 0, url: "https://x.com/whale/status/2" }
        ])
      },
      kolWatch: { findMany: vi.fn().mockResolvedValue([]) }
    } as never);
    const res = await request(app).get("/communities/demo-community/feed?since=2026-08-19T00:05:00.000Z");
    expect(res.status).toBe(200);
    expect(res.body.live).toBe(true);
    expect(res.body.posts.map((post: { id: string }) => post.id)).toEqual(["fresh"]);
  });

  it("publishes a newly ingested KOL post to live subscribers", async () => {
    const created = {
      id: "p-live",
      kind: "KOL_POST",
      url: "https://x.com/whale/status/99",
      authorHandle: "whale",
      text: "gm raiders",
      postedAt: new Date(),
      createdAt: new Date(),
      likeCount: 0,
      replyCount: 0,
      retweetCount: 0,
      quoteCount: 0,
      viewCount: 0,
      authorFollowers: 90000
    };
    const app = createApp({
      community: { findUnique: vi.fn().mockResolvedValue({ id: "demo-community", ticker: "PEPE", contractAddress: null }) },
      feedPost: {
        findUnique: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue(created)
      },
      kolWatch: {
        findUnique: vi.fn(),
        findFirst: vi.fn().mockResolvedValue({
          handle: "whale",
          displayName: "Whale",
          followers: 90000,
          verified: true,
          profileImageUrl: "https://img/whale.jpg"
        })
      }
    } as never);
    const seen: Array<{ id: string; followers?: number | null }> = [];
    const stop = subscribeLiveFeed("demo-community", (event) => {
      seen.push({ id: event.post.id, followers: event.kol?.followers });
    });
    const res = await request(app).post("/communities/demo-community/feed/posts").send({
      url: "https://x.com/whale/status/99",
      text: "gm raiders",
      authorHandle: "whale"
    });
    stop();
    expect(res.status).toBe(200);
    expect(seen).toEqual([{ id: "p-live", followers: 90000 }]);
  });

  it("marks posts a member already shilled", async () => {
    const app = createApp({
      community: { findUnique: vi.fn().mockResolvedValue({ id: "demo-community", ticker: "PEPE" }) },
      user: { findUnique: vi.fn().mockResolvedValue({ id: "u1", wallet: "0xdemo" }) },
      feedPost: {
        findMany: vi.fn().mockResolvedValue([
          { id: "p1", authorHandle: "whale", kind: "KOL_POST", postedAt: new Date(), url: "https://x.com/whale/status/1" }
        ])
      },
      kolWatch: { findMany: vi.fn().mockResolvedValue([]) },
      feedShill: {
        findMany: vi.fn().mockResolvedValue([
          {
            feedPostId: "p1",
            userId: "u1",
            createdAt: "2026-08-19T01:00:00.000Z",
            reshill: false,
            user: { wallet: "0xdemo", displayName: "Raider" },
            feedPost: { id: "p1", url: "https://x.com/whale/status/1", authorHandle: "whale", text: "gm", kind: "KOL_POST" }
          }
        ])
      }
    } as never);
    const res = await request(app).get("/communities/demo-community/feed?wallet=0xdemo");
    expect(res.status).toBe(200);
    expect(res.body.posts[0].youShilled).toBe(true);
    expect(res.body.shillHistory[0].you).toBe(true);
    expect(typeof res.body.posts[0].liveRaiderCount).toBe("number");
  });

  it("returns the pinned talk track as shill copy", async () => {
    const app = createApp({
      community: { findUnique: vi.fn().mockResolvedValue({ id: "demo-community", ticker: "PEPE", contractAddress: "0xabc" }) },
      feedPost: { findMany: vi.fn().mockResolvedValue([]) },
      kolWatch: { findMany: vi.fn().mockResolvedValue([]) },
      mission: { findFirst: vi.fn().mockResolvedValue({ pinText: "We own the replies." }) }
    } as never);
    const res = await request(app).get("/communities/demo-community/feed");
    expect(res.status).toBe(200);
    expect(res.body.talkTrack).toBe("We own the replies.");
    expect(res.body.shillCopy).toContain("We own the replies.");
    expect(res.body.shillCopy).toContain("$PEPE");
  });

  it("marks the focused post so the room replies to one tweet", async () => {
    const app = createApp({
      community: {
        findUnique: vi.fn().mockResolvedValue({
          id: "demo-community",
          ticker: "PEPE",
          focusPostId: "p1",
          focusAt: new Date(),
          focusById: "u1"
        })
      },
      feedPost: {
        findMany: vi.fn().mockResolvedValue([
          { id: "p1", authorHandle: "whale", kind: "KOL_POST", postedAt: new Date(), url: "https://x.com/whale/status/1", text: "gm" },
          { id: "p2", authorHandle: "other", kind: "KOL_POST", postedAt: new Date(), url: "https://x.com/other/status/2", text: "later" }
        ])
      },
      kolWatch: { findMany: vi.fn().mockResolvedValue([]) },
      user: { findUnique: vi.fn().mockResolvedValue({ wallet: "0xlead", displayName: "Lead" }) }
    } as never);
    const res = await request(app).get("/communities/demo-community/feed");
    expect(res.status).toBe(200);
    expect(res.body.focus.postId).toBe("p1");
    expect(res.body.posts.find((post: { id: string }) => post.id === "p1").focused).toBe(true);
    expect(res.body.posts.find((post: { id: string }) => post.id === "p2").focused).toBe(false);
  });

  it("records a first shill and refuses a duplicate unless reshill is set", async () => {
    const createShill = vi.fn().mockResolvedValue({ id: "s1" });
    const app = createApp({
      community: { findUnique: vi.fn().mockResolvedValue({ id: "demo-community", ticker: "PEPE" }), update: vi.fn() },
      feedPost: { findUnique: vi.fn().mockResolvedValue({ id: "p1", communityId: "demo-community", url: "https://x.com/whale/status/1", kind: "KOL_POST", missionId: "m1", authorHandle: "whale", text: "gm" }) },
      user: { findUnique: vi.fn().mockResolvedValue({ id: "u1", wallet: "0xdemo" }) },
      communityMember: {
        findUnique: vi.fn().mockResolvedValue({ id: "mem1", userId: "u1", communityId: "demo-community" }),
        updateMany: vi.fn()
      },
      mission: { findUnique: vi.fn().mockResolvedValue({ id: "m1", communityId: "demo-community" }) },
      missionClaim: { upsert: vi.fn() },
      missionCheckIn: { upsert: vi.fn() },
      shortLink: { findFirst: vi.fn().mockResolvedValue({ id: "l1", code: "abc", targetUrl: "https://x.com", missionId: "m1", _count: { clicks: 0 } }) },
      feedShill: {
        count: vi.fn()
          .mockResolvedValueOnce(0)
          .mockResolvedValueOnce(1)
          .mockResolvedValueOnce(1),
        findFirst: vi.fn().mockResolvedValue({ createdAt: "2026-08-19T01:00:00.000Z" }),
        findMany: vi.fn().mockResolvedValue([{ userId: "u1", createdAt: new Date() }]),
        create: createShill
      }
    } as never);

    const first = await request(app).post("/communities/demo-community/feed/p1/shill").send({ wallet: "0xdemo" });
    expect(first.status).toBe(200);
    expect(first.body.alreadyShilled).toBe(false);
    expect(first.body.kit.copy).toContain("$PEPE");
    expect(first.body.kit.intentUrl).toContain("in_reply_to=1");
    expect(first.body.focus.postId).toBe("p1");
    expect(createShill).toHaveBeenCalledTimes(1);

    const dup = await request(app).post("/communities/demo-community/feed/p1/shill").send({ wallet: "0xdemo" });
    expect(dup.status).toBe(200);
    expect(dup.body.alreadyShilled).toBe(true);
    expect(dup.body.kit.intentUrl).toContain("in_reply_to=1");
    expect(createShill).toHaveBeenCalledTimes(1);

    const again = await request(app).post("/communities/demo-community/feed/p1/shill").send({ wallet: "0xdemo", reshill: true });
    expect(again.status).toBe(200);
    expect(again.body.reshill).toBe(true);
    expect(createShill).toHaveBeenCalledTimes(2);
  });

  it("lets a member call a focus raid so everyone replies to the same post", async () => {
    const update = vi.fn();
    const app = createApp({
      community: { findUnique: vi.fn().mockResolvedValue({ id: "demo-community", ticker: "PEPE" }), update },
      feedPost: { findUnique: vi.fn().mockResolvedValue({ id: "p2", communityId: "demo-community", url: "https://x.com/whale/status/2", authorHandle: "whale", text: "now", kind: "KOL_POST" }) },
      user: { findUnique: vi.fn().mockResolvedValue({ id: "u1", wallet: "0xdemo", displayName: "Raider" }) },
      communityMember: {
        findUnique: vi.fn().mockResolvedValue({ id: "mem1", userId: "u1", communityId: "demo-community" }),
        updateMany: vi.fn()
      }
    } as never);
    const seen: Array<string | null> = [];
    const stop = subscribeLiveFeed("demo-community", (event) => {
      if (event.type === "focus") seen.push(event.focus?.postId ?? null);
    });
    const res = await request(app).post("/communities/demo-community/feed/p2/focus").send({ wallet: "0xdemo" });
    stop();
    expect(res.status).toBe(200);
    expect(res.body.focus.postId).toBe("p2");
    expect(res.body.focus.authorHandle).toBe("whale");
    expect(update).toHaveBeenCalledTimes(1);
    expect(seen).toEqual(["p2"]);
  });

  it("keeps an existing focus when someone shills a different post", async () => {
    const update = vi.fn();
    const app = createApp({
      community: {
        findUnique: vi.fn().mockResolvedValue({
          id: "demo-community",
          ticker: "PEPE",
          focusPostId: "p1",
          focusAt: new Date(),
          focusById: "u2"
        }),
        update
      },
      feedPost: {
        findUnique: vi.fn().mockImplementation(({ where }: { where: { id: string } }) => {
          if (where.id === "p1") {
            return Promise.resolve({
              id: "p1",
              communityId: "demo-community",
              url: "https://x.com/whale/status/1",
              kind: "KOL_POST",
              authorHandle: "whale",
              text: "gm"
            });
          }
          return Promise.resolve({
            id: "p2",
            communityId: "demo-community",
            url: "https://x.com/other/status/2",
            kind: "KOL_POST",
            missionId: "m1",
            authorHandle: "other",
            text: "nope"
          });
        })
      },
      user: { findUnique: vi.fn().mockResolvedValue({ id: "u1", wallet: "0xdemo" }) },
      communityMember: {
        findUnique: vi.fn().mockResolvedValue({ id: "mem1", userId: "u1", communityId: "demo-community" }),
        updateMany: vi.fn()
      },
      mission: { findUnique: vi.fn().mockResolvedValue({ id: "m1", communityId: "demo-community" }) },
      missionClaim: { upsert: vi.fn() },
      missionCheckIn: { upsert: vi.fn() },
      shortLink: { findFirst: vi.fn().mockResolvedValue({ id: "l1", code: "abc", targetUrl: "https://x.com", missionId: "m1", _count: { clicks: 0 } }) },
      feedShill: {
        count: vi.fn().mockResolvedValue(0),
        findMany: vi.fn().mockResolvedValue([]),
        create: vi.fn().mockResolvedValue({ id: "s2" })
      }
    } as never);
    const res = await request(app).post("/communities/demo-community/feed/p2/shill").send({ wallet: "0xdemo" });
    expect(res.status).toBe(200);
    expect(update).not.toHaveBeenCalled();
    expect(res.body.focus.postId).toBe("p1");
  });
});
