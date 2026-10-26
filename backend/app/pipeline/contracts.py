from dataclasses import dataclass
from typing import Protocol


@dataclass(frozen=True)
class StageSpec:
    name: str
    owner: str
    output: str
    implemented: bool = False


class StageExecutor(Protocol):
    def execute(self, analysis_id: str, inputs: dict) -> dict:
        """Return validated artifact references and metrics; never public results directly."""
        ...
