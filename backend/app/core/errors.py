from fastapi import Request
from fastapi.responses import JSONResponse


class FeatureUnavailable(Exception):
    def __init__(self, feature: str):
        self.feature = feature


async def unavailable_handler(request: Request, error: FeatureUnavailable):
    return JSONResponse(
        status_code=503,
        content={
            "error": {
                "code": "feature_not_ready",
                "message": f"{error.feature} is specified but not implemented in this scaffold.",
            }
        },
    )
