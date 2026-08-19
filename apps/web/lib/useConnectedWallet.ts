"use client";

import { useEffect, useState } from "react";
import { getStoredWallet, getStoredWalletLabel } from "./session";

export function useConnectedWallet() {
  const [wallet, setWallet] = useState<string | null>(null);
  const [label, setLabel] = useState<string | null>(null);

  useEffect(() => {
    const sync = () => {
      setWallet(getStoredWallet());
      setLabel(getStoredWalletLabel());
    };
    sync();
    window.addEventListener("shillops-session", sync);
    return () => window.removeEventListener("shillops-session", sync);
  }, []);

  return { wallet, label, connected: Boolean(wallet) };
}
