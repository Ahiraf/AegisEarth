from fastapi import APIRouter, HTTPException

from app.modules.bands.catalog import catalog, channel

router = APIRouter(prefix="/bands", tags=["bands"])


@router.get("")
def nominal_channels():
    data = catalog()
    return {k: v for k, v in data.items() if k != "channels"} | {
        "channels": [
            {
                k: v
                for k, v in row.items()
                if k not in {"middle_pixel_response", "all_pixel_response"}
            }
            for row in data["channels"]
        ]
    }


@router.get("/{channel_id}")
def nominal_channel(channel_id: int):
    try:
        return channel(channel_id)
    except ValueError as exc:
        raise HTTPException(404, detail={"code": "nominal_channel_not_found"}) from exc
