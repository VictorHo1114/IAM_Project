import os
import logging
from fastapi import Depends, HTTPException, Request, status
from dotenv import load_dotenv
import jwt
from jwt import PyJWKClient, ExpiredSignatureError, InvalidAudienceError, InvalidIssuerError

# 設置日誌
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# 載入 .env（需包含 AWS_REGION / COGNITO_USER_POOL_ID / COGNITO_APP_CLIENT_ID）
load_dotenv()

REGION = os.environ["AWS_REGION"]
USER_POOL_ID = os.environ["COGNITO_USER_POOL_ID"]
CLIENT_ID = os.environ["COGNITO_APP_CLIENT_ID"]

# 若有自訂登入網域（custom domain），可用 COGNITO_ISSUER 覆寫；否則用預設 issuer
CUSTOM_ISSUER = os.environ.get("COGNITO_ISSUER")
if CUSTOM_ISSUER:
    ISSUER = CUSTOM_ISSUER.rstrip("/")
    JWKS_URL = f"{ISSUER}/.well-known/jwks.json"
else:
    ISSUER = f"https://cognito-idp.{REGION}.amazonaws.com/{USER_POOL_ID}"
    JWKS_URL = f"{ISSUER}/.well-known/jwks.json"

logger.info(f"JWKS URL: {JWKS_URL}")
logger.info(f"Expected Issuer: {ISSUER}")
logger.info(f"Expected Audience: {CLIENT_ID}") #把資訊寫盡日誌，方便在console除錯

_jwk_client = PyJWKClient(JWKS_URL)  #1.下載 JWKS (一組 RSA 公鑰) 2.快取這些公鑰，不用每次都重抓


#用 Cognito 的公鑰來驗 JWT (公鑰換token)
def _verify_jwt(token: str) -> dict:
    """驗證 Cognito JWT（ID Token）。同時驗 audience/issuer/exp/iat。"""
    try:
        # 先解碼 header 來檢查 JWT 結構
        unverified_header = jwt.get_unverified_header(token)
        logger.info(f"JWT Header: {unverified_header}")
        
        # 先不驗證簽名，檢查 payload 內容，不合標準者先淘汰
        unverified_payload = jwt.decode(token, options={"verify_signature": False})
        logger.info(f"JWT Payload (unverified): {unverified_payload}")
        
        # 檢查 token_use (token check 只驗 token_id)
        if unverified_payload.get("token_use") != "id":
            raise HTTPException(
                status_code=401, 
                detail=f"Please use id_token (not {unverified_payload.get('token_use', 'unknown')}_token)"
            )
        
        # 檢查 issuer 是否匹配
        token_issuer = unverified_payload.get("iss")
        if token_issuer != ISSUER:
            logger.error(f"Issuer mismatch. Token: {token_issuer}, Expected: {ISSUER}")
            raise HTTPException(
                status_code=401, 
                detail=f"Invalid issuer. Token: {token_issuer}, Expected: {ISSUER}"
            )
        
        # 檢查 audience 是否匹配
        token_audience = unverified_payload.get("aud")
        if token_audience != CLIENT_ID:
            logger.error(f"Audience mismatch. Token: {token_audience}, Expected: {CLIENT_ID}")
            raise HTTPException(
                status_code=401, 
                detail=f"Invalid audience. Token: {token_audience}, Expected: {CLIENT_ID}"
            )
        
        # 獲取簽名密鑰
        try:
            signing_key = _jwk_client.get_signing_key_from_jwt(token).key #去拿可以拿token的資格
            logger.info("Successfully retrieved signing key")
        except Exception as e:
            logger.error(f"Failed to get signing key: {e}")
            raise HTTPException(status_code=401, detail=f"Failed to get signing key: {e}")
        
        # 驗證簽名
        payload = jwt.decode(
            token,
            signing_key,
            algorithms=["RS256"],
            audience=CLIENT_ID,
            issuer=ISSUER,
            options={"require": ["exp", "iat"]},
        )
        
        logger.info("JWT verification successful")
        return payload
        
    except ExpiredSignatureError:
        logger.error("Token expired")
        raise HTTPException(status_code=401, detail="Token expired")
    except InvalidAudienceError as e:
        logger.error(f"Invalid audience: {e}")
        raise HTTPException(status_code=401, detail=f"Invalid audience; expected {CLIENT_ID}")
    except InvalidIssuerError as e:
        logger.error(f"Invalid issuer: {e}")
        raise HTTPException(status_code=401, detail=f"Invalid issuer; expected {ISSUER}")
    except jwt.InvalidSignatureError as e:
        logger.error(f"Invalid signature: {e}")
        raise HTTPException(status_code=401, detail="Invalid token signature")
    except jwt.DecodeError as e:
        logger.error(f"Token decode error: {e}")
        raise HTTPException(status_code=401, detail="Invalid token format")
    except Exception as e:
        logger.error(f"Unexpected error during JWT verification: {e}")
        raise HTTPException(status_code=401, detail=f"Invalid token: {e}")

def current_user(req: Request) -> dict:
    """從 Authorization: Bearer <JWT> 讀取並回傳使用者資訊"""
    auth = req.headers.get("authorization")
    if not auth or not auth.lower().startswith("bearer "):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="No token")
    
    token = auth.split(" ", 1)[1].strip()
    logger.info(f"Received token (first 50 chars): {token[:50]}...")
    
    payload = _verify_jwt(token)
    return {
        "sub": payload.get("sub"),
        "email": payload.get("email"),
        "groups": payload.get("cognito:groups", []),
        "teacherId": payload.get("custom:teacherId"),
    }

def require_groups(*allowed: str):
    """簡易 RBAC 相依性：要求使用者屬於任一指定群組"""
    def _dep(user: dict = Depends(current_user)) -> dict:
        if any(g in user["groups"] for g in allowed):
            return user
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden")
    return _dep