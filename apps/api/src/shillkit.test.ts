import { describe, expect, it } from "vitest";
import { attachProofState, buildShillCopy, buildShillKit, liveRaiderIds, pickRaidReplyTask, proofIsReplyToRaidTarget, raidReplyAlreadyScored, xReplyIntentUrl } from "./shillkit";

describe("shill kit", () => {
  it("builds talk track copy with ticker and CA", () => {
    expect(buildShillCopy({ ticker: "PEPE", contractAddress: "0xabc", pinText: "We own the replies." })).toBe(
      "We own the replies. $PEPE 0xabc"
    );
    expect(buildShillCopy({ ticker: "PEPE", contractAddress: "0xabc" })).toContain("$PEPE");
  });

  it("opens X as a reply to the KOL status", () => {
    const kit = buildShillKit({
      ticker: "PEPE",
      pinText: "Push it",
      url: "https://x.com/whale/status/99"
    });
    expect(kit.intentUrl).toContain("in_reply_to=99");
    expect(kit.intentUrl).toContain("text=");
    expect(xReplyIntentUrl("https://x.com/whale/status/99", "hi")).toContain("in_reply_to=99");
  });

  it("counts unique raiders in the live window", () => {
    const now = Date.parse("2026-08-19T01:00:00.000Z");
    expect(liveRaiderIds([
      { userId: "a", createdAt: "2026-08-19T00:55:00.000Z" },
      { userId: "a", createdAt: "2026-08-19T00:50:00.000Z" },
      { userId: "b", createdAt: "2026-08-19T00:58:00.000Z" },
      { userId: "c", createdAt: "2026-08-18T00:00:00.000Z" }
    ], now)).toEqual(["a", "b"]);
  });

  it("rejects proof that is the KOL post instead of a reply", () => {
    const details = "play:reply-narrative\ntarget:https://x.com/whale/status/99";
    expect(proofIsReplyToRaidTarget("https://x.com/whale/status/99", details).ok).toBe(false);
    expect(proofIsReplyToRaidTarget("https://x.com/me/status/100", details)).toEqual({ ok: true });
    expect(proofIsReplyToRaidTarget("https://x.com/yourhandle/status/", details).ok).toBe(false);
    expect(proofIsReplyToRaidTarget("https://x.com/me/status/1", "play:share-telegram").ok).toBe(true);
  });

  it("picks the raid-reply task that matches the KOL tweet", () => {
    const tasks = [
      { id: "tg", details: "play:share-telegram" },
      { id: "reply", details: "play:reply-narrative\ntarget:https://x.com/whale/status/99" },
      { id: "quote", details: "play:quote-signal\ntarget:https://x.com/other/status/1" }
    ];
    expect(pickRaidReplyTask(tasks, "https://x.com/whale/status/99")?.id).toBe("reply");
    expect(pickRaidReplyTask(tasks, "https://x.com/whale/status/99", ["reply"])).toBeNull();
    expect(pickRaidReplyTask(
      [{ id: "open", details: "play:reply-narrative" }, ...tasks],
      "https://x.com/whale/status/99",
      ["reply"]
    )?.id).toBe("open");
  });

  it("treats a submitted raid-reply on the same tweet as already scored", () => {
    const tasks = [
      { id: "reply", details: "play:reply-narrative\ntarget:https://x.com/whale/status/99" },
      { id: "quote", details: "play:quote-signal\ntarget:https://x.com/whale/status/99" }
    ];
    expect(raidReplyAlreadyScored(tasks, "https://x.com/whale/status/99", ["reply"])).toBe(true);
    expect(raidReplyAlreadyScored(tasks, "https://x.com/whale/status/99", [])).toBe(false);
    expect(raidReplyAlreadyScored(tasks, "https://x.com/other/status/1", ["reply"])).toBe(false);
  });

  it("counts unique raid-reply proofs per post mission", () => {
    const posts = attachProofState(
      [{ id: "p1", missionId: "m1" }, { id: "p2", missionId: "m2" }],
      [
        { userId: "u1", submittedAt: "2026-08-19T01:00:00.000Z", task: { missionId: "m1", details: "play:reply-narrative\ntarget:https://x.com/whale/status/1" }, user: { wallet: "0x1", displayName: "A" } },
        { userId: "u2", submittedAt: "2026-08-19T01:01:00.000Z", task: { missionId: "m1", details: "play:quote-signal\ntarget:https://x.com/whale/status/1" }, user: { wallet: "0x2", displayName: "B" } },
        { userId: "u1", submittedAt: "2026-08-19T01:02:00.000Z", task: { missionId: "m2", details: "play:share-telegram" }, user: { wallet: "0x1", displayName: "A" } }
      ],
      "u1",
      Date.parse("2026-08-19T01:05:00.000Z")
    );
    expect(posts[0]).toMatchObject({ youProved: true, provedCount: 2, liveProvedCount: 2 });
    expect(posts[1]).toMatchObject({ youProved: false, provedCount: 0 });
  });
});
