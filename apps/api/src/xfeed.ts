export type FeedProvider = "twitterapi.io" | "x" | "none";

export type NormalizedPost = {
  id: string;
  url: string;
  authorHandle: string;
  authorName?: string;
  authorId?: string;
  text: string;
  postedAt: Date;
};

export function parseXHandle(input: string): string | null {
  const raw = input.trim();
  if (!raw) return null;
  if (raw.startsWith("@") && !raw.includes("/")) {
    const handle = raw.slice(1).replace(/[^a-zA-Z0-9_]/g, "");
    return handle.length >= 1 ? handle.toLowerCase() : null;
  }
  if (/^[a-zA-Z0-9_]{1,15}$/.test(raw)) return raw.toLowerCase();
  try {
    const url = new URL(raw);
    const host = url.hostname.replace(/^www\./, "").toLowerCase();
    if (host !== "x.com" && host !== "twitter.com") return null;
    const parts = url.pathname.split("/").filter(Boolean);
    if (!parts[0] || parts[0] === "i" || parts[0] === "intent" || parts[0] === "home") return null;
    if (!/^[a-zA-Z0-9_]{1,15}$/.test(parts[0])) return null;
    return parts[0].toLowerCase();
  } catch {
    return null;
  }
}

export function parseXStatusUrl(input: string): { handle?: string; id: string; url: string } | null {
  try {
    const url = new URL(input.trim());
    const host = url.hostname.replace(/^www\./, "").toLowerCase();
    if (host !== "x.com" && host !== "twitter.com") return null;
    const parts = url.pathname.split("/").filter(Boolean);
    const statusIdx = parts.indexOf("status");
    const id = statusIdx >= 0 ? parts[statusIdx + 1] : null;
    if (!id || !/^\d+$/.test(id)) return null;
    const handle = parts[0] && parts[0] !== "i" && parts[0] !== "status" ? parts[0] : undefined;
    return { handle, id, url: `https://x.com/${handle ?? "i"}/status/${id}` };
  } catch {
    return null;
  }
}

export function mentionMatches(text: string, ticker?: string | null, contractAddress?: string | null): boolean {
  const body = text || "";
  if (ticker && ticker.length >= 2) {
    const cashtag = new RegExp(`\\$${ticker}\\b`, "i");
    const word = new RegExp(`(?:^|[^a-zA-Z0-9_])${ticker}\\b`, "i");
    if (cashtag.test(body) || word.test(body)) return true;
  }
  if (contractAddress && contractAddress.length >= 8) {
    if (body.toLowerCase().includes(contractAddress.toLowerCase())) return true;
  }
  return false;
}

export function mentionSearchQuery(ticker?: string | null, contractAddress?: string | null): string | null {
  const parts: string[] = [];
  if (ticker && ticker.length >= 2) {
    parts.push(`$${ticker}`);
    parts.push(ticker);
  }
  if (contractAddress && contractAddress.length >= 8) parts.push(contractAddress);
  if (parts.length === 0) return null;
  return parts.map((part) => `"${part}"`).join(" OR ");
}

export function configuredFeedProvider(): FeedProvider {
  if (process.env.TWITTERAPI_IO_KEY) return "twitterapi.io";
  if (process.env.X_BEARER_TOKEN) return "x";
  return "none";
}

function xStatus(handle: string, id: string): string {
  return `https://x.com/${handle}/status/${id}`;
}

export function normalizeProviderTweet(raw: Record<string, unknown>, fallbackHandle?: string): NormalizedPost | null {
  const id = String(raw.id ?? raw.tweet_id ?? raw.tweetId ?? "");
  const text = String(raw.text ?? raw.full_text ?? "");
  const author = (raw.author && typeof raw.author === "object" ? raw.author : raw.user) as Record<string, unknown> | undefined;
  const handle = parseXHandle(String(author?.userName ?? author?.username ?? author?.screen_name ?? fallbackHandle ?? "")) ?? fallbackHandle;
  if (!id || !handle) return null;
  const parsedUrl = typeof raw.url === "string" ? parseXStatusUrl(raw.url) : null;
  const url = parsedUrl?.url ?? xStatus(handle, id);
  const postedRaw = raw.createdAt ?? raw.created_at ?? raw.postedAt;
  const postedAt = postedRaw ? new Date(String(postedRaw)) : new Date();
  return {
    id,
    url,
    authorHandle: handle.toLowerCase(),
    authorName: typeof author?.name === "string" ? author.name : undefined,
    authorId: typeof author?.id === "string" ? author.id : undefined,
    text,
    postedAt: Number.isNaN(postedAt.getTime()) ? new Date() : postedAt
  };
}

function tweetsFromBody(body: unknown): Record<string, unknown>[] {
  if (!body || typeof body !== "object") return [];
  const record = body as Record<string, unknown>;
  const data = record.data && typeof record.data === "object" ? (record.data as Record<string, unknown>) : record;
  const tweets = data.tweets ?? record.tweets ?? data;
  if (Array.isArray(tweets)) return tweets.filter((item) => item && typeof item === "object") as Record<string, unknown>[];
  return [];
}

async function getJson(url: string, headers: Record<string, string>): Promise<unknown> {
  const res = await fetch(url, { headers });
  if (!res.ok) throw new Error(`Feed provider ${res.status}`);
  return res.json();
}

export async function fetchHandleTweets(handle: string): Promise<NormalizedPost[]> {
  const provider = configuredFeedProvider();
  if (provider === "twitterapi.io") {
    const body = await getJson(
      `https://api.twitterapi.io/twitter/user/last_tweets?userName=${encodeURIComponent(handle)}&includeReplies=false`,
      { "X-API-Key": process.env.TWITTERAPI_IO_KEY as string }
    );
    return tweetsFromBody(body)
      .map((tweet) => normalizeProviderTweet(tweet, handle))
      .filter((post): post is NormalizedPost => Boolean(post))
      .slice(0, 10);
  }
  if (provider === "x") {
    const userRes = await getJson(
      `https://api.twitter.com/2/users/by/username/${encodeURIComponent(handle)}`,
      { Authorization: `Bearer ${process.env.X_BEARER_TOKEN}` }
    ) as { data?: { id: string; name?: string; username?: string } };
    const userId = userRes.data?.id;
    if (!userId) return [];
    const tweets = await getJson(
      `https://api.twitter.com/2/users/${userId}/tweets?max_results=10&tweet.fields=created_at&exclude=replies,retweets`,
      { Authorization: `Bearer ${process.env.X_BEARER_TOKEN}` }
    ) as { data?: { id: string; text: string; created_at?: string }[] };
    return (tweets.data ?? []).map((tweet) => ({
      id: tweet.id,
      url: xStatus(handle, tweet.id),
      authorHandle: handle,
      authorName: userRes.data?.name,
      authorId: userId,
      text: tweet.text,
      postedAt: tweet.created_at ? new Date(tweet.created_at) : new Date()
    }));
  }
  return [];
}

export async function fetchMentionTweets(ticker?: string | null, contractAddress?: string | null): Promise<NormalizedPost[]> {
  const query = mentionSearchQuery(ticker, contractAddress);
  if (!query) return [];
  const provider = configuredFeedProvider();
  if (provider === "twitterapi.io") {
    const body = await getJson(
      `https://api.twitterapi.io/twitter/tweet/advanced_search?query=${encodeURIComponent(query)}&queryType=Latest`,
      { "X-API-Key": process.env.TWITTERAPI_IO_KEY as string }
    );
    return tweetsFromBody(body)
      .map((tweet) => normalizeProviderTweet(tweet))
      .filter((post): post is NormalizedPost => Boolean(post))
      .slice(0, 20);
  }
  if (provider === "x") {
    const body = await getJson(
      `https://api.twitter.com/2/tweets/search/recent?query=${encodeURIComponent(query)}&max_results=20&tweet.fields=created_at,author_id&expansions=author_id&user.fields=username,name`,
      { Authorization: `Bearer ${process.env.X_BEARER_TOKEN}` }
    ) as {
      data?: { id: string; text: string; created_at?: string; author_id?: string }[];
      includes?: { users?: { id: string; username: string; name?: string }[] };
    };
    const users = new Map((body.includes?.users ?? []).map((user) => [user.id, user]));
    return (body.data ?? []).map((tweet) => {
      const author = tweet.author_id ? users.get(tweet.author_id) : undefined;
      const handle = author?.username?.toLowerCase() ?? "i";
      return {
        id: tweet.id,
        url: xStatus(handle, tweet.id),
        authorHandle: handle,
        authorName: author?.name,
        authorId: tweet.author_id,
        text: tweet.text,
        postedAt: tweet.created_at ? new Date(tweet.created_at) : new Date()
      };
    });
  }
  return [];
}
