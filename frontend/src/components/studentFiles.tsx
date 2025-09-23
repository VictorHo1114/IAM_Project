// components/studentFiles.tsx
import React, { useEffect, useState } from "react";
import { listForStudent, getDownloadUrl } from "../lib/api";

export default function StudentFiles({ idToken }: { idToken: string }) {
  const [items, setItems] = useState<any[]>([]);
  const [err, setErr] = useState("");

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

  async function download(fileId: string) {
    const { url } = await getDownloadUrl(idToken, fileId);
    window.location.href = url;
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

      {sections.map(sec => (
        <div key={sec.name} style={{ marginTop: 12 }}>
          <h4>{sec.name}</h4>
          <ul>
            {sec.items.map(it => {
              const t =
                typeof it.uploadedAt === "string"
                  ? new Date(it.uploadedAt).toLocaleString()
                  : new Date((it.uploadedAt ?? 0) * 1000).toLocaleString();
              return (
                <li key={it.fileId}>
                  {it.originalName} — {t}
                  <button onClick={() => download(it.fileId)} style={{ marginLeft: 8 }}>
                    下載
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </div>
  );
}
