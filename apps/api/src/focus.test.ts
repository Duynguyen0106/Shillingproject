import { describe, expect, it } from "vitest";
import { FOCUS_RAID_MS, focusChangeAllowed, isFocusLive, serializeFocus, shillAllowedDuringFocus } from "./focus";

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

  it("lets any member set the first focus but only the lead can move or clear it", () => {
    expect(focusChangeAllowed({ action: "set", isLead: false, live: false, nextPostId: "p1" }).ok).toBe(true);
    expect(focusChangeAllowed({
      action: "set",
      isLead: false,
      live: true,
      currentPostId: "p1",
      nextPostId: "p1"
    }).ok).toBe(true);
    expect(focusChangeAllowed({
      action: "set",
      isLead: false,
      live: true,
      currentPostId: "p1",
      nextPostId: "p2"
    }).ok).toBe(false);
    expect(focusChangeAllowed({
      action: "set",
      isLead: true,
      live: true,
      currentPostId: "p1",
      nextPostId: "p2"
    }).ok).toBe(true);
    expect(focusChangeAllowed({ action: "clear", isLead: false, live: true }).ok).toBe(false);
    expect(focusChangeAllowed({ action: "clear", isLead: true, live: true }).ok).toBe(true);
    expect(focusChangeAllowed({
      action: "set",
      isLead: false,
      seatVacant: true,
      live: true,
      currentPostId: "p1",
      nextPostId: "p2"
    }).ok).toBe(true);
    expect(focusChangeAllowed({ action: "clear", isLead: false, seatVacant: true, live: true }).ok).toBe(true);
  });

  it("blocks shills on other posts while a focus raid is live", () => {
    expect(shillAllowedDuringFocus({ live: true, focusPostId: "p1", postId: "p1" }).ok).toBe(true);
    expect(shillAllowedDuringFocus({ live: true, focusPostId: "p1", postId: "p2" }).ok).toBe(false);
    expect(shillAllowedDuringFocus({ live: false, focusPostId: "p1", postId: "p2" }).ok).toBe(true);
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
