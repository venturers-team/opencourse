#!/usr/bin/env python
"""S9 — Qwen3-TTS 로컬 합성 (공개 가중치, 프리셋 Sohee — 스타일 v1 지정 음성).
사용: tts.py <텍스트> <출력.wav>   (OPENCOURSE_TTS_CMD 템플릿이 부른다)
장치: MPS 시도 → 실패 시 CPU. 모델은 첫 호출 때 내려받아 HF 캐시에 남는다."""
import sys

def main() -> int:
    text, out = sys.argv[1], sys.argv[2]
    import soundfile as sf
    import torch
    from qwen_tts import Qwen3TTSModel

    last_err = None
    for device in (["mps", "cpu"] if torch.backends.mps.is_available() else ["cpu"]):
        try:
            model = Qwen3TTSModel.from_pretrained(
                "Qwen/Qwen3-TTS-12Hz-1.7B-CustomVoice",
                device_map=device,
                dtype=torch.float32 if device == "cpu" else torch.float16,
            )
            wavs, sr = model.generate_custom_voice(text=text, language="Korean", speaker="Sohee")
            sf.write(out, wavs[0] if isinstance(wavs, list) else wavs, sr)
            print(f"ok device={device} sr={sr}")
            return 0
        except Exception as e:  # noqa: BLE001 — 장치 폴백
            last_err = e
            print(f"device {device} 실패: {e}", file=sys.stderr)
    print(f"합성 실패: {last_err}", file=sys.stderr)
    return 1

if __name__ == "__main__":
    sys.exit(main())
