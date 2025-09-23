// 產生 PKCE 的 code_verifier 與 code_challenge (S256)
export async function generatePKCE() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);

  const verifier = btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+/g, "");

  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
  const challenge = btoa(String.fromCharCode(...new Uint8Array(digest)))
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+/g, "");

  return { verifier, challenge };
}
