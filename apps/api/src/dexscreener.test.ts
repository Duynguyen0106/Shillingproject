import { describe, expect, it } from "vitest";
import { parseTokenQuery, pickCanonicalPair, normalizeContract } from "./dexscreener";

describe("DexScreener query parsing", () => {
  it("parses a DexScreener pair URL", () => {
    expect(parseTokenQuery("https://dexscreener.com/ethereum/0x11950d141ecb863f01007bb7db3b4e34ed3a8960")).toEqual({
      kind: "url",
      chainId: "ethereum",
      address: "0x11950d141ecb863f01007bb7db3b4e34ed3a8960"
    });
  });

  it("parses an EVM contract and a ticker search", () => {
    expect(parseTokenQuery("0x6982508145454ce325ddbe47a25d4ec3d2311933")).toEqual({
      kind: "address",
      address: "0x6982508145454ce325ddbe47a25d4ec3d2311933"
    });
    expect(parseTokenQuery("PEPE")).toEqual({ kind: "search", q: "PEPE" });
  });

  it("picks the highest-liquidity pair as the canonical token", () => {
    const token = pickCanonicalPair([
      {
        chainId: "ethereum",
        url: "https://dexscreener.com/ethereum/low",
        baseToken: { address: "0xabc", name: "Pepe", symbol: "PEPE" },
        liquidity: { usd: 100 }
      },
      {
        chainId: "ethereum",
        url: "https://dexscreener.com/ethereum/high",
        pairAddress: "0xpair",
        baseToken: { address: "0x6982508145454ce325ddbe47a25d4ec3d2311933", name: "Pepe", symbol: "PEPE" },
        liquidity: { usd: 9_000_000 }
      }
    ], "0x6982508145454ce325ddbe47a25d4ec3d2311933");
    expect(token?.address).toBe(normalizeContract("0x6982508145454ce325ddbe47a25d4ec3d2311933"));
    expect(token?.liquidityUsd).toBe(9_000_000);
    expect(token?.matchedBy).toBe("address");
  });
});
