import { describe, expect, it } from "vitest";
import {
  liveListenerCount,
  postsCreatedSince,
  publishLivePost,
  subscribeLiveFeed,
  toLiveFeedEvent
} from "./livefeed";

describe("live raid feed", () => {
  it("serializes a KOL post for popups", () => {
    const event = toLiveFeedEvent(
      "demo-community",
      {
        id: "p1",
        kind: "KOL_POST",
        url: "https://x.com/whale/status/9",
        authorHandle: "whale",
        authorName: "Whale",
        authorFollowers: 220000,
        text: "$PEPE going",
        likeCount: 40,
        replyCount: 4,
        retweetCount: 3,
        quoteCount: 1,
        postedAt: "2026-08-19T00:00:00.000Z",
        createdAt: "2026-08-19T00:01:00.000Z"
      },
      { handle: "whale", displayName: "Whale", followers: 220000, verified: true, profileImageUrl: "https://img/whale.jpg" }
    );
    expect(event.kol?.followers).toBe(220000);
    expect(event.post.heat).toBe(48);
    expect(event.post.createdAt).toBe("2026-08-19T00:01:00.000Z");
  });

  it("pushes new posts to community subscribers", () => {
    const seen: string[] = [];
    const stop = subscribeLiveFeed("demo-community", (event) => seen.push(event.post.id));
    expect(liveListenerCount("demo-community")).toBe(1);
    publishLivePost(toLiveFeedEvent("demo-community", {
      id: "fresh",
      kind: "KOL_POST",
      url: "https://x.com/whale/status/10",
      authorHandle: "whale",
      text: "new",
      postedAt: new Date()
    }));
    publishLivePost(toLiveFeedEvent("other", {
      id: "skip",
      kind: "KOL_POST",
      url: "https://x.com/x/status/1",
      authorHandle: "x",
      text: "other mint",
      postedAt: new Date()
    }));
    expect(seen).toEqual(["fresh"]);
    stop();
    expect(liveListenerCount("demo-community")).toBe(0);
  });

  it("keeps only posts ingested after since", () => {
    const posts = [
      { id: "old", createdAt: "2026-08-19T00:00:00.000Z" },
      { id: "new", createdAt: "2026-08-19T00:05:00.000Z" }
    ];
    expect(postsCreatedSince(posts, new Date("2026-08-19T00:01:00.000Z")).map((post) => post.id)).toEqual(["new"]);
  });
});
