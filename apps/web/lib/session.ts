const WALLET_KEY = "shillops.wallet";
const NAME_KEY = "shillops.displayName";

export function getStoredWallet(fallback = "0xdemo"): string {
  if (typeof window === "undefined") return fallback;
  return localStorage.getItem(WALLET_KEY) || fallback;
}

export function getStoredDisplayName(fallback = "Raider"): string {
  if (typeof window === "undefined") return fallback;
  return localStorage.getItem(NAME_KEY) || fallback;
}

export function storeSession(wallet: string, displayName?: string) {
  if (typeof window === "undefined") return;
  localStorage.setItem(WALLET_KEY, wallet);
  if (displayName) localStorage.setItem(NAME_KEY, displayName);
}
