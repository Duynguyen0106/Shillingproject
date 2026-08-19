export type ShillActor = {
  wallet: string;
  displayName?: string | null;
};

export type ShillRow = {
  id?: string;
  feedPostId: string;
  userId: string;
  reshill?: boolean;
  createdAt: Date | string;
  user?: ShillActor | null;
  feedPost?: {
    id: string;
    url: string;
    authorHandle: string;
    text?: string;
    kind?: string;
  } | null;
};

export type ShillHistoryItem = {
  id?: string;
  feedPostId: string;
  at: string;
  reshill: boolean;
  wallet: string;
  displayName?: string | null;
  you: boolean;
};

export function isoDate(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

export function attachShillState<T extends { id: string }>(
  posts: T[],
  shills: ShillRow[],
  viewerUserId?: string | null
) {
  const byPost = new Map<string, ShillRow[]>();
  for (const shill of shills) {
    const list = byPost.get(shill.feedPostId) ?? [];
    list.push(shill);
    byPost.set(shill.feedPostId, list);
  }
  return posts.map((post) => {
    const rows = byPost.get(post.id) ?? [];
    const yours = viewerUserId ? rows.filter((row) => row.userId === viewerUserId) : [];
    const raiders = new Set(rows.map((row) => row.userId));
    return {
      ...post,
      shillCount: rows.length,
      raiderCount: raiders.size,
      youShilled: yours.length > 0,
      youShillCount: yours.length,
      youLastShilledAt: yours[0] ? isoDate(yours[0].createdAt) : null,
      lastShilledAt: rows[0] ? isoDate(rows[0].createdAt) : null,
      recentShills: rows.slice(0, 4).map((row) => ({
        wallet: row.user?.wallet ?? "",
        displayName: row.user?.displayName ?? null,
        reshill: Boolean(row.reshill),
        at: isoDate(row.createdAt),
        you: Boolean(viewerUserId && row.userId === viewerUserId)
      }))
    };
  });
}

export function serializeShillHistory(
  shills: Array<ShillRow & { id?: string }>,
  viewerUserId?: string | null
): ShillHistoryItem[] {
  return shills.map((shill) => ({
    id: shill.id,
    feedPostId: shill.feedPostId,
    at: isoDate(shill.createdAt),
    reshill: Boolean(shill.reshill),
    wallet: shill.user?.wallet ?? "",
    displayName: shill.user?.displayName ?? null,
    you: Boolean(viewerUserId && shill.userId === viewerUserId)
  }));
}
