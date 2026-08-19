"use client";

import { useEffect, useState } from "react";
import { API_BASE } from "../lib/config";

interface PriceData {
  priceUsd: string;
  priceChange24h: number;
  volume24h: string;
  liquidity: string;
  fdv: string;
  dexUrl: string;
}

export default function TokenPriceCard({ contractAddress, chainId, ticker, dexUrl }: {
  contractAddress?: string | null;
  chainId?: string | null;
  ticker: string;
  dexUrl?: string | null;
}) {
  const [data, setData] = useState<PriceData | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!contractAddress) return;
    setLoading(true);
    // Proxy through our API to avoid CORS issues
    fetch(`${API_BASE}/price?contract=${contractAddress}&chain=${chainId || "solana"}`)
      .then((r) => r.ok ? r.json() : null)
      .then((d) => { if (d) setData(d); })
      .catch(() => null)
      .finally(() => setLoading(false));
  }, [contractAddress, chainId]);

  if (!contractAddress) return null;
  if (loading) return <div className="card price-card skeleton"><div className="muted">Loading price…</div></div>;
  if (!data) return null;

  const up = (data.priceChange24h ?? 0) >= 0;

  return (
    <div className="card price-card">
      <div className="price-header">
        <span className="price-ticker">${ticker}</span>
        <a href={data.dexUrl || dexUrl || "#"} target="_blank" rel="noreferrer" className="price-dex-link">
          DexScreener ↗
        </a>
      </div>
      <div className="price-row">
        <div className="price-main">
          <span className="price-usd">${parseFloat(data.priceUsd).toFixed(8)}</span>
          <span className={`price-change ${up ? "up" : "down"}`}>
            {up ? "▲" : "▼"} {Math.abs(data.priceChange24h).toFixed(2)}%
          </span>
        </div>
        <div className="price-stats">
          <span className="price-stat">
            <span className="muted">Vol 24h</span>
            <strong>{formatCompact(parseFloat(data.volume24h))}</strong>
          </span>
          <span className="price-stat">
            <span className="muted">Liq</span>
            <strong>{formatCompact(parseFloat(data.liquidity))}</strong>
          </span>
          <span className="price-stat">
            <span className="muted">FDV</span>
            <strong>{formatCompact(parseFloat(data.fdv))}</strong>
          </span>
        </div>
      </div>
    </div>
  );
}

function formatCompact(n: number): string {
  if (!n || isNaN(n)) return "—";
  if (n >= 1_000_000_000) return `$${(n / 1_000_000_000).toFixed(1)}B`;
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(1)}K`;
  return `$${n.toFixed(0)}`;
}
