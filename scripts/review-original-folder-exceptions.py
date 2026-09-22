"""Create contact sheets in ignored sync/ to review ambiguous matches visually."""
import json
from pathlib import Path
import cv2
import numpy as np

root = Path(__file__).resolve().parents[1]
source = Path(r"C:\Users\uwish\Documents\MLP AFRICA PROJECTS\MLP AFRICA ASSETS\High Quality Shutterstock")
rows = json.loads((root / "sync/original-folder-sift.json").read_text(encoding="utf-8"))
frames = json.loads((root / "sync/frame-manifest.json").read_text(encoding="utf-8"))
used = {id for ids in json.loads((root / "src/lib/studio/verified-original-video-map.json").read_text(encoding="utf-8")).values() for id in ids}
uncertain = [row for row in rows if not any(m["inliers"] >= 20 and m["inliers"] / m["good"] > .55 for m in row["matches"])]
frame_files = {(r["title"], r["key"]): r["file"] for r in frames}
unmapped = [file for file in sorted(source.glob("shutterstock_*.jpg")) if file.stem.split("_")[-1] not in used]

def sheet(entries, output, label):
    width, height, columns = 320, 215, 4
    canvas = np.full((((len(entries)+columns-1)//columns)*height, columns*width, 3), 255, dtype=np.uint8)
    for index, entry in enumerate(entries):
        file, caption = entry
        image = cv2.imread(str(file))
        if image is None:
            continue
        image = cv2.resize(image, (width, height-35))
        x, y = index%columns*width, index//columns*height
        canvas[y:y+height-35, x:x+width] = image
        cv2.putText(canvas, caption[:42], (x+5,y+height-12), cv2.FONT_HERSHEY_SIMPLEX,.38,(0,0,0),1,cv2.LINE_AA)
    cv2.imwrite(str(root / "sync" / output), canvas)
    print(label, len(entries), flush=True)

sheet([(frame_files[(r["title"], r["key"])], f'{r["title"].split(" — ")[0][:26]} {r["key"]}') for r in uncertain], "unresolved-frames.jpg", "uncertain frames")
sheet([(file, file.stem.split("_")[-1]) for file in unmapped], "unmapped-originals.jpg", "unmapped original files")
