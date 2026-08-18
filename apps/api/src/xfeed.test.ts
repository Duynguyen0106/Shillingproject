import { describe, expect, it } from "vitest";
import {
  mentionMatches,
  mentionSearchQuery,
  normalizeProviderTweet,
  parseXHandle,
  parseXStatusUrl
} from "./xfeed";

describe("raid feed targeting", () => {
  it("parses KOL handles from @user, user, and x.com URLs", () => {
    expect(parseXHandle("@ElonMusk")).toBe("elonmusk");
    expect(parseXHandle("https://x.com/elonmusk/status/1")).toBe("elonmusk");
    expect(parseXHandle("https://x.com/i/communities/1")).toBeNull();
  });

  it("parses a status URL members can click to shill", () => {
    expect(parseXStatusUrl("https://twitter.com/kol/status/99")).toEqual({
      handle: "kol",
      id: "99",
      url: "https://x.com/kol/status/99"
    });
  });

  it("detects ticker and contract mentions so the community can pile on", () => {
    expect(mentionMatches("$PEPE is moving", "PEPE", null)).toBe(true);
    expect(mentionMatches("buy 0x6982508145454ce325ddbe47a25d4ec3d2311933 now", "PEPE", "0x6982508145454ce325ddbe47a25d4ec3d2311933")).toBe(true);
    expect(mentionMatches("nice weather", "PEPE", "0x6982")).toBe(false);
  });

  it("builds a mention search from ticker and CA", () => {
    expect(mentionSearchQuery("PEPE", "0xabc")).toContain("$PEPE");
    expect(mentionSearchQuery("PEPE", "0x6982508145454ce325ddbe47a25d4ec3d2311933")).toContain("0x6982508145454ce325ddbe47a25d4ec3d2311933");
  });

  it("normalizes twitterapi.io tweets into clickable posts", () => {
    const post = normalizeProviderTweet({
      id: "42",
      url: "https://x.com/kol/status/42",
      text: "$PEPE",
      createdAt: "Tue Dec 10 07:00:30 +0000 2024",
      author: { userName: "kol", name: "KOL" }
    });
    expect(post?.url).toBe("https://x.com/kol/status/42");
    expect(post?.authorHandle).toBe("kol");
  });
});
