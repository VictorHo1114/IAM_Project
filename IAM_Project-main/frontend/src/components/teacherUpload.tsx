import React, { useState, useEffect, useRef } from "react";
import { presignUpload, completeUpload, listMyFiles, getDownloadUrl,deleteFile } from "../lib/api";
import { ArrowDownTrayIcon,TrashIcon,ArrowUpTrayIcon,ArrowPathIcon } from "@heroicons/react/24/outline";

export default function TeacherUpload({ idToken }: { idToken: string }) {
  const [file, setFile] = useState<File | null>(null);
  const [field, setField] = useState("general");
  const [msg, setMsg] = useState("準備上傳…");
  const [items, setItems] = useState<FileItem[]>([]);
  const [busy, setBusy] = useState(false);

  async function refreshList() {
    try {
      const res = await listMyFiles(idToken);
      setItems(res.items || []);
    } catch (e: any) {
      console.error(e);
      setMsg("讀取清單失敗：" + (e.message || e));
    }
  }

  useEffect(() => {
    refreshList();
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

  async function doUpload() {
    if (!file) return;
    setBusy(true);
    setMsg("");

    try {
      // 1) presign
      const pre = await presignUpload(idToken, {
        field,
        filename: file.name,
        contentType: file.type || "application/octet-stream",
      });

      // 2) S3 表單直傳
      const form = new FormData();
      Object.entries(pre.post.fields).forEach(([k, v]) => form.append(k, v as string));
      if (!("key" in pre.post.fields)) form.append("key", pre.key);
      // 先不要 append Content-Type，避免與後端條件不一致
      form.append("file", file);

      const s3Resp = await fetch(pre.post.url, { method: "POST", body: form });
      if (!s3Resp.ok) {
        const body = await s3Resp.text();
        throw new Error(`S3 upload failed: ${s3Resp.status} ${body}`);
      }

      // 3) 通知完成
      await completeUpload(idToken, {
        fileId: pre.fileId,
        key: pre.key,
        field,
        originalName: file.name,
        visibility: "students",
      });

      setFile(null);
      if (fileInputRef.current) fileInputRef.current.value = ""; // 清空 input
      await refreshList();

      alert("✅ 上傳完成！");
      setFile(null);
      await refreshList();

      setTimeout(() => {
      setMsg("準備上傳…");
      }, 100);
      
    } catch (e: any) {
      console.error(e);
      alert("❌ 上傳失敗：" + (e.message || e));
    } finally {
      setBusy(false);
    }
  }

  // 刪除檔案
  async function onDelete(PK: string) {
    try {
      await deleteFile(idToken, PK); // <-- 這裡要傳入 idToken
      alert("刪除成功！");
      await refreshList(); // 刪除後刷新檔案清單
    } catch (err) {
      console.error(err);
      alert("刪除失敗：" + (err as any).message);
    }
  }

  interface FileItem {
    PK: string;
    originalName: string;
    uploadedAt?: string | number;
    field?: string;
    key?: string;
    visibility?: string;
  }
    // === 分群：依 field 分資料夾 ===
  const grouped = items.reduce((acc, it) => {
    const folder = it.field || "未分類";
    if (!acc[folder]) acc[folder] = [];
    acc[folder].push(it);
    return acc;
  }, {} as Record<string, FileItem[]>);

  const folders = Object.keys(grouped);
  const [activeTab, setActiveTab] = useState(0); 
  const activeFolder = folders[activeTab];
  const fileInputRef = useRef<HTMLInputElement>(null);

  return (
    <div style={{ padding: 16, border: "1px solid #444", borderRadius: 12 }}>
      <h3>老師上傳</h3>

      {/* 上傳區 */}
      <div>
        <label>分類 field：</label>
        <input value={field} onChange={(e) => setField(e.target.value)} />
      </div>
      <div style={{ margin: "8px 0" }}>
        <input
          ref={fileInputRef}
          type="file"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
        />
      </div>
      <button onClick={doUpload} disabled={!file || busy}>
        {busy ? (
          <>
            <ArrowPathIcon className="h-4 w-4" />
            上傳中…
          </>
        ) : (
          <>
            <ArrowUpTrayIcon className="h-4 w-4" />
            上傳
          </>
        )}
      </button>
      <div style={{ marginTop: 8 }}>{msg}</div>

      {/* 清單區：頁籤 + 各資料夾 */}
      <h4 style={{ marginTop: 24 }}>我上傳的檔案</h4>

      {/* 頁籤列 */}
      <div
        style={{
          display: "flex",
          gap: 24,
          borderBottom: "2px solid #eee",
          marginBottom: 16,
          marginTop: 8,
        }}
      >
        {folders.map((f, idx) => (
          <div
            key={f}
            onClick={() => setActiveTab(idx)}
            style={{
              cursor: "pointer",
              fontWeight: activeTab === idx ? 700 : 400,
              borderBottom: activeTab === idx ? "3px solid #222" : "3px solid transparent",
              padding: "6px 12px",
              color: activeTab === idx ? "#111" : "#888",
              transition: "all 0.2s",
            }}
          >
            {f}
          </div>
        ))}
      </div>

      {/* 選中資料夾內容 */}
      {activeFolder && (
        <ul>
          {grouped[activeFolder]
            .sort((a, b) => {
              const ta =
                typeof a.uploadedAt === "string"
                  ? a.uploadedAt
                  : new Date((a.uploadedAt ?? 0) * 1000).toISOString();
              const tb =
                typeof b.uploadedAt === "string"
                  ? b.uploadedAt
                  : new Date((b.uploadedAt ?? 0) * 1000).toISOString();
              return tb.localeCompare(ta); // 新的在上面
            })
            .map((it) => {
              const t =
                typeof it.uploadedAt === "string"
                  ? new Date(it.uploadedAt).toLocaleString()
                  : new Date((it.uploadedAt ?? 0) * 1000).toLocaleString();
              return (
                      <li key={it.PK} style={{ marginTop: "0.5rem", marginBottom: "0.5rem" }}>
                        {it.originalName} — {t}
                        <button
                          onClick={() => download(it.PK)}
                          style={{ marginLeft: 8}}
                        >
                          <ArrowDownTrayIcon style={{ marginRight: 4, width: "12px", height: "12px" ,transform: "translateY(1px)"}}/>
                          下載
                        </button>

                        <button
                          onClick={() => onDelete(it.PK)}
                          style={{ marginLeft: 8, color: "red" }}
                        >
                        <TrashIcon style={{ marginRight: 4, width: "12px", height: "12px",transform: "translateY(1px)" }}/>
                          刪除
                        </button>
                      </li>
                    );
            })}
        </ul>
      )}
    </div>
  );
}