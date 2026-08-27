import { describe, expect, it } from "vitest";
import {
  applyFeedFilters,
  applyKolFilters,
  attachKolStats,
  mentionMatches,
  mentionSearchQuery,
  normalizeKolProfile,
  normalizeProviderTweet,
  parseXHandle,
  parseXStatusUrl,
  postHeat
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
      likeCount: 1200,
      replyCount: 80,
      retweetCount: 40,
      viewCount: 90000,
      author: { userName: "kol", name: "KOL", followers: 250000 }
    });
    expect(post?.url).toBe("https://x.com/kol/status/42");
    expect(post?.authorHandle).toBe("kol");
    expect(post?.authorFollowers).toBe(250000);
    expect(postHeat(post!)).toBe(1320);
  });

  it("lets members filter KOLs by handle, followers, and interaction", () => {
    const posts = [
      { authorHandle: "whale", kind: "KOL_POST", authorFollowers: 200000, likeCount: 10, replyCount: 0, retweetCount: 0, quoteCount: 0, postedAt: "2026-08-18T12:00:00.000Z" },
      { authorHandle: "micro", kind: "MENTION", authorFollowers: 800, likeCount: 5, replyCount: 1, retweetCount: 0, quoteCount: 0, postedAt: "2026-08-18T13:00:00.000Z" }
    ];
    expect(applyFeedFilters(posts, { handle: "whale" }).map((post) => post.authorHandle)).toEqual(["whale"]);
    expect(applyFeedFilters(posts, { minFollowers: 10000 })).toHaveLength(1);
    expect(applyFeedFilters(posts, { minEngagement: 20 })).toHaveLength(0);
    expect(applyFeedFilters(posts, { kind: "MENTION" })[0].authorHandle).toBe("micro");
    expect(applyFeedFilters(posts, { sort: "hot" })[0].authorHandle).toBe("whale");
  });

  it("attaches post interaction onto watched KOLs and filters the watch list", () => {
    const kols = attachKolStats(
      [
        { id: "k1", handle: "whale", displayName: "Whale", followers: 200000 },
        { id: "k2", handle: "micro", displayName: "Micro", followers: 800 }
      ],
      [
        { authorHandle: "whale", kolWatchId: "k1", likeCount: 40, replyCount: 5, retweetCount: 2, quoteCount: 1, postedAt: "2026-08-18T12:00:00.000Z" },
        { authorHandle: "micro", kolWatchId: "k2", likeCount: 1, replyCount: 0, retweetCount: 0, quoteCount: 0, postedAt: "2026-08-18T13:00:00.000Z" }
      ]
    );
    expect(kols[0].stats.heat).toBe(48);
    expect(applyKolFilters(kols, { minFollowers: 10000 }).map((kol) => kol.handle)).toEqual(["whale"]);
    expect(applyKolFilters(kols, { q: "mic" }).map((kol) => kol.handle)).toEqual(["micro"]);
    expect(applyKolFilters(kols, { minEngagement: 20 }).map((kol) => kol.handle)).toEqual(["whale"]);
  });

  it("reads KOL profile stats from provider payloads", () => {
    const kol = normalizeKolProfile({
      userName: "kol",
      name: "Top Voice",
      description: "calls",
      followers: 88000,
      isBlueVerified: true,
      profilePicture: "https://example.com/kol.jpg"
    });
    expect(kol).toMatchObject({ handle: "kol", followers: 88000, verified: true });
  });
});
