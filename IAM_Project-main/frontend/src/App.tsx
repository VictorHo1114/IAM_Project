import React, { useEffect, useState } from "react";
import TeacherUpload from "./components/teacherUpload";
import StudentFiles from "./components/studentFiles";
import { getMe } from "./lib/api";        // 用來呼叫後端 /auth/me 驗簽
import { login, logout } from "./auth/login";  // 登入/登出 Cognito Hosted UI
import { ArrowRightOnRectangleIcon,BuildingOffice2Icon,ArrowRightEndOnRectangleIcon} from "@heroicons/react/24/outline";//引入heroicons

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
        <h2>
          <BuildingOffice2Icon style={{ marginRight: 4, width: "30px", height: "30px" ,transform: "translateY(4px)" }}/>
          School Files
        </h2>
        <p>請先登入取得使用權限</p>
        <button onClick={login}>
        <ArrowRightEndOnRectangleIcon className="h-5 w-5" />
          登入
        </button>
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
      {/* 右上帳號+登出 */}
      <div
        style={{
          position: "fixed",
          top: 24,
          right: 32,
          display: "flex",
          alignItems: "center",
          gap: 12,
          zIndex: 100,
        }}
      >
        <span style={{ fontWeight: 600, color: "#333" }}>
          {me?.username || me?.email || "使用者"}
        </span>
        <button
          onClick={logout}
          // style={{
          //   padding: "6px 18px",
          //   borderRadius: 20,
          //   border: "none",
          //   background: "linear-gradient(90deg,#ff5858,#f09819)",
          //   color: "#fff",
          //   fontWeight: 600,
          //   cursor: "pointer",
          //   boxShadow: "0 2px 8px rgba(0,0,0,0.08)",
          //   display: "flex",
          //   alignItems: "center",
          //   gap: 6,
          // }}
        >
          <ArrowRightOnRectangleIcon className="h-5 w-5" />
          登出
        </button>
      </div>

      <h2>
        <BuildingOffice2Icon style={{ marginRight: 4, width: "30px", height: "30px" ,transform: "translateY(4px)" }}/>
        School Files
      </h2>

      {/* 顯示錯誤訊息（例如 token 過期） */}
      {err && <div style={{ color: "red" }}>{err}</div>}

      {/* 顯示目前使用者資訊（方便 debug） */}
      {/* <pre style={{ background: "#111", color: "#eee", padding: 12, borderRadius: 8 }}>
        {JSON.stringify(
          {
            sub: me?.sub,
            groups,
            teacherId: me?.teacherId,
            studentId: me?.["custom:studentId"] || me?.studentId || me?.sub
          },
          null, 2
        )}
      </pre> */}

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
