export type FeedProvider = "twitterapi.io" | "x" | "none";

export type NormalizedPost = {
  id: string;
  url: string;
  authorHandle: string;
  authorName?: string;
  authorId?: string;
  authorFollowers?: number;
  text: string;
  postedAt: Date;
  likeCount?: number;
  replyCount?: number;
  retweetCount?: number;
  quoteCount?: number;
  viewCount?: number;
};

export type NormalizedKol = {
  handle: string;
  displayName?: string;
  xUserId?: string;
  bio?: string;
  profileImageUrl?: string;
  followers?: number;
  following?: number;
  statusesCount?: number;
  verified?: boolean;
};

export type FeedFilters = {
  handle?: string | null;
  q?: string | null;
  kind?: "KOL_POST" | "MENTION" | null;
  minFollowers?: number;
  minEngagement?: number;
  sort?: "new" | "hot";
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

function intVal(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? Math.max(0, Math.floor(n)) : 0;
}

export function postHeat(post: {
  likeCount?: number | null;
  replyCount?: number | null;
  retweetCount?: number | null;
  quoteCount?: number | null;
}): number {
  return (post.likeCount ?? 0) + (post.replyCount ?? 0) + (post.retweetCount ?? 0) + (post.quoteCount ?? 0);
}

export function applyFeedFilters<T extends {
  authorHandle: string;
  kind: string;
  authorFollowers?: number | null;
  likeCount?: number | null;
  replyCount?: number | null;
  retweetCount?: number | null;
  quoteCount?: number | null;
  postedAt: Date | string;
}>(posts: T[], filters: FeedFilters = {}): T[] {
  const handle = filters.handle?.replace(/^@/, "").toLowerCase() || null;
  const next = posts.filter((post) => {
    if (handle && post.authorHandle.toLowerCase() !== handle) return false;
    if (filters.kind && post.kind !== filters.kind) return false;
    if ((filters.minFollowers ?? 0) > 0 && (post.authorFollowers ?? 0) < (filters.minFollowers ?? 0)) return false;
    if ((filters.minEngagement ?? 0) > 0 && postHeat(post) < (filters.minEngagement ?? 0)) return false;
    return true;
  });
  if (filters.sort === "hot") {
    return [...next].sort((a, b) => {
      const heat = postHeat(b) - postHeat(a);
      if (heat !== 0) return heat;
      return new Date(b.postedAt).getTime() - new Date(a.postedAt).getTime();
    });
  }
  return next;
}

export function attachKolStats<
  K extends { id: string; handle: string },
  P extends {
    authorHandle: string;
    kolWatchId?: string | null;
    likeCount?: number | null;
    replyCount?: number | null;
    retweetCount?: number | null;
    quoteCount?: number | null;
    postedAt: Date | string;
  }
>(kols: K[], posts: P[]): Array<K & { stats: { posts: number; heat: number; lastHeat: number; lastPostedAt: Date | string | null } }> {
  return kols.map((kol) => {
    const theirs = posts.filter(
      (post) => post.kolWatchId === kol.id || post.authorHandle.toLowerCase() === kol.handle.toLowerCase()
    );
    const latest = [...theirs].sort((a, b) => new Date(b.postedAt).getTime() - new Date(a.postedAt).getTime())[0];
    return {
      ...kol,
      stats: {
        posts: theirs.length,
        heat: theirs.reduce((sum, post) => sum + postHeat(post), 0),
        lastHeat: latest ? postHeat(latest) : 0,
        lastPostedAt: latest?.postedAt ?? null
      }
    };
  });
}

export function applyKolFilters<
  T extends { handle: string; displayName?: string | null; followers?: number | null; stats?: { heat?: number } }
>(kols: T[], filters: FeedFilters = {}): T[] {
  const q = filters.q?.replace(/^@/, "").toLowerCase() || null;
  return kols.filter((kol) => {
    if (q && !kol.handle.toLowerCase().includes(q) && !(kol.displayName || "").toLowerCase().includes(q)) return false;
    if ((filters.minFollowers ?? 0) > 0 && (kol.followers ?? 0) < (filters.minFollowers ?? 0)) return false;
    if ((filters.minEngagement ?? 0) > 0 && (kol.stats?.heat ?? 0) < (filters.minEngagement ?? 0)) return false;
    return true;
  });
}

export function normalizeKolProfile(raw: Record<string, unknown>, fallbackHandle?: string): NormalizedKol | null {
  const handle = parseXHandle(String(raw.userName ?? raw.username ?? raw.screen_name ?? fallbackHandle ?? ""));
  if (!handle) return null;
  const metrics = (raw.public_metrics && typeof raw.public_metrics === "object" ? raw.public_metrics : {}) as Record<string, unknown>;
  return {
    handle,
    displayName: typeof raw.name === "string" ? raw.name : undefined,
    xUserId: typeof raw.id === "string" ? raw.id : undefined,
    bio: typeof raw.description === "string" ? raw.description.slice(0, 500) : undefined,
    profileImageUrl: typeof raw.profilePicture === "string"
      ? raw.profilePicture
      : typeof raw.profile_image_url === "string"
        ? raw.profile_image_url
        : undefined,
    followers: intVal(raw.followers ?? metrics.followers_count),
    following: intVal(raw.following ?? metrics.following_count),
    statusesCount: intVal(raw.statusesCount ?? metrics.tweet_count),
    verified: Boolean(raw.isBlueVerified ?? raw.verified)
  };
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
  const metrics = (raw.public_metrics && typeof raw.public_metrics === "object" ? raw.public_metrics : {}) as Record<string, unknown>;
  const authorMetrics = (author?.public_metrics && typeof author.public_metrics === "object" ? author.public_metrics : {}) as Record<string, unknown>;
  return {
    id,
    url,
    authorHandle: handle.toLowerCase(),
    authorName: typeof author?.name === "string" ? author.name : undefined,
    authorId: typeof author?.id === "string" ? author.id : undefined,
    authorFollowers: intVal(author?.followers ?? authorMetrics.followers_count),
    text,
    postedAt: Number.isNaN(postedAt.getTime()) ? new Date() : postedAt,
    likeCount: intVal(raw.likeCount ?? metrics.like_count),
    replyCount: intVal(raw.replyCount ?? metrics.reply_count),
    retweetCount: intVal(raw.retweetCount ?? metrics.retweet_count),
    quoteCount: intVal(raw.quoteCount ?? metrics.quote_count),
    viewCount: intVal(raw.viewCount ?? metrics.impression_count)
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

export async function fetchUserProfile(handle: string): Promise<NormalizedKol | null> {
  const provider = configuredFeedProvider();
  if (provider === "twitterapi.io") {
    const body = await getJson(
      `https://api.twitterapi.io/twitter/user/info?userName=${encodeURIComponent(handle)}`,
      { "X-API-Key": process.env.TWITTERAPI_IO_KEY as string }
    );
    const record = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
    const raw = (record.data && typeof record.data === "object" ? record.data : record) as Record<string, unknown>;
    return normalizeKolProfile(raw, handle);
  }
  if (provider === "x") {
    const body = await getJson(
      `https://api.twitter.com/2/users/by/username/${encodeURIComponent(handle)}?user.fields=public_metrics,description,profile_image_url,verified,verified_type`,
      { Authorization: `Bearer ${process.env.X_BEARER_TOKEN}` }
    ) as { data?: Record<string, unknown> };
    return body.data ? normalizeKolProfile(body.data, handle) : null;
  }
  return null;
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
      `https://api.twitter.com/2/users/by/username/${encodeURIComponent(handle)}?user.fields=public_metrics,name`,
      { Authorization: `Bearer ${process.env.X_BEARER_TOKEN}` }
    ) as { data?: { id: string; name?: string; username?: string; public_metrics?: { followers_count?: number } } };
    const userId = userRes.data?.id;
    if (!userId) return [];
    const tweets = await getJson(
      `https://api.twitter.com/2/users/${userId}/tweets?max_results=10&tweet.fields=created_at,public_metrics&exclude=replies,retweets`,
      { Authorization: `Bearer ${process.env.X_BEARER_TOKEN}` }
    ) as { data?: { id: string; text: string; created_at?: string; public_metrics?: Record<string, number> }[] };
    return (tweets.data ?? []).map((tweet) => ({
      id: tweet.id,
      url: xStatus(handle, tweet.id),
      authorHandle: handle,
      authorName: userRes.data?.name,
      authorId: userId,
      authorFollowers: intVal(userRes.data?.public_metrics?.followers_count),
      text: tweet.text,
      postedAt: tweet.created_at ? new Date(tweet.created_at) : new Date(),
      likeCount: intVal(tweet.public_metrics?.like_count),
      replyCount: intVal(tweet.public_metrics?.reply_count),
      retweetCount: intVal(tweet.public_metrics?.retweet_count),
      quoteCount: intVal(tweet.public_metrics?.quote_count),
      viewCount: intVal(tweet.public_metrics?.impression_count)
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
      `https://api.twitter.com/2/tweets/search/recent?query=${encodeURIComponent(query)}&max_results=20&tweet.fields=created_at,author_id,public_metrics&expansions=author_id&user.fields=username,name,public_metrics`,
      { Authorization: `Bearer ${process.env.X_BEARER_TOKEN}` }
    ) as {
      data?: { id: string; text: string; created_at?: string; author_id?: string; public_metrics?: Record<string, number> }[];
      includes?: { users?: { id: string; username: string; name?: string; public_metrics?: { followers_count?: number } }[] };
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
        authorFollowers: intVal(author?.public_metrics?.followers_count),
        text: tweet.text,
        postedAt: tweet.created_at ? new Date(tweet.created_at) : new Date(),
        likeCount: intVal(tweet.public_metrics?.like_count),
        replyCount: intVal(tweet.public_metrics?.reply_count),
        retweetCount: intVal(tweet.public_metrics?.retweet_count),
        quoteCount: intVal(tweet.public_metrics?.quote_count),
        viewCount: intVal(tweet.public_metrics?.impression_count)
      };
    });
  }
  return [];
}
