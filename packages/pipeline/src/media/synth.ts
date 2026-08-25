import { execFile } from "node:child_process";
import { promisify } from "node:util";

const run = promisify(execFile);

/**
 * 음성 합성과 검증 어댑터 (docs/10 S9).
 * TTS는 Qwen3-TTS 확정 — 도구 호출은 명령 템플릿으로 주입해 기기별 설치 차이를 흡수한다.
 * 검증: Whisper 재전사 유사도 ≥ 0.65. 불합격 장면만 재합성한다.
 */
export interface SynthAdapter {
  /** 문장을 합성해 outPath(mp3/wav)에 쓴다. */
  synthesize(text: string, outPath: string): Promise<void>;
  /** 음성을 재전사해 텍스트를 돌려준다. */
  transcribe(audioPath: string): Promise<string>;
}

/**
 * 명령 템플릿 어댑터. {text}·{out}·{in}이 실제 값으로 치환된다.
 * 예: OPENCOURSE_TTS_CMD='qwen-tts --voice sohee --text {text} --out {out}'
 *     OPENCOURSE_WHISPER_CMD='whisper-cli --file {in} --output-txt'
 */
export class CommandSynthAdapter implements SynthAdapter {
  constructor(
    private readonly ttsTemplate: string,
    private readonly whisperTemplate: string,
    private readonly exec: (cmd: string, args: string[]) => Promise<{ stdout: string }> = async (
      cmd,
      args,
    ) => {
      const { stdout } = await run(cmd, args, { maxBuffer: 1024 * 1024 * 64 });
      return { stdout };
    },
  ) {}

  private split(template: string, vars: Record<string, string>): [string, string[]] {
    const parts = template
      .split(/\s+/u)
      .filter(Boolean)
      .map((part) => part.replace(/\{(\w+)\}/gu, (_, name: string) => vars[name] ?? ""));
    const [cmd, ...args] = parts;
    if (!cmd) throw new Error("명령 템플릿이 비어 있습니다");
    return [cmd, args];
  }

  async synthesize(text: string, outPath: string): Promise<void> {
    const [cmd, args] = this.split(this.ttsTemplate, { text, out: outPath });
    await this.exec(cmd, args);
  }

  async transcribe(audioPath: string): Promise<string> {
    const [cmd, args] = this.split(this.whisperTemplate, { in: audioPath });
    const { stdout } = await this.exec(cmd, args);
    return stdout.trim();
  }
}

/** 재전사 유사도 — 문자 바이그램 다이스 계수. 공백·문장부호를 걷어낸 뒤 비교한다. */
export function transcriptSimilarity(expected: string, actual: string): number {
  const clean = (s: string) =>
    s
      .normalize("NFC")
      .replace(/[\s.,!?·'"“”‘’()\-—]/gu, "")
      .toLowerCase();
  const a = clean(expected);
  const b = clean(actual);
  if (a.length < 2 || b.length < 2) return a === b ? 1 : 0;
  const bigrams = (s: string) => {
    const map = new Map<string, number>();
    for (let i = 0; i < s.length - 1; i += 1) {
      const g = s.slice(i, i + 2);
      map.set(g, (map.get(g) ?? 0) + 1);
    }
    return map;
  };
  const ma = bigrams(a);
  const mb = bigrams(b);
  let overlap = 0;
  for (const [g, count] of ma) overlap += Math.min(count, mb.get(g) ?? 0);
  return (2 * overlap) / (a.length - 1 + (b.length - 1));
}

export const WHISPER_SIMILARITY_THRESHOLD = 0.65;

/**
 * 장면 하나를 합성하고 재전사로 검증한다. 불합격이면 상한까지 재합성한다.
 * 상한을 넘으면 단계 실패다 — 조용히 어긋난 음성을 통과시키는 것이 최악이다.
 */
export async function synthesizeVerified(
  adapter: SynthAdapter,
  text: string,
  outPath: string,
  maxAttempts = 3,
): Promise<{ attempts: number; similarity: number }> {
  let lastSimilarity = 0;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    await adapter.synthesize(text, outPath);
    const transcript = await adapter.transcribe(outPath);
    lastSimilarity = transcriptSimilarity(text, transcript);
    if (lastSimilarity >= WHISPER_SIMILARITY_THRESHOLD) {
      return { attempts: attempt, similarity: lastSimilarity };
    }
  }
  throw new Error(
    `음성 검증 실패: ${maxAttempts}회 합성에도 유사도 ${lastSimilarity.toFixed(2)} < ${WHISPER_SIMILARITY_THRESHOLD} — "${text.slice(0, 40)}"`,
  );
}
