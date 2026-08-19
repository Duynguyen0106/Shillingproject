import { describe, expect, it } from "vitest";
import { parseXCommunityUrl, proofMatchesXCommunity } from "./xcommunity";

describe("X Community URLs", () => {
  it("parses x.com and twitter.com community links", () => {
    expect(parseXCommunityUrl("https://x.com/i/communities/123456789")).toEqual({
      id: "123456789",
      url: "https://x.com/i/communities/123456789"
    });
    expect(parseXCommunityUrl("https://twitter.com/i/communities/123456789/about")).toEqual({
      id: "123456789",
      url: "https://x.com/i/communities/123456789"
    });
  });

  it("rejects a profile or status URL as a community bind", () => {
    expect(parseXCommunityUrl("https://x.com/pepecoin")).toBeNull();
    expect(parseXCommunityUrl("https://x.com/user/status/1")).toBeNull();
  });

  it("accepts a community post URL as proof for that community only", () => {
    expect(proofMatchesXCommunity("https://x.com/i/communities/123456789/posts/99", "123456789")).toBe(true);
    expect(proofMatchesXCommunity("https://x.com/user/status/1", "123456789")).toBe(false);
    expect(proofMatchesXCommunity("https://x.com/i/communities/999/posts/1", "123456789")).toBe(false);
  });
});
