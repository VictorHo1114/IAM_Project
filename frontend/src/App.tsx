import React, { useEffect, useState } from "react";
import TeacherUpload from "./components/teacherUpload";
import StudentFiles from "./components/studentFiles";
import { getMe } from "./lib/api";        // 用來呼叫後端 /auth/me 驗簽
import { login, logout } from "./auth/login";  // 登入/登出 Cognito Hosted UI

export default function App() {
  // 前端本地狀態
  const [idToken, setIdToken] = useState<string>(""); // 存放 JWT
  const [me, setMe] = useState<any>(null);            // 存放使用者資訊
  const [err, setErr] = useState<string>("");         // 錯誤訊息

  // 第一次渲染 → 嘗試從 localStorage/sessionStorage 拿出 token
  useEffect(() => {
    const t =
      localStorage.getItem("id_token") ||
      sessionStorage.getItem("id_token") ||
      "";
    setIdToken(t);
  }, []);

  // 每當 idToken 改變 → 嘗試用 token 呼叫後端 /auth/me 驗簽
  useEffect(() => {
    if (!idToken) return; // 沒 token 就不驗
    (async () => {
      try {
        const res = await getMe(idToken); // 驗簽並拿到使用者資訊
        setMe(res);
        setErr("");
      } catch (e: any) {
        console.error(e);
        setErr("Token 無效或過期，請重新登入。");
        // 驗證失敗 → 清掉 localStorage 舊 token
        localStorage.removeItem("id_token");
        sessionStorage.removeItem("id_token");
        setIdToken("");
      }
    })();
  }, [idToken]);

  // 如果還沒有登入 (沒有 token)
  if (!idToken) {
    return (
      <div style={{ padding: 24 }}>
        <h2>School Files</h2>
        <p>請先登入取得 id_token。</p>
        <button onClick={login}>登入（Cognito Hosted UI）</button>
      </div>
    );
  }

  // 拿出群組與角色資訊
  const groups: string[] = me?.["cognito:groups"] || me?.groups || [];
  const hasTeacherId = !!(me?.teacherId || me?.["custom:teacherId"]);
  const isTeacher = groups.includes("Teacher") || hasTeacherId; 
  // ↑ 判斷是否老師（放寬條件：有 teacherId 也算）
  const isStudent = groups.includes("Student");
  const isAdmin = groups.includes("Admin");

  // 已登入後的畫面
  return (
    <div style={{ padding: 24 }}>
      <h2>School Files</h2>

      {/* 登出按鈕 */}
      <div style={{ marginBottom: 12 }}>
        <button onClick={logout}>登出</button>
      </div>

      {/* 顯示錯誤訊息（例如 token 過期） */}
      {err && <div style={{ color: "red" }}>{err}</div>}

      {/* 顯示目前使用者資訊（方便 debug） */}
      <pre style={{ background: "#111", color: "#eee", padding: 12, borderRadius: 8 }}>
        {JSON.stringify(
          {
            sub: me?.sub,
            groups,
            teacherId: me?.teacherId,
            studentId: me?.["custom:studentId"] || me?.studentId || me?.sub
          },
          null, 2
        )}
      </pre>

      {/* 如果是老師或管理員 → 顯示上傳功能 */}
      {(isTeacher || isAdmin) && <TeacherUpload idToken={idToken} />}
      
      {/* 如果是學生或管理員 → 顯示檔案清單 */}
      {(isStudent || isAdmin) && (
        <div style={{ marginTop: 16 }}>
          <StudentFiles idToken={idToken} />
        </div>
      )}
    </div>
  );
}
