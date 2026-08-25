#!/usr/bin/env python
"""S9 배치 합성 — 모델을 한 번만 적재하고 여러 문장을 처리한다.
사용: tts-batch.py <jobs.json>   (jobs: [{"text": ..., "out": ...}, ...])"""
import json
import sys

def main() -> int:
    jobs = json.load(open(sys.argv[1]))
    import soundfile as sf
    import torch
    from qwen_tts import Qwen3TTSModel

    device = "mps" if torch.backends.mps.is_available() else "cpu"
    model = Qwen3TTSModel.from_pretrained(
        "Qwen/Qwen3-TTS-12Hz-1.7B-CustomVoice",
        device_map=device,
        dtype=torch.float16 if device == "mps" else torch.float32,
    )
    for job in jobs:
        wavs, sr = model.generate_custom_voice(
            text=job["text"], language="Korean", speaker="Sohee"
        )
        sf.write(job["out"], wavs[0] if isinstance(wavs, list) else wavs, sr)
        print(f"ok {job['out']}", flush=True)
    return 0

if __name__ == "__main__":
    sys.exit(main())
