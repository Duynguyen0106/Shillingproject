import { describe, expect, it } from "vitest";
import { computeScore, scoreAttributedClick } from "./index";

describe("computeScore", () => {
  it("matches v1 formula for a high-priority early reply with duplicate penalty", () => {
    const points = computeScore({
      basePoints: 10,
      isEarly: true,
      engagementValue: 25,
      highPriority: true,
      duplicatePenalty: true
    });
    expect(points).toBe(18);
  });

  it("awards 2 points for a high-priority attributed click", () => {
    expect(scoreAttributedClick({ highPriority: true })).toBe(2);
    expect(scoreAttributedClick({ highPriority: false })).toBe(1);
  });
});
