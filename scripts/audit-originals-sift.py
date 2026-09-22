"""Read-only feature audit; writes candidate matches under ignored sync/."""
import json
from pathlib import Path
from collections import Counter, defaultdict
import cv2
import numpy as np

ROOT = Path(__file__).resolve().parents[1]
SOURCE = Path(r"C:\Users\uwish\Documents\MLP AFRICA PROJECTS\MLP AFRICA ASSETS\High Quality Shutterstock")
frames = json.loads((ROOT / "sync/frame-manifest.json").read_text(encoding="utf-8"))
files = sorted(SOURCE.glob("shutterstock_*.jpg"))
sift = cv2.SIFT_create(nfeatures=650)
descriptors = []
labels = []
keypoints = {}
image_descriptors = {}
for file in files:
    identifier = file.stem.split("_")[-1]
    if identifier in image_descriptors:
        continue
    im = cv2.imread(str(file), cv2.IMREAD_GRAYSCALE)
    if im is None:
        continue
    h, w = im.shape
    im = cv2.resize(im, (round(w * min(1, 1000 / max(h, w))), round(h * min(1, 1000 / max(h, w)))))
    kp, desc = sift.detectAndCompute(im, None)
    if desc is None:
        continue
    image_descriptors[identifier] = desc
    keypoints[identifier] = kp
    descriptors.append(desc)
    labels.extend([identifier] * len(desc))
print(f"Indexed {len(image_descriptors)} originals, {len(labels)} keypoints", flush=True)
all_descriptors = np.vstack(descriptors)
search = cv2.FlannBasedMatcher(dict(algorithm=1, trees=5), dict(checks=90))
search.add([all_descriptors])
search.train()
out = []
for i, frame in enumerate(frames):
    im = cv2.imread(frame["file"], cv2.IMREAD_GRAYSCALE)
    if im is None:
        continue
    im = im[:round(im.shape[0] * .8)]
    h, w = im.shape
    im = cv2.resize(im, (round(w * min(1, 1000 / max(h, w))), round(h * min(1, 1000 / max(h, w)))))
    kp, desc = sift.detectAndCompute(im, None)
    if desc is None:
        continue
    # Retrieve plausible originals globally, then perform a true two-neighbour
    # ratio test inside each candidate image and count geometric inliers.
    candidates = Counter(labels[m[0].trainIdx] for m in search.knnMatch(desc, k=2) if m and m[0].distance < 240)
    scored = []
    for identifier, _ in candidates.most_common(12):
        matches = cv2.BFMatcher().knnMatch(desc, image_descriptors[identifier], k=2)
        good = [m for m, n in matches if m.distance < .73 * n.distance]
        inliers = 0
        if len(good) >= 5:
            a = np.float32([kp[m.queryIdx].pt for m in good]).reshape(-1, 1, 2)
            b = np.float32([keypoints[identifier][m.trainIdx].pt for m in good]).reshape(-1, 1, 2)
            _, mask = cv2.findHomography(a, b, cv2.RANSAC, 5.0)
            if mask is not None:
                inliers = int(mask.sum())
        if inliers >= 4 or len(good) >= 7:
            scored.append(dict(id=identifier, inliers=inliers, good=len(good)))
    out.append(dict(title=frame["title"], key=frame["key"], matches=sorted(scored, key=lambda x: (x["inliers"], x["good"]), reverse=True)))
    if (i + 1) % 50 == 0:
        print(f"{i+1}/{len(frames)}", flush=True)
(ROOT / "sync/original-folder-sift.json").write_text(json.dumps(out, indent=2), encoding="utf-8")
folder_map = defaultdict(set)
for row in out:
    title = row["title"].removesuffix(" — Youth Africa")
    for match in row["matches"]:
        if match["inliers"] >= 20 and match["inliers"] / match["good"] > .55:
            folder_map[title].add(match["id"])
(ROOT / "sync/proposed-original-video-map.json").write_text(json.dumps({
    title: sorted(ids, key=int) for title, ids in folder_map.items()
}, indent=2), encoding="utf-8")
print(f"Saved {len(out)} frame results", flush=True)
