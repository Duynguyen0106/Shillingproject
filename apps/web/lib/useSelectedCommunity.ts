"use client";

import { useEffect, useState } from "react";
import { getStoredCommunity, getStoredCommunityId, type StoredCommunity } from "./community";
import { COMMUNITY_ID } from "./config";

export function useSelectedCommunity() {
  const [communityId, setCommunityId] = useState(COMMUNITY_ID);
  const [community, setCommunity] = useState<StoredCommunity | null>(null);

  useEffect(() => {
    const sync = () => {
      setCommunityId(getStoredCommunityId());
      setCommunity(getStoredCommunity());
    };
    sync();
    window.addEventListener("shillops-community", sync);
    return () => window.removeEventListener("shillops-community", sync);
  }, []);

  return { communityId, community };
}
