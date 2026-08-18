"use client";

import { useEffect, useState } from "react";
import { API_BASE } from "./config";
import { getStoredCommunityId } from "./community";
import { authHeaders } from "./session";
import { useConnectedWallet } from "./useConnectedWallet";

export type ContributorClaim = {
  missionId: string;
  title: string;
  status: string;
  priority: string;
  claimedAt: string;
};

export type ContributorSubmission = {
  id: string;
  taskId: string;
  taskTitle: string;
  missionId: string;
  missionTitle: string;
  proofUrl: string;
  pointsAwarded: number;
  isVerified: boolean;
  submittedAt: string;
};

export type ContributorLink = {
  code: string;
  targetUrl: string;
  missionId: string | null;
  missionTitle: string | null;
  clicks: number;
};

export type ContributorNextPlay = {
  missionId: string;
  missionTitle: string;
  taskId: string;
  taskTitle: string;
  playId?: string | null;
};

export type ContributorProfile = {
  id: string;
  wallet: string;
  displayName?: string | null;
  communityId: string;
  points: number;
  rank: number | null;
  clicks?: number;
  claimedMissionIds: string[];
  nextPlay?: ContributorNextPlay | null;
  claims: ContributorClaim[];
  submissions: ContributorSubmission[];
  links?: ContributorLink[];
};

export function useContributorProfile() {
  const { connected, wallet, label } = useConnectedWallet();
  const [profile, setProfile] = useState<ContributorProfile | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!connected) {
      setProfile(null);
      return;
    }
    const load = async () => {
      setLoading(true);
      try {
        const res = await fetch(`${API_BASE}/me?communityId=${getStoredCommunityId()}`, { headers: authHeaders() });
        setProfile(res.ok ? await res.json() : null);
      } catch {
        setProfile(null);
      } finally {
        setLoading(false);
      }
    };
    void load();
    window.addEventListener("shillops-ops", load);
    window.addEventListener("shillops-session", load);
    window.addEventListener("shillops-community", load);
    return () => {
      window.removeEventListener("shillops-ops", load);
      window.removeEventListener("shillops-session", load);
      window.removeEventListener("shillops-community", load);
    };
  }, [connected, wallet]);

  return { profile, loading, connected, wallet, label };
}
