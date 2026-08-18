import { ActionType, Platform, SignalType } from "@prisma/client";
import { describe, expect, it } from "vitest";
import {
  PLAY_MAX,
  dealPlays,
  extractSignalTarget,
  nextUnsubmittedTask,
  playIdFromDetails,
  targetUrlFromDetails,
  utcPulseKey
} from "./playbook";

describe("playbook dealer", () => {
  it("always deals standing plays without a live signal", () => {
    const plays = dealPlays({ pulse: true });
    expect(plays.length).toBeGreaterThanOrEqual(3);
    expect(plays.length).toBeLessThanOrEqual(PLAY_MAX);
    expect(plays.map((play) => play.id)).toEqual([
      "daily-pulse",
      "reply-narrative",
      "share-telegram",
      "invite-raider"
    ]);
    expect(plays.every((play) => play.kind === "standing")).toBe(true);
  });

  it("overlays quote-signal when a whale, volume, mention, or KOL signal exists", () => {
    for (const type of [SignalType.WHALE_BUY, SignalType.VOLUME_SPIKE, SignalType.MENTION_SPIKE, SignalType.KOL_POST]) {
      const plays = dealPlays({ signalType: type });
      expect(plays[0].id).toBe("reply-narrative");
      expect(plays[1].id).toBe("quote-signal");
      expect(plays[1].kind).toBe("triggered");
      expect(plays.some((play) => play.id === "share-telegram")).toBe(true);
      expect(plays.some((play) => play.id === "invite-raider")).toBe(true);
    }
  });

  it("adds the X Community bonus only when the mint is bound", () => {
    const unbound = dealPlays({ signalType: SignalType.KOL_POST });
    expect(unbound.some((play) => play.id === "x-community")).toBe(false);
    const bound = dealPlays({ signalType: SignalType.KOL_POST, xCommunityId: "123456789" });
    const xc = bound.find((play) => play.id === "x-community");
    expect(xc?.details).toBe("x-community:123456789");
    expect(playIdFromDetails(xc?.details)).toBe("x-community");
  });

  it("adds a Dex comment when a pair URL is bound and there is a free slot", () => {
    const plays = dealPlays({ pulse: true, dexUrl: "https://dexscreener.com/ethereum/0xpair" });
    expect(plays.some((play) => play.id === "dex-comment")).toBe(true);
    expect(plays.length).toBeLessThanOrEqual(PLAY_MAX);
  });

  it("caps live raids at five plays so KOL overlays do not dump the whole deck", () => {
    const plays = dealPlays({
      signalType: SignalType.KOL_POST,
      xCommunityId: "99",
      dexUrl: "https://dexscreener.com/ethereum/0xpair"
    });
    expect(plays.length).toBe(PLAY_MAX);
    expect(plays.map((play) => play.id)).toEqual([
      "reply-narrative",
      "quote-signal",
      "share-telegram",
      "x-community",
      "invite-raider"
    ]);
  });

  it("keeps pulse independent of KOL or mention feeds", () => {
    const plays = dealPlays({ pulse: true, xCommunityId: "1" });
    expect(plays.some((play) => play.kind === "triggered")).toBe(false);
    expect(plays.some((play) => play.id === "quote-signal")).toBe(false);
  });

  it("shuffles the next unsubmitted play per wallet", () => {
    const tasks = [
      { id: "t-a", title: "A" },
      { id: "t-b", title: "B" },
      { id: "t-c", title: "C" }
    ];
    const first = nextUnsubmittedTask(tasks, "0xabc", "mission-1", []);
    const same = nextUnsubmittedTask(tasks, "0xabc", "mission-1", []);
    const other = nextUnsubmittedTask(tasks, "0xdef", "mission-1", []);
    expect(first?.id).toBe(same?.id);
    expect(nextUnsubmittedTask(tasks, "0xabc", "mission-1", [first!.id])?.id).not.toBe(first?.id);
    expect(other?.id).toBeTruthy();
  });

  it("keys the daily pulse to UTC date so it cannot duplicate in one day", () => {
    expect(utcPulseKey("demo-community", new Date("2026-08-18T23:59:00.000Z"))).toBe("pulse:demo-community:2026-08-18");
  });

  it("stores play ids in task details without breaking X Community proof details", () => {
    expect(playIdFromDetails("play:quote-signal")).toBe("quote-signal");
    expect(playIdFromDetails("play:quote-signal\ntarget:https://x.com/user/status/1")).toBe("quote-signal");
    expect(playIdFromDetails("x-community:123456789")).toBe("x-community");
    expect(playIdFromDetails(null)).toBeNull();
  });

  it("attaches a raid target to reply and quote when a post URL is ingested", () => {
    const plays = dealPlays({
      signalType: SignalType.KOL_POST,
      targetUrl: "https://x.com/kol/status/42"
    });
    const quote = plays.find((play) => play.id === "quote-signal");
    expect(quote?.details).toContain("target:https://x.com/kol/status/42");
    expect(targetUrlFromDetails(quote?.details)).toBe("https://x.com/kol/status/42");
    expect(targetUrlFromDetails("x-community:123456789")).toBe("https://x.com/i/communities/123456789");
  });

  it("reads a tweet URL from signal metadata or sourceRef, not by scraping X", () => {
    expect(extractSignalTarget({ tweetUrl: "https://x.com/a/status/1" })).toBe("https://x.com/a/status/1");
    expect(extractSignalTarget({}, "https://x.com/a/status/2")).toBe("https://x.com/a/status/2");
    expect(extractSignalTarget({ ticker: "PEPE" }, "demo-1")).toBeNull();
  });

  it("uses expected action types for standing plays", () => {
    const plays = dealPlays({ pulse: true });
    expect(plays.find((play) => play.id === "reply-narrative")?.actionType).toBe(ActionType.REPLY);
    expect(plays.find((play) => play.id === "share-telegram")?.platform).toBe(Platform.TELEGRAM);
    expect(plays.find((play) => play.id === "invite-raider")?.actionType).toBe(ActionType.INVITE);
  });
});
