const WALLET_KEY = "shillops.wallet";
const NAME_KEY = "shillops.displayName";
const TOKEN_KEY = "shillops.token";

export function getStoredWallet(fallback = ""): string {
  if (typeof window === "undefined") return fallback;
  return localStorage.getItem(WALLET_KEY) || fallback;
}

export function getStoredDisplayName(fallback = "Raider"): string {
  if (typeof window === "undefined") return fallback;
  return localStorage.getItem(NAME_KEY) || fallback;
}

export function getStoredToken(): string {
  if (typeof window === "undefined") return "";
  return localStorage.getItem(TOKEN_KEY) || "";
}

export function storeSession(wallet: string, displayName?: string, token?: string) {
  if (typeof window === "undefined") return;
  localStorage.setItem(WALLET_KEY, wallet);
  if (displayName) localStorage.setItem(NAME_KEY, displayName);
  if (token) localStorage.setItem(TOKEN_KEY, token);
  window.dispatchEvent(new Event("shillops-session"));
}

export function clearSession() {
  if (typeof window === "undefined") return;
  localStorage.removeItem(WALLET_KEY);
  localStorage.removeItem(NAME_KEY);
  localStorage.removeItem(TOKEN_KEY);
  window.dispatchEvent(new Event("shillops-session"));
}

export function shortAddress(wallet: string): string {
  if (wallet.length < 10) return wallet || "Connect wallet";
  return `${wallet.slice(0, 6)}…${wallet.slice(-4)}`;
}
