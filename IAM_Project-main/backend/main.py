from fastapi import FastAPI, Depends
from fastapi.middleware.cors import CORSMiddleware
from fastapi.openapi.utils import get_openapi
from auth import current_user  # 匯入後會載入 .env 並完成驗簽設定


app = FastAPI(title="School Files API")

# 允許前端來存取這些API
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

#uploads.py 內應該定義了一個 APIRouter，包含與檔案上傳 / 下載相關的 API。
# include_router 把這些路由掛到主 app 裡。
from uploads import router as uploads_router
app.include_router(uploads_router)



# 讓 Swagger (/docs) 出現 Authorize（Bearer/JWT）
def custom_openapi():
    if app.openapi_schema:
        return app.openapi_schema
    schema = get_openapi(title=app.title, version="1.0.0", routes=app.routes)
    schema.setdefault("components", {}).setdefault("securitySchemes", {})["bearerAuth"] = {
        "type": "http",
        "scheme": "bearer",
        "bearerFormat": "JWT",
    }
    schema["security"] = [{"bearerAuth": []}]
    app.openapi_schema = schema
    return app.openapi_schema
app.openapi = custom_openapi


@app.get("/auth/me")
def me(user=Depends(current_user)):
    """帶 id_token 測驗簽；會回 email / groups / teacherId"""
    return user
