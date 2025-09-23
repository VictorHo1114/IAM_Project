export type Tokens = {
  id_token: string;
  access_token: string;
  refresh_token?: string;
  token_type: "Bearer";
  expires_in: number;
};

const domain = import.meta.env.VITE_COGNITO_DOMAIN as string;        // 例: https://xxx.auth.ap-northeast-1.amazoncognito.com
const clientId = import.meta.env.VITE_COGNITO_CLIENT_ID as string;
const redirect = import.meta.env.VITE_COGNITO_REDIRECT_URI as string; // 例: http://localhost:5173/callback

export async function exchangeToken(): Promise<Tokens> {
  const params = new URLSearchParams(location.search);
  const code = params.get("code");
  const state = params.get("state");
  const expect = sessionStorage.getItem("oauth_state");
  const verifier = sessionStorage.getItem("pkce_verifier");

  if (!code) throw new Error("Missing authorization code");
  if (!verifier) throw new Error("Missing PKCE verifier (did you start from /login?)");
  if (!state || state !== expect) throw new Error("State mismatch");

  console.log("tokenExchange.debug", { domain, clientId, redirect, code, state, expect, hasVerifier: !!verifier });

  const res = await fetch(`${domain}/oauth2/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      client_id: clientId,
      code,
      redirect_uri: redirect,
      code_verifier: verifier!,
    }),
  });

  const text = await res.text();
  if (!res.ok) {
    console.error("Token endpoint error", res.status, text);
    throw new Error(`Token endpoint error ${res.status}: ${text}`);
  }

  const tokens = JSON.parse(text) as Tokens;
  console.log("[tokenExchange] raw tokens:", tokens);

  // 僅使用瀏覽器儲存，不寫 cookie
  localStorage.setItem("id_token", tokens.id_token);
  sessionStorage.setItem("debug_id_token", tokens.id_token);

  // 清掉一次性資料
  sessionStorage.removeItem("pkce_verifier");
  sessionStorage.removeItem("oauth_state");
  return tokens;
}
