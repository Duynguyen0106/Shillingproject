import { describe, expect, it } from "vitest";
import { attachShillState, serializeShillHistory } from "./shill";

describe("coin shill history", () => {
  it("marks posts a member already shilled and keeps reshills countable", () => {
    const posts = attachShillState(
      [{ id: "p1" }, { id: "p2" }],
      [
        { feedPostId: "p1", userId: "u1", createdAt: "2026-08-19T01:00:00.000Z", reshill: true, user: { wallet: "0xme", displayName: "Me" } },
        { feedPostId: "p1", userId: "u1", createdAt: "2026-08-19T00:00:00.000Z", user: { wallet: "0xme", displayName: "Me" } },
        { feedPostId: "p1", userId: "u2", createdAt: "2026-08-19T00:30:00.000Z", user: { wallet: "0x2", displayName: "Bo" } }
      ],
      "u1"
    );
    expect(posts[0]).toMatchObject({
      youShilled: true,
      youShillCount: 2,
      raiderCount: 2,
      shillCount: 3
    });
    expect(posts[1].youShilled).toBe(false);
  });

  it("serializes a coin shill timeline with a you flag", () => {
    const history = serializeShillHistory(
      [
        { id: "s1", feedPostId: "p1", userId: "u1", createdAt: "2026-08-19T01:00:00.000Z", reshill: true, user: { wallet: "0xme", displayName: "Me" } }
      ],
      "u1"
    );
    expect(history[0]).toMatchObject({ you: true, reshill: true, feedPostId: "p1" });
  });
});
