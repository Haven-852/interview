import json
import sys

import cv2
import numpy as np
from rapidocr_onnxruntime import RapidOCR

engine = RapidOCR()
sys.stdout.write("READY\n")
sys.stdout.flush()


def read_image(path):
    data = np.fromfile(path, dtype=np.uint8)
    image = cv2.imdecode(data, cv2.IMREAD_COLOR)
    if image is None:
        raise RuntimeError("图片无法打开")
    height, width = image.shape[:2]
    long_side = max(height, width)
    if long_side > 2400:
        scale = 2400 / long_side
        image = cv2.resize(image, (int(width * scale), int(height * scale)), interpolation=cv2.INTER_AREA)
    elif long_side < 700:
        image = cv2.resize(image, None, fx=2, fy=2, interpolation=cv2.INTER_CUBIC)
    return image


def join_line(parts):
    text = ""
    for _left, piece in sorted(parts):
        if not text:
            text = piece
            continue
        if text[-1].isascii() and piece[:1].isascii():
            text += " " + piece
        else:
            text += piece
    return text


def to_text(result):
    rows = []
    for box, text, score in result or []:
        piece = str(text).strip()
        if not piece or float(score) < 0.5:
            continue
        top = min(point[1] for point in box)
        left = min(point[0] for point in box)
        height = max(point[1] for point in box) - top
        if rows and abs(top - rows[-1][0]) <= max(10, height * 0.6):
            rows[-1][1].append((left, piece))
        else:
            rows.append([top, [(left, piece)]])
    return "\n".join(join_line(parts) for _top, parts in rows).strip()


for line in sys.stdin:
    line = line.strip()
    if not line:
        continue
    try:
        request = json.loads(line)
        found, _elapsed = engine(read_image(request["img"]))
        sys.stdout.write(json.dumps({"text": to_text(found)}, ensure_ascii=False) + "\n")
    except Exception as error:
        sys.stdout.write(json.dumps({"error": str(error)}, ensure_ascii=False) + "\n")
    sys.stdout.flush()
