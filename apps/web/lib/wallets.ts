export type FeaturedWallet = {
  id: string;
  name: string;
  hint: string;
  rdnsHints: string[];
  installUrl: string;
};

export const FEATURED_WALLETS: FeaturedWallet[] = [
  {
    id: "metamask",
    name: "MetaMask",
    hint: "Browser extension + mobile",
    rdnsHints: ["io.metamask", "io.metamask.flask"],
    installUrl: "https://metamask.io/download/",
  },
  {
    id: "phantom",
    name: "Phantom",
    hint: "Ethereum + Solana",
    rdnsHints: ["app.phantom"],
    installUrl: "https://phantom.app/download",
  },
  {
    id: "trust",
    name: "Trust Wallet",
    hint: "Mobile + extension",
    rdnsHints: ["com.trustwallet.app"],
    installUrl: "https://trustwallet.com/download",
  },
  {
    id: "coinbase",
    name: "Coinbase Wallet",
    hint: "Browser + Smart Wallet",
    rdnsHints: ["com.coinbase.wallet"],
    installUrl: "https://www.coinbase.com/wallet",
  },
  {
    id: "rabby",
    name: "Rabby",
    hint: "DeFi-focused extension",
    rdnsHints: ["io.rabby"],
    installUrl: "https://rabby.io/",
  },
  {
    id: "okx",
    name: "OKX Wallet",
    hint: "Exchange wallet",
    rdnsHints: ["com.okex.wallet"],
    installUrl: "https://www.okx.com/web3",
  },
];

export function matchFeatured(rdns?: string, name?: string) {
  const hay = `${rdns ?? ""} ${name ?? ""}`.toLowerCase();
  return FEATURED_WALLETS.find(
    (wallet) =>
      wallet.rdnsHints.some((hint) => hay.includes(hint.toLowerCase())) ||
      hay.includes(wallet.name.toLowerCase()),
  );
}
