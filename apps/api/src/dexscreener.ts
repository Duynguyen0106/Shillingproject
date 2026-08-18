export type DexPair = {
  chainId?: string;
  dexId?: string;
  url?: string;
  pairAddress?: string;
  pairCreatedAt?: number;
  baseToken?: { address?: string; name?: string; symbol?: string };
  quoteToken?: { address?: string; name?: string; symbol?: string };
  priceUsd?: string;
  liquidity?: { usd?: number };
  volume?: { h24?: number };
  info?: {
    imageUrl?: string;
    websites?: { url?: string }[];
    socials?: { type?: string; url?: string }[];
  };
};

export type CanonicalToken = {
  chainId: string;
  address: string;
  name: string;
  symbol: string;
  priceUsd: string | null;
  liquidityUsd: number;
  volume24hUsd: number;
  pairCreatedAt: number | null;
  dexUrl: string;
  chartUrl: string | null;
  imageUrl: string | null;
  pairAddress: string | null;
  dexId: string | null;
  websites: string[];
  socials: { type: string; url: string }[];
  matchedBy: "address" | "pair" | "search";
};

export type ChainListing = {
  chainId: string;
  address: string;
  name: string;
  symbol: string;
  liquidityUsd: number;
  dexUrl: string;
  pairAddress: string | null;
};

export type TrustReport = {
  level: "ok" | "caution" | "high-risk";
  reasons: string[];
};

export type DexLookupResult = {
  token: CanonicalToken;
  listings: ChainListing[];
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

function tokenSide(pair: DexPair, preferredAddress?: string) {
  if (preferredAddress && normalizeContract(pair.quoteToken?.address ?? "") === normalizeContract(preferredAddress)) {
    return pair.quoteToken;
  }
  return pair.baseToken;
}

function toCanonical(pair: DexPair, preferredAddress?: string, matchedBy: CanonicalToken["matchedBy"] = "search"): CanonicalToken | null {
  if (!pair.chainId || !pair.baseToken?.address) return null;
  const token = tokenSide(pair, preferredAddress);
  if (!token?.address) return null;
  const pairAddress = pair.pairAddress ?? null;
  return {
    chainId: pair.chainId,
    address: normalizeContract(token.address),
    name: token.name || token.symbol || "Unknown token",
    symbol: (token.symbol || "TOKEN").slice(0, 12),
    priceUsd: pair.priceUsd ?? null,
    liquidityUsd: pair.liquidity?.usd ?? 0,
    volume24hUsd: pair.volume?.h24 ?? 0,
    pairCreatedAt: pair.pairCreatedAt ?? null,
    dexUrl: pair.url || `https://dexscreener.com/${pair.chainId}/${pairAddress ?? token.address}`,
    chartUrl: pairAddress ? `https://dexscreener.com/${pair.chainId}/${pairAddress}?embed=1&theme=dark&trades=0&info=0` : null,
    imageUrl: pair.info?.imageUrl ?? null,
    pairAddress,
    dexId: pair.dexId ?? null,
    websites: (pair.info?.websites ?? []).map((site) => site.url).filter((url): url is string => Boolean(url)),
    socials: (pair.info?.socials ?? [])
      .filter((social) => social.url)
      .map((social) => ({ type: social.type || "link", url: social.url as string })),
    matchedBy
  };
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
  if (!pair) return null;
  const matchedBy: CanonicalToken["matchedBy"] = preferredAddress
    ? (normalizeContract(pair.pairAddress ?? "") === normalizeContract(preferredAddress) ? "pair" : "address")
    : "search";
  return toCanonical(pair, preferredAddress, matchedBy);
}

export function chainListings(pairs: DexPair[], tokenAddress: string): ChainListing[] {
  const needle = normalizeContract(tokenAddress);
  const byChain = new Map<string, ChainListing>();
  for (const pair of pairs) {
    const token = tokenSide(pair, tokenAddress);
    if (!pair.chainId || !token?.address) continue;
    if (normalizeContract(token.address) !== needle) continue;
    const liquidityUsd = pair.liquidity?.usd ?? 0;
    const current = byChain.get(pair.chainId);
    if (current && current.liquidityUsd >= liquidityUsd) continue;
    byChain.set(pair.chainId, {
      chainId: pair.chainId,
      address: normalizeContract(token.address),
      name: token.name || token.symbol || "Unknown token",
      symbol: (token.symbol || "TOKEN").slice(0, 12),
      liquidityUsd,
      dexUrl: pair.url || `https://dexscreener.com/${pair.chainId}/${pair.pairAddress ?? token.address}`,
      pairAddress: pair.pairAddress ?? null
    });
  }
  return [...byChain.values()].sort((a, b) => b.liquidityUsd - a.liquidityUsd);
}

export function tokenTrustSignals(token: CanonicalToken, ambiguous = false): TrustReport {
  const reasons: string[] = [];
  if (ambiguous || token.matchedBy === "search") {
    reasons.push("Ticker search is ambiguous. Confirm this exact contract on DexScreener.");
  }
  if (token.liquidityUsd < 10_000) {
    reasons.push("Liquidity is under $10k. Thin pools are a common scam/honeypot pattern.");
  } else if (token.liquidityUsd < 50_000) {
    reasons.push("Liquidity is under $50k. Treat this mint as high-caution.");
  }
  if (token.pairCreatedAt && Date.now() - token.pairCreatedAt < 24 * 60 * 60 * 1000) {
    reasons.push("This pair is less than 24 hours old.");
  }
  if (token.socials.length === 0 && token.websites.length === 0) {
    reasons.push("DexScreener lists no website or socials for this pair.");
  }
  const level = reasons.some((reason) => reason.includes("under $10k"))
    ? "high-risk"
    : reasons.length > 0
      ? "caution"
      : "ok";
  if (level === "ok") {
    reasons.push("Highest-liquidity DexScreener market for this contract. Still verify the address before joining any chat.");
  }
  return { level, reasons };
}

function pairsFromBody(body: unknown): DexPair[] {
  if (Array.isArray(body)) return body as DexPair[];
  if (body && typeof body === "object" && Array.isArray((body as { pairs?: unknown }).pairs)) {
    return (body as { pairs: DexPair[] }).pairs;
  }
  return [];
}

function packResult(pairs: DexPair[], preferredAddress?: string): DexLookupResult | null {
  const token = pickCanonicalPair(pairs, preferredAddress);
  if (!token) return null;
  return { token, listings: chainListings(pairs, token.address) };
}

export async function lookupDexToken(
  query: string,
  fetcher: typeof fetch = fetch
): Promise<DexLookupResult | null> {
  const parsed = parseTokenQuery(query);
  const headers = { accept: "application/json" };
  if (parsed.kind === "url") {
    const pairRes = await fetcher(`https://api.dexscreener.com/latest/dex/pairs/${parsed.chainId}/${parsed.address}`, { headers });
    const pairBody = pairRes.ok ? await pairRes.json() : null;
    const fromPair = packResult(pairsFromBody(pairBody), parsed.address);
    if (fromPair) return fromPair;
    const tokenRes = await fetcher(`https://api.dexscreener.com/latest/dex/tokens/${parsed.address}`, { headers });
    const tokenBody = tokenRes.ok ? await tokenRes.json() : null;
    return packResult(pairsFromBody(tokenBody), parsed.address);
  }
  if (parsed.kind === "address") {
    const tokenRes = await fetcher(`https://api.dexscreener.com/latest/dex/tokens/${parsed.address}`, { headers });
    const tokenBody = tokenRes.ok ? await tokenRes.json() : null;
    return packResult(pairsFromBody(tokenBody), parsed.address);
  }
  const searchRes = await fetcher(`https://api.dexscreener.com/latest/dex/search?q=${encodeURIComponent(parsed.q)}`, { headers });
  const searchBody = searchRes.ok ? await searchRes.json() : null;
  return packResult(pairsFromBody(searchBody));
}
