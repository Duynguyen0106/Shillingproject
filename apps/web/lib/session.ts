// SECURITY NOTE: The session token is currently stored in localStorage.
// For production hardening, migrate to HttpOnly + Secure + SameSite=Strict cookies
// set by the API on login. This eliminates XSS-based token theft.
// Until then, a strong Content-Security-Policy (set via helmet in the API) reduces XSS risk.
const WALLET_KEY = "shillops.wallet";
const NAME_KEY = "shillops.displayName";
const TOKEN_KEY = "shillops.token";
const WALLET_LABEL_KEY = "shillops.walletLabel";

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

export function getStoredWalletLabel(): string {
  if (typeof window === "undefined") return "";
  return localStorage.getItem(WALLET_LABEL_KEY) || "";
}

export function storeSession(wallet: string, displayName?: string, token?: string, walletLabel?: string) {
  if (typeof window === "undefined") return;
  localStorage.setItem(WALLET_KEY, wallet);
  if (displayName) localStorage.setItem(NAME_KEY, displayName);
  if (token) localStorage.setItem(TOKEN_KEY, token);
  if (walletLabel) localStorage.setItem(WALLET_LABEL_KEY, walletLabel);
  window.dispatchEvent(new Event("shillops-session"));
}

export function clearSession() {
  if (typeof window === "undefined") return;
  localStorage.removeItem(WALLET_KEY);
  localStorage.removeItem(NAME_KEY);
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(WALLET_LABEL_KEY);
  window.dispatchEvent(new Event("shillops-session"));
}

export function shortAddress(wallet: string): string {
  if (wallet.length < 10) return wallet || "Connect wallet";
  return `${wallet.slice(0, 6)}…${wallet.slice(-4)}`;
}

export function authHeaders(): Record<string, string> {
  const token = getStoredToken();
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (token) headers.authorization = `Bearer ${token}`;
  return headers;
}

export function notifyOps() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event("shillops-ops"));
}
