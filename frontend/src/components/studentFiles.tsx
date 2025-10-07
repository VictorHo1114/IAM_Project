// components/studentFiles.tsx
import React, { useEffect, useState } from "react";
import { listForStudent, getDownloadUrl } from "../lib/api";
import { ArrowDownTrayIcon } from "@heroicons/react/24/outline";

interface FileItem {
  PK: string;
  originalName: string;
  uploadedAt?: string | number;
  field?: string;
  teacherId?: string;
  teacherName?: string;
}

export default function StudentFiles({ idToken }: { idToken: string }) {
  const [items, setItems] = useState<FileItem[]>([]);
  const [err, setErr] = useState("");
  const [activeTab, setActiveTab] = useState(0);

  useEffect(() => {
    (async () => {
      try {
        const res = await listForStudent(idToken);
        setItems(res.items || []);
      } catch (e: any) {
        setErr(e.message);
      }
    })();
  }, [idToken]);

  async function download(PK: string) {
    console.log("Downloading PK:", PK); // log PK
    try {
      const { url } = await getDownloadUrl(idToken, PK);
      window.location.href = url; // 直接跳轉下載
    } catch (err) {
      console.error("Download failed:", err);
      alert("檔案下載失敗，請確認檔案是否存在或權限是否足夠。");
    }
  }

const groups: Record<string, { name: string; items: any[] }> = {};
for (const it of items) {
  const key = it.teacherId || "unknown";
  const name = it.teacherName || it.teacherId || "未知老師";
  if (!groups[key]) groups[key] = { name, items: [] };
  groups[key].items.push(it);
}

// A→B→C 往下排；若沒 name，就用 key 排
const sections = Object.entries(groups)
  .sort(([, a], [, b]) =>
    (a.name || "").localeCompare(b.name || "", "zh-Hant", { numeric: true })
  )
  .map(([, v]) => {
    // 每組內也按時間新→舊
    v.items.sort((x, y) => {
      const ax = typeof x.uploadedAt === "string" ? x.uploadedAt : new Date((x.uploadedAt ?? 0) * 1000).toISOString();
      const ay = typeof y.uploadedAt === "string" ? y.uploadedAt : new Date((y.uploadedAt ?? 0) * 1000).toISOString();
      return ay.localeCompare(ax);
    });
    return v;
  });

  
  return (
    <div style={{ padding: 16, border: "1px solid #444", borderRadius: 12 }}>
      <h3>學生可下載檔案</h3>
      {err && <div style={{ color: "red" }}>{err}</div>}

      {/* 標籤列 */}
      <div style={{ display: "flex", gap: 24, borderBottom: "2px solid #eee", marginBottom: 16 }}>
        {sections.map((sec, idx) => (
          <div
            key={sec.name}
            onClick={() => setActiveTab(idx)}
            style={{
              cursor: "pointer",
              fontWeight: activeTab === idx ? 700 : 400,
              borderBottom: activeTab === idx ? "3px solid #222" : "3px solid transparent",
              padding: "6px 12px",
              color: activeTab === idx ? "#111" : "#888",
              transition: "all 0.2s"
            }}
          >
            {sec.name}
          </div>
        ))}
      </div>

      {/* // 內容區 */}
      {sections[activeTab] && (
        <div>
          {(() => {
            // 先依資料夾分群
            const grouped = sections[activeTab].items.reduce((acc, it) => {
              const folder = it.field || "未分類";
              if (!acc[folder]) acc[folder] = [];
              acc[folder].push(it);
              return acc;
            }, {} as Record<string, FileItem[]>); 

            // 這裡 log 出來
            console.log("老師:", sections[activeTab].name, "資料夾分類:", Object.keys(grouped));

            // 再回傳 JSX
            return Object.entries(grouped).map(([folder, files]) => {
              const fileList = files as FileItem[]; // <-- 這行解決 unknown 問題
              return (
                <div key={folder} style={{ marginBottom: 24, padding: 12, background: "#f8f8fa", borderRadius: 8 }}>
                  <div style={{ fontWeight: 600, marginBottom: 8, color: "#3a3a3a" }}>{folder}</div>
                  <ul>
                    {fileList.map((it) => {
                      const t =
                        typeof it.uploadedAt === "string"
                          ? new Date(it.uploadedAt).toLocaleString()
                          : new Date((it.uploadedAt ?? 0) * 1000).toLocaleString();
                      return (
                        <li key={it.PK} style={{ marginTop: "0.5rem", marginBottom: "0.5rem" }}>
                          {it.originalName} — {t}
                          <button onClick={() => download(it.PK)} style={{ marginLeft: 8 }}>
                            <ArrowDownTrayIcon
                              style={{ marginRight: 4, width: "12px", height: "12px", transform: "translateY(1px)" }}
                            />
                            下載
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              );
            });
          })()}
        </div>
      )}
    </div>
  );
}