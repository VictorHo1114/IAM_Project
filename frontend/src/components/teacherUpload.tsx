import React, { useState, useEffect } from "react";
import { presignUpload, completeUpload, listMyFiles } from "../lib/api";

export default function TeacherUpload({ idToken }: { idToken: string }) {
  const [file, setFile] = useState<File | null>(null);
  const [field, setField] = useState("general");
  const [msg, setMsg] = useState("");
  const [items, setItems] = useState<any[]>([]);
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

  async function doUpload() {
    if (!file) return;
    setBusy(true);
    setMsg("準備上傳…");

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

      setMsg("✅ 上傳完成！");
      setFile(null);
      await refreshList();
    } catch (e: any) {
      console.error(e);
      setMsg("❌ 上傳失敗：" + (e.message || e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ padding: 16, border: "1px solid #444", borderRadius: 12 }}>
      <h3>老師上傳</h3>
      <div>
        <label>分類 field：</label>
        <input value={field} onChange={(e) => setField(e.target.value)} />
      </div>
      <div style={{ margin: "8px 0" }}>
        <input type="file" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
      </div>
      <button onClick={doUpload} disabled={!file || busy}>
        {busy ? "上傳中…" : "上傳"}
      </button>
      <div style={{ marginTop: 8 }}>{msg}</div>

      <h4 style={{ marginTop: 16 }}>我上傳的檔案</h4>
      <ul>
        {items.map((it) => {
          // 後端有時是 ISO，有時是 epoch 秒；兩種都支援
          const t =
            typeof it.uploadedAt === "string"
              ? new Date(it.uploadedAt).toLocaleString()
              : new Date((it.uploadedAt ?? 0) * 1000).toLocaleString();
          return (
            <li key={it.fileId}>
              {it.originalName} — {t}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
