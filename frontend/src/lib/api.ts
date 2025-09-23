// src/lib/api.ts
const API_BASE = (import.meta.env.VITE_API_BASE ?? "http://127.0.0.1:8000").replace(/\/$/, "");
const API_PREFIX_RAW = import.meta.env.VITE_API_PREFIX ?? "";
const API_PREFIX = API_PREFIX_RAW.replace(/^\/|\/$/g, "");
const prefix = API_PREFIX ? `/${API_PREFIX}` : "";

function url(p: string) {
  return `${API_BASE}${prefix}${p}`;
}

function authHeaders(idToken: string) {
  return { Authorization: `Bearer ${idToken}` };
}

async function handle(r: Response) {
  const text = await r.text();
  if (!r.ok) {
    console.error("[api] HTTP", r.status, "body:", text);
    const err: any = new Error(text || r.statusText);
    err.status = r.status;
    throw err;
  }
  return text ? JSON.parse(text) : null;
}

/** 驗簽：帶 id_token 打 /auth/me */
export async function getMe(idToken: string) {
  console.log("[api] calling /auth/me with id_token (head):", idToken?.slice(0, 20), "…");
  const r = await fetch(url("/auth/me"), {
    headers: { Accept: "application/json", ...authHeaders(idToken) },
  });
  return handle(r);
}

export async function presignUpload(
  idToken: string,
  input: { field: string; filename: string; contentType: string }
) {
  const r = await fetch(url("/upload/presign"), {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders(idToken) },
    body: JSON.stringify(input),
  });
  return handle(r) as Promise<{ fileId: string; key: string; post: { url: string; fields: Record<string, string> } }>;
}

export async function completeUpload(
  idToken: string,
  body: { fileId: string; key: string; field: string; originalName: string; visibility?: string }
) {
  const r = await fetch(url("/upload/complete"), {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders(idToken) },
    body: JSON.stringify(body),
  });
  return handle(r);
}

// 1) 學生清單：/upload/for-student
export async function listForStudent(idToken: string) {
  const r = await fetch(url("/upload/for-student"), { headers: authHeaders(idToken) });
  return handle(r) as Promise<{ items: any[] }>;
}


export async function listMyFiles(idToken: string) {
   const r = await fetch(url("/upload/my"), {   
    headers: { Authorization: `Bearer ${idToken}` },
  });
  const text = await r.text();
  if (!r.ok) throw new Error(text || r.statusText);
  const data = text ? JSON.parse(text) : null;
  // 兼容後端舊版（直接回陣列）與新版（{items:[...]}）
  return Array.isArray(data) ? { items: data } : data;
}

// 2) 下載連結：/upload/download-url（用 body 傳 fileId）
export async function getDownloadUrl(idToken: string, fileId: string) {
  const r = await fetch(url("/upload/download-url"), {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders(idToken) },
    body: JSON.stringify({ fileId }),
  });
  return handle(r) as Promise<{ url: string }>;
}

/** 方便測試的工具：在 Console 打 testAuth() 就能驗簽 */
export async function testAuth() {
  const idToken = sessionStorage.getItem("id_token") || localStorage.getItem("id_token");
  if (!idToken) {
    console.warn("⚠️ no id_token in storage");
    return;
  }
  try {
    const me = await getMe(idToken);
    console.log("✅ /auth/me OK", me);
  } catch (e) {
    console.error("❌ /auth/me failed", e);
  }
}
