import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import App from "./App";
import Callback from "./auth/Callback";
import { getMe } from "./lib/api";

// 在開發時方便用 Console 測試驗簽：window.testAuth()
(function exposeTestAuth() {
  function parseJwt(t: string) {
    const [, p] = t.split(".");
    return JSON.parse(atob(p.replace(/-/g, "+").replace(/_/g, "/")));
  }
  (window as any).testAuth = async () => {
    const id = sessionStorage.getItem("id_token") || localStorage.getItem("id_token");
    if (!id) return console.warn("no id_token found");
    console.log("🪪 id_token (head):", id.slice(0, 20), "…");
    console.log("🔍 decoded id_token:", parseJwt(id));
    try {
      const me = await getMe(id);
      console.log("✅ /auth/me:", me);
    } catch (e) {
      console.error("❌ /auth/me failed:", e);
    }
  };
})();

//把 React App 掛載到瀏覽器
ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<App />} />
        <Route path="/callback" element={<Callback />} />
      </Routes>
    </BrowserRouter>
  </React.StrictMode>
);
