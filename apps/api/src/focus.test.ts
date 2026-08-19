import { describe, expect, it } from "vitest";
import { FOCUS_RAID_MS, isFocusLive, serializeFocus } from "./focus";

describe("focus raid", () => {
  it("is live only while the window is open", () => {
    const now = Date.parse("2026-08-19T02:00:00.000Z");
    expect(isFocusLive({
      focusPostId: "p1",
      focusAt: "2026-08-19T01:00:00.000Z"
    }, now)).toBe(true);
    expect(isFocusLive({
      focusPostId: "p1",
      focusAt: "2026-08-19T00:00:00.000Z"
    }, now, FOCUS_RAID_MS)).toBe(true);
    expect(isFocusLive({
      focusPostId: "p1",
      focusAt: "2026-08-18T23:00:00.000Z"
    }, now)).toBe(false);
    expect(isFocusLive({ focusPostId: null, focusAt: "2026-08-19T01:00:00.000Z" }, now)).toBe(false);
  });

  it("serializes the post everyone should reply to", () => {
    const now = Date.parse("2026-08-19T01:10:00.000Z");
    expect(serializeFocus({
      focusPostId: "p1",
      focusAt: "2026-08-19T01:00:00.000Z",
      post: { id: "p1", url: "https://x.com/whale/status/9", authorHandle: "whale", text: "gm", kind: "KOL_POST" },
      by: { wallet: "0xlead", displayName: "Lead" }
    }, now)).toMatchObject({
      postId: "p1",
      url: "https://x.com/whale/status/9",
      authorHandle: "whale",
      by: { wallet: "0xlead", displayName: "Lead" }
    });
  });
});
