"use client";

import { useConnectedWallet } from "../lib/useConnectedWallet";

export default function YouBadge({ wallet }: { wallet: string }) {
  const { wallet: mine } = useConnectedWallet();
  if (!mine || mine.toLowerCase() !== wallet.toLowerCase()) return null;
  return <span className="badge high">You</span>;
}
