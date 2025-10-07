# uploads.py
import os
import uuid
import time
from datetime import datetime, timezone
import boto3
from fastapi import APIRouter, Depends, HTTPException,Body
from pydantic import BaseModel
from auth import current_user  # 直接沿用你的驗簽與使用者解析

router = APIRouter(prefix="/upload", tags=["upload"])

# ---- 環境變數 ----
REGION = os.environ["AWS_REGION"]                   # 例：ap-southeast-2
S3_BUCKET = os.environ["S3_BUCKET"]                 # 例：iam-demo-teacher-files-xxx
DDB_TABLE = os.environ.get("DDB_FILES_TABLE", "Files")

# ---- AWS Clients ----
s3 = boto3.client("s3", region_name=REGION)
ddb = boto3.resource("dynamodb", region_name=REGION)
tbl_files = ddb.Table(DDB_TABLE)


# ======= 產生上傳憑證（前端直傳 S3 / 使用 Presigned POST）=======
class PresignReq(BaseModel):
    field: str          # 類別/資料夾（如 notes / homework）
    filename: str
    contentType: str    # 例：application/pdf, image/png


@router.post("/presign")
def presign_upload(body: PresignReq, user=Depends(current_user)):
    groups = set(user.get("groups", []))
    if "Teacher" not in groups and "Admin" not in groups:
        raise HTTPException(status_code=403, detail="Only Teacher/Admin can upload")

    # 優先用 token 的 teacherId（你在 auth.current_user 有回傳）：
    teacher_id = user.get("teacherId") or user.get("sub")

    file_id = str(uuid.uuid4()) #產生全球唯一識別碼（UUID v4），確保不會檔名衝突。
    key_prefix = f"teachers/{teacher_id}/{body.field}/{file_id}_" #存進S3的檔案格式
    key = f"{key_prefix}{body.filename}"

    # Presigned POST 的條件（先放寬，之後再收斂）
    fields = {} #連同檔案一起 POST 給 S3 的 key-value 表單欄位
    conditions = [
        ["starts-with", "$key", key_prefix],
        ["content-length-range", 1, 20 * 1024 * 1024],
    ]

    presigned_post = s3.generate_presigned_post(
        Bucket=S3_BUCKET,
        Key=key,
        Fields=fields,
        Conditions=conditions,
        ExpiresIn=600,  # 10 分鐘有效
    )

    #以下Metadata的概念用於即時看到上傳資料，可用於之後UI/UX優化
    # teacher_name = user.get("name") or user.get("custom:teacherName") or f"Teacher {teacher_id}"
    # now_iso = datetime.now(timezone.utc).isoformat()
    # tbl_files.put_item(Item={
    #     "PK": f"FILE#{file_id}",
    #     "SK": "META",
    #     "fileId": file_id,
    #     "teacherId": teacher_id,
    #     "teacherName": teacher_name,   # ← 新增
    #     "field": body.field,
    #     "s3Key": key,
    #     "originalName": body.filename,
    #     "contentType": body.contentType,
    #     "uploadedAt": now_iso,
    #     "visibility": "students",              # 你之後可改成 teacher-only / public 等
    #     "GSI1PK": f"TEACHER#{teacher_id}",     # 供老師列檔的 GSI
    #     "GSI1SK": now_iso,
    #     "downloadCount": 0,
    # })

    return {"fileId": file_id, "key": key, "post": presigned_post}


# ======= 上傳完成後補寫/更新（可由前端在 S3 成功後呼叫）=======
class CompleteReq(BaseModel):
    fileId: str
    key: str
    field: str
    originalName: str
    visibility: str = "students"


@router.post("/complete")
def complete_upload(body: CompleteReq, user=Depends(current_user)):
    groups = set(user.get("groups", []))
    if "Teacher" not in groups and "Admin" not in groups:
        raise HTTPException(status_code=403, detail="Only Teacher/Admin can complete")

    teacher_id = user.get("teacherId") or user.get("sub")
    now_iso = datetime.now(timezone.utc).isoformat()

    # 若 /presign 已 put_item，這裡就 update；否則直接 put。
    teacher_name = user.get("name") or user.get("custom:teacherName") or f"Teacher {teacher_id}"
    tbl_files.update_item(
        Key={"PK": f"FILE#{body.fileId}", "SK": "META"},
        UpdateExpression=(
            # "SET teacherId=:t, teacherName=:tn, "   # ← 加上這行欄位
            "SET teacherId=:t, field=:f, s3Key=:k, originalName=:n, "
            "uploadedAt=:u, visibility=:v, GSI1PK=:g1, GSI1SK=:g2 "
        ),
        ExpressionAttributeValues={
            ":t": teacher_id,
            # ":tn": teacher_name,  
            ":f": body.field,
            ":k": body.key,
            ":n": body.originalName,
            ":u": now_iso,
            ":v": body.visibility,
            ":g1": f"TEACHER#{teacher_id}",
            ":g2": now_iso,
        }
    )

    return {"ok": True, "file": {
        "fileId": body.fileId, "teacherId": teacher_id, "field": body.field,
        "s3Key": body.key, "originalName": body.originalName,
        "uploadedAt": now_iso, "visibility": body.visibility
    }}

# ======= 列出自己的上傳檔案（老師/管理員可用）=======
@router.get("/my")
@router.post("/my")  # 允許 POST 也可查，避免前端 method 誤用造成 404
def list_my_files(user=Depends(current_user)):
    groups = user.get("groups", [])
    if "Teacher" not in groups and "Admin" not in groups:
        raise HTTPException(403, "Only Teacher/Admin can list own files")

    teacher_id = user.get("teacherId") or user["sub"]
    try:
        # 優先用索引（推薦）
        resp = tbl_files.query(
            IndexName="GSI1PK-GSI1SK-index",
            KeyConditionExpression="GSI1PK = :g",
            ExpressionAttributeValues={":g": f"TEACHER#{teacher_id}"}
        )
        items = resp.get("Items", [])
    except ClientError as e:
        if e.response.get("Error", {}).get("Code") == "ValidationException" and \
           "specified index" in e.response.get("Error", {}).get("Message", ""):
            # Hotfix：沒建 GSI 時退回掃描（僅示範用）
            scan = tbl_files.scan(
                FilterExpression=Attr("teacherId").eq(teacher_id)
            )
            items = scan.get("Items", [])
            # 可選：按時間排序（uploadedAt 是 ISO 字串，字典序=時間序）
            items.sort(key=lambda x: x.get("uploadedAt",""), reverse=True)
        else:
            raise

    return {"items": items}

# ======= 取得下載連結（所有角色可用，但學生只能下載老師的檔案）=======
from pydantic import BaseModel
class DownloadReq(BaseModel):
    fileId: str

@router.post("/download-url")
def get_download_url(body: dict, user=Depends(current_user)):
    pk = body.get("PK")
    if not pk:
        raise HTTPException(status_code=422, detail="PK is required")

    groups = set(user.get("groups", []))
    role = "Admin" if "Admin" in groups else ("Teacher" if "Teacher" in groups else "Student")

    r = tbl_files.get_item(Key={"PK": pk, "SK": "META"})
    item = r.get("Item")
    if not item:
        raise HTTPException(404, "File not found")

    teacher_id = item["teacherId"]
    if role == "Teacher" and user.get("teacherId") != teacher_id:
        raise HTTPException(403, "Forbidden")

    url = s3.generate_presigned_url(
        ClientMethod="get_object",
        Params={"Bucket": S3_BUCKET, "Key": item["s3Key"]},
        ExpiresIn=600
    )
    return {"url": url}


# ======= 學生端：列出可下載的檔案（visibility=students）=======
from boto3.dynamodb.conditions import Attr

@router.get("/for-student")
def list_for_student(user=Depends(current_user)):
    groups = set(user.get("groups", []))
    if "Student" not in groups and "Admin" not in groups:
        raise HTTPException(403, "Only Student/Admin can list student files")

    # 簡單做法：掃描 visibility=students（之後可優化成 GSI）
    scan = tbl_files.scan(
        FilterExpression=Attr("visibility").eq("students")
    )
    items = scan.get("Items", [])
    # 依時間新到舊
    items.sort(key=lambda x: x.get("uploadedAt", ""), reverse=True)
    return {"items": items}

# ======= 老師端：刪除檔案 =======
class DeleteReq(BaseModel):
    PK: str

@router.post("/delete")
def delete_file(req: DeleteReq, user=Depends(current_user)):
    PK = req.PK
    if not PK:
        raise HTTPException(422, "PK is required")

    groups = set(user.get("groups", []))
    if "Teacher" not in groups and "Admin" not in groups:
        raise HTTPException(403, "Only Teacher/Admin can delete files")

    # 取得檔案紀錄
    r = tbl_files.get_item(Key={"PK": PK, "SK": "META"})
    item = r.get("Item")
    if not item:
        raise HTTPException(404, "File not found")

    # 驗證擁有者
    teacher_id = user.get("teacherId") or user.get("sub")
    if item["teacherId"] != teacher_id and "Admin" not in groups:
        raise HTTPException(403, "You cannot delete this file")
    
    # 刪除 S3
    try:
        s3.delete_object(Bucket=S3_BUCKET, Key=item["s3Key"])
    except s3.exceptions.ClientError as e:
        code = e.response["Error"]["Code"]
        if code == "AccessDenied":
            raise HTTPException(403, detail=f"S3 delete failed: AccessDenied")
        else:
            raise HTTPException(400, detail=f"S3 delete failed: {str(e)}")
    except Exception as e:
        raise HTTPException(400, detail=f"S3 delete failed: {str(e)}")

    # 刪除 DynamoDB 紀錄
    tbl_files.delete_item(Key={"PK": PK, "SK": "META"})

    return {"success": True, "PK": PK}