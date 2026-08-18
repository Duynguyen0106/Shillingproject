export type DexPair = {
  chainId?: string;
  dexId?: string;
  url?: string;
  pairAddress?: string;
  baseToken?: { address?: string; name?: string; symbol?: string };
  quoteToken?: { address?: string; name?: string; symbol?: string };
  priceUsd?: string;
  liquidity?: { usd?: number };
  info?: { imageUrl?: string };
};

export type CanonicalToken = {
  chainId: string;
  address: string;
  name: string;
  symbol: string;
  priceUsd: string | null;
  liquidityUsd: number;
  dexUrl: string;
  imageUrl: string | null;
  pairAddress: string | null;
  matchedBy: "address" | "pair" | "search";
};

export type ParsedTokenQuery =
  | { kind: "url"; chainId: string; address: string }
  | { kind: "address"; address: string }
  | { kind: "search"; q: string };

const EVM_ADDRESS = /^0x[a-fA-F0-9]{40}$/;
const SOLANA_ADDRESS = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

export function normalizeContract(address: string): string {
  return address.startsWith("0x") ? address.toLowerCase() : address;
}

export function parseTokenQuery(input: string): ParsedTokenQuery {
  const raw = input.trim();
  try {
    const url = new URL(raw);
    if (url.hostname.replace(/^www\./, "").includes("dexscreener.com")) {
      const parts = url.pathname.split("/").filter(Boolean);
      if (parts[0] === "dex" && parts[1]) {
        return parseTokenQuery(parts.slice(1).join("/"));
      }
      if (parts.length >= 2) {
        return { kind: "url", chainId: parts[0].toLowerCase(), address: parts[1] };
      }
    }
  } catch {
    /* not a URL */
  }
  if (EVM_ADDRESS.test(raw) || SOLANA_ADDRESS.test(raw)) {
    return { kind: "address", address: raw };
  }
  const chainPrefixed = raw.match(/^([a-z0-9]+):(.+)$/i);
  if (chainPrefixed && (EVM_ADDRESS.test(chainPrefixed[2]) || SOLANA_ADDRESS.test(chainPrefixed[2]))) {
    return { kind: "url", chainId: chainPrefixed[1].toLowerCase(), address: chainPrefixed[2] };
  }
  return { kind: "search", q: raw };
}

export function pickCanonicalPair(pairs: DexPair[], preferredAddress?: string): CanonicalToken | null {
  const ranked = [...pairs].sort((a, b) => (b.liquidity?.usd ?? 0) - (a.liquidity?.usd ?? 0));
  const preferred = preferredAddress
    ? ranked.find((pair) => {
        const needle = normalizeContract(preferredAddress);
        return (
          normalizeContract(pair.baseToken?.address ?? "") === needle ||
          normalizeContract(pair.quoteToken?.address ?? "") === needle ||
          normalizeContract(pair.pairAddress ?? "") === needle
        );
      })
    : undefined;
  const pair = preferred ?? ranked[0];
  if (!pair?.chainId || !pair.baseToken?.address) return null;
  const token = preferredAddress && normalizeContract(pair.quoteToken?.address ?? "") === normalizeContract(preferredAddress)
    ? pair.quoteToken
    : pair.baseToken;
  if (!token?.address) return null;
  return {
    chainId: pair.chainId,
    address: normalizeContract(token.address),
    name: token.name || token.symbol || "Unknown token",
    symbol: (token.symbol || "TOKEN").slice(0, 12),
    priceUsd: pair.priceUsd ?? null,
    liquidityUsd: pair.liquidity?.usd ?? 0,
    dexUrl: pair.url || `https://dexscreener.com/${pair.chainId}/${pair.pairAddress ?? token.address}`,
    imageUrl: pair.info?.imageUrl ?? null,
    pairAddress: pair.pairAddress ?? null,
    matchedBy: preferredAddress ? (normalizeContract(pair.pairAddress ?? "") === normalizeContract(preferredAddress) ? "pair" : "address") : "search"
  };
}

function pairsFromBody(body: unknown): DexPair[] {
  if (Array.isArray(body)) return body as DexPair[];
  if (body && typeof body === "object" && Array.isArray((body as { pairs?: unknown }).pairs)) {
    return (body as { pairs: DexPair[] }).pairs;
  }
  return [];
}

export async function lookupDexToken(
  query: string,
  fetcher: typeof fetch = fetch
): Promise<CanonicalToken | null> {
  const parsed = parseTokenQuery(query);
  const headers = { accept: "application/json" };
  if (parsed.kind === "url") {
    const pairRes = await fetcher(`https://api.dexscreener.com/latest/dex/pairs/${parsed.chainId}/${parsed.address}`, { headers });
    const pairBody = pairRes.ok ? await pairRes.json() : null;
    const fromPair = pickCanonicalPair(pairsFromBody(pairBody), parsed.address);
    if (fromPair) return fromPair;
    const tokenRes = await fetcher(`https://api.dexscreener.com/latest/dex/tokens/${parsed.address}`, { headers });
    const tokenBody = tokenRes.ok ? await tokenRes.json() : null;
    return pickCanonicalPair(pairsFromBody(tokenBody), parsed.address);
  }
  if (parsed.kind === "address") {
    const tokenRes = await fetcher(`https://api.dexscreener.com/latest/dex/tokens/${parsed.address}`, { headers });
    const tokenBody = tokenRes.ok ? await tokenRes.json() : null;
    return pickCanonicalPair(pairsFromBody(tokenBody), parsed.address);
  }
  const searchRes = await fetcher(`https://api.dexscreener.com/latest/dex/search?q=${encodeURIComponent(parsed.q)}`, { headers });
  const searchBody = searchRes.ok ? await searchRes.json() : null;
  return pickCanonicalPair(pairsFromBody(searchBody));
}
