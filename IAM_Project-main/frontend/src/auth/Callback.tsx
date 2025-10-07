import { useEffect, useRef } from "react";
import { exchangeToken } from "./tokenExchange";

export default function Callback() {
  const ranRef = useRef(false);

  useEffect(() => {
    if (ranRef.current) return;
    ranRef.current = true;

    (async () => {
      try {
        const tokens = await exchangeToken();  //啟動 tokenExchange
        
        // 會拿到 id_token 和 access_token。額外存一份到 sessionStorage，方便你在 Console 查
        sessionStorage.setItem("id_token", tokens.id_token);
        console.log("[Callback] Saved id_token:", tokens.id_token.substring(0, 50) + "...");

        window.location.replace("/");
      } catch (e: any) {
        if (localStorage.getItem("id_token") && String(e?.message).includes("invalid_grant")) {
          window.location.replace("/");
          return;
        }
        console.error(e);
        alert("登入交換失敗：" + (e?.message || ""));
      }
    })();
  }, []);

  return <div>Signing in…</div>;
}
