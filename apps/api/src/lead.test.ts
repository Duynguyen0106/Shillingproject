import { describe, expect, it } from "vitest";
import { LEAD_INACTIVE_MS, evaluateLeadSeat } from "./lead";

describe("CTO lead seat", () => {
  it("is resigned when nobody holds lead", () => {
    const seat = evaluateLeadSeat(null);
    expect(seat.vacant).toBe(true);
    expect(seat.reason).toBe("resigned");
    expect(seat.wallet).toBeNull();
  });

  it("stays occupied while the lead is recently active", () => {
    const seat = evaluateLeadSeat({
      role: "lead",
      lastActiveAt: new Date(),
      user: { wallet: "0xlead", displayName: "Lead" }
    });
    expect(seat.vacant).toBe(false);
    expect(seat.reason).toBe("occupied");
    expect(seat.wallet).toBe("0xlead");
    expect(seat.remainingMs).toBeGreaterThan(LEAD_INACTIVE_MS - 5_000);
  });

  it("opens the seat after 48h of lead inactivity", () => {
    const seat = evaluateLeadSeat({
      role: "lead",
      lastActiveAt: new Date(Date.now() - LEAD_INACTIVE_MS - 1_000),
      user: { wallet: "0xold", displayName: "Gone" }
    });
    expect(seat.vacant).toBe(true);
    expect(seat.reason).toBe("inactive");
    expect(seat.wallet).toBe("0xold");
    expect(seat.remainingMs).toBe(0);
  });
});
