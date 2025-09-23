import { generatePKCE } from "../pkce";

const COGNITO_DOMAIN = import.meta.env.VITE_COGNITO_DOMAIN as string;
const CLIENT_ID = import.meta.env.VITE_COGNITO_CLIENT_ID as string;
const REDIRECT_URI = import.meta.env.VITE_COGNITO_REDIRECT_URI as string;
const SCOPE = import.meta.env.VITE_COGNITO_SCOPES as string;
const LOGOUT_REDIRECT =
  (import.meta.env.VITE_COGNITO_LOGOUT_REDIRECT as string) || window.location.origin;

export async function login() {
  
  // 產生 PKCE (Proof Key for Code Exchange) 的 verifier 和 challenge。
  const { verifier, challenge } = await generatePKCE();

  // 產生隨機的 state，存在 sessionStorage（用來避免 CSRF 攻擊）。
  const state = crypto.randomUUID();

  sessionStorage.setItem("pkce_verifier", verifier);
  sessionStorage.setItem("oauth_state", state);

  // 拼出 Cognito 的 /oauth2/authorize URL
  const url = new URL(`${COGNITO_DOMAIN}/oauth2/authorize`);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", CLIENT_ID);
  url.searchParams.set("redirect_uri", REDIRECT_URI);
  url.searchParams.set("scope", SCOPE);
  url.searchParams.set("state", state);
  url.searchParams.set("code_challenge", challenge);
  url.searchParams.set("code_challenge_method", "S256");

  // 導向 Cognito 登入頁，讓使用者輸入帳號密碼。
  window.location.assign(url.toString());
}

export function logout() {
  // 1) 清本地 token
  try {
    localStorage.removeItem("id_token");
    localStorage.removeItem("access_token");
    localStorage.removeItem("refresh_token");
    sessionStorage.removeItem("id_token");
    sessionStorage.removeItem("access_token");
    sessionStorage.removeItem("refresh_token");
  } catch {}

  // 2) 導向 Cognito /logout 清 SSO cookie（LOGOUT_REDIRECT 必須在 Sign-out URLs 內）
  const url = new URL(`${COGNITO_DOMAIN}/logout`);
  url.searchParams.set("client_id", CLIENT_ID);
  url.searchParams.set("logout_uri", LOGOUT_REDIRECT);
  window.location.assign(url.toString());
}
