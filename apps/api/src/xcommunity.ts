export const X_COMMUNITY_TASK_TITLE = "Post in the linked X Community";
export const X_COMMUNITY_TASK_PREFIX = "x-community:";

export type XCommunityRef = {
  id: string;
  url: string;
};

export function parseXCommunityUrl(input: string): XCommunityRef | null {
  const raw = input.trim();
  if (/^\d{5,}$/.test(raw)) {
    return { id: raw, url: `https://x.com/i/communities/${raw}` };
  }
  try {
    const url = new URL(raw);
    const host = url.hostname.replace(/^www\./, "").toLowerCase();
    if (host !== "x.com" && host !== "twitter.com") return null;
    const parts = url.pathname.split("/").filter(Boolean);
    if (parts[0] === "i" && parts[1] === "communities" && /^\d+$/.test(parts[2] ?? "")) {
      const id = parts[2];
      return { id, url: `https://x.com/i/communities/${id}` };
    }
  } catch {
    return null;
  }
  return null;
}

export function xCommunityTaskDetails(communityId: string): string {
  return `${X_COMMUNITY_TASK_PREFIX}${communityId}`;
}

export function xCommunityIdFromTask(details?: string | null): string | null {
  if (!details?.startsWith(X_COMMUNITY_TASK_PREFIX)) return null;
  const id = details.slice(X_COMMUNITY_TASK_PREFIX.length);
  return /^\d+$/.test(id) ? id : null;
}

export function proofMatchesXCommunity(proofUrl: string, communityId: string): boolean {
  const parsed = parseXCommunityUrl(proofUrl);
  if (parsed?.id === communityId) return true;
  try {
    const url = new URL(proofUrl.trim());
    const host = url.hostname.replace(/^www\./, "").toLowerCase();
    if (host !== "x.com" && host !== "twitter.com") return false;
    return url.pathname.includes(`/communities/${communityId}`);
  } catch {
    return proofUrl.includes(`/i/communities/${communityId}`);
  }
}
