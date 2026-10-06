"""Verify native UI substitutions across the six supported languages."""
import json
import re
from pathlib import Path

source = Path(__file__).resolve().parents[1] / "MarketplaceLiteracyApp"
table = json.loads((source / "LibraryTranslations.json").read_text(encoding="utf-8"))
codes = ["en", "fr", "hi", "es", "sw", "te"]
for key, values in table.items():
    assert len(values) == len(codes), f"{key}: expected six languages"
    tokens = re.findall(r"%(?:ld|@)", values[0])
    for code, value in zip(codes, values):
        assert value.strip(), f"{key}/{code}: empty translation"
        assert re.findall(r"%(?:ld|@)", value) == tokens, f"{key}/{code}: inconsistent placeholders"
references = set()
for path in source.glob("*.swift"):
    references.update(re.findall(r'\.text\("(\w+)"', path.read_text(encoding="utf-8")))
references.update(["loading", "starting", "slowVideo", "tapPlay", "embedBlocked",
                   "youtubeError", "videoFailed", "playerStopped", "resourceOne", "resourcesMany",
                   "imageDiaries", "doodle", "animation", "videoScribe", "global", "vocations", "online"])
assert not references - table.keys(), f"Missing keys: {references - table.keys()}"
print(f"Localization verified: {len(table)} keys, {len(codes)} languages, consistent placeholders.")
