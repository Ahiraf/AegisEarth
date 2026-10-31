import json
from functools import lru_cache
from pathlib import Path


@lru_cache
def catalog():
    return json.loads(Path(__file__).with_name("channels.json").read_text(encoding="utf-8"))


def channel(identifier):
    if not 1 <= identifier <= 102:
        raise ValueError("Unknown nominal channel")
    return catalog()["channels"][identifier - 1]
