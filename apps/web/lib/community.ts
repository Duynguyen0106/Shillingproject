"use client";

import { COMMUNITY_ID } from "./config";

const ID_KEY = "shillops.communityId";
const META_KEY = "shillops.communityMeta";

export type StoredCommunity = {
  id: string;
  name: string;
  ticker: string;
  chainId?: string | null;
  contractAddress?: string | null;
  dexUrl?: string | null;
};

export function getStoredCommunityId(fallback = COMMUNITY_ID): string {
  if (typeof window === "undefined") return fallback;
  return localStorage.getItem(ID_KEY) || fallback;
}

export function getStoredCommunity(): StoredCommunity | null {
  if (typeof window === "undefined") return null;
  const raw = localStorage.getItem(META_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as StoredCommunity;
  } catch {
    return null;
  }
}

export function storeCommunity(community: StoredCommunity) {
  if (typeof window === "undefined") return;
  localStorage.setItem(ID_KEY, community.id);
  localStorage.setItem(META_KEY, JSON.stringify(community));
  document.cookie = `shillops.community=${encodeURIComponent(community.id)}; path=/; max-age=31536000; samesite=lax`;
  window.dispatchEvent(new Event("shillops-community"));
}
