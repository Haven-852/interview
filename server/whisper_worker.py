import json
import os
import sys

os.environ.setdefault("HF_ENDPOINT", "https://hf-mirror.com")

from faster_whisper import WhisperModel

root = sys.argv[1]
model = WhisperModel("small", device="cpu", compute_type="int8", download_root=root)
sys.stdout.write("READY\n")
sys.stdout.flush()

prompt = "普通话面试问答，可以夹杂英文技术词，例如 Skill、Tool、API、Redis、分发层、失败回退。"

for line in sys.stdin:
    line = line.strip()
    if not line:
        continue
    try:
        request = json.loads(line)
        segments, _info = model.transcribe(
            request["wav"],
            language="zh",
            task="transcribe",
            beam_size=5,
            temperature=0.0,
            vad_filter=True,
            vad_parameters={"min_silence_duration_ms": 300, "speech_pad_ms": 200},
            condition_on_previous_text=False,
            initial_prompt=prompt,
            no_speech_threshold=0.6,
            compression_ratio_threshold=2.4,
            log_prob_threshold=-0.8,
        )
        parts = []
        for segment in segments:
            if segment.no_speech_prob is not None and segment.no_speech_prob >= 0.5:
                continue
            if segment.avg_logprob is not None and segment.avg_logprob < -1.0:
                continue
            parts.append(segment.text)
        text = "".join(parts).strip()
        sys.stdout.write(json.dumps({"text": text}, ensure_ascii=False) + "\n")
    except Exception as error:
        sys.stdout.write(json.dumps({"error": str(error)}, ensure_ascii=False) + "\n")
    sys.stdout.flush()
