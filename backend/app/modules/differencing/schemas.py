from typing import Literal

from pydantic import Field

from app.modules.coadds.schemas import FrameInput, Inputs


class DifferenceRequest(Inputs):
    contract_version: Literal["difference-v1"] = "difference-v1"
    inputs: list[FrameInput] = Field(min_length=2, max_length=2)
