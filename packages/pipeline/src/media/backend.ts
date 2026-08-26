import { copyFileSync, mkdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { sha256Hex } from "@opencourse/content";

/**
 * 미디어 업로드 백엔드 (docs/10 S11).
 * 인터페이스 하나에 두 구현 — 개발용 로컬 폴더와 R2(9단계에서 연결).
 * 업로드는 모든 미디어가 로컬에서 완성·검증된 뒤 일괄로 한다.
 */
export interface UploadedMedia {
  key: string;
  url: string;
  bytes: number;
  sha256: string;
}

export interface MediaBackend {
  readonly name: string;
  upload(localPath: string, key: string): Promise<UploadedMedia>;
  /** 업로드된 자산이 실제로 응답하는지 확인한다 (URL 응답 확인). */
  verify(uploaded: UploadedMedia): Promise<boolean>;
}

/** 개발용: 로컬 폴더에 복사하고 설정된 베이스 URL로 주소를 만든다. */
export class LocalMediaBackend implements MediaBackend {
  readonly name = "local";
  constructor(
    private readonly storeDir: string,
    private readonly baseUrl = "https://media.local.opencourse.invalid",
  ) {}

  upload(localPath: string, key: string): Promise<UploadedMedia> {
    const target = join(this.storeDir, key);
    mkdirSync(dirname(target), { recursive: true });
    copyFileSync(localPath, target);
    const bytes = statSync(target).size;
    return Promise.resolve({
      key,
      url: `${this.baseUrl}/${key}`,
      bytes,
      sha256: sha256Hex(readFileSync(target)),
    });
  }

  verify(uploaded: UploadedMedia): Promise<boolean> {
    const target = join(this.storeDir, uploaded.key);
    try {
      return Promise.resolve(statSync(target).size === uploaded.bytes);
    } catch {
      return Promise.resolve(false);
    }
  }
}

/**
 * R2 백엔드 (9단계). 자격 증명은 wrangler 로그인이 갖고 있고, 여기는 명령 템플릿만 안다
 * — TTS·Whisper 어댑터와 같은 방식. 공개 URL은 버킷의 공개 도메인 접두사로 만들고,
 * verify는 그 URL에 HEAD 요청으로 실제 응답을 확인한다 (docs/10: URL 응답 확인).
 *
 * 기본 명령: wrangler r2 object put {bucket}/{key} --file {file} --remote
 * 환경: OPENCOURSE_R2_BUCKET, OPENCOURSE_R2_PUBLIC_URL (예: https://media.example.dev)
 *       OPENCOURSE_R2_PUT_CMD (선택 — 명령 템플릿 재정의, {bucket}·{key}·{file} 치환)
 */
export class R2MediaBackend implements MediaBackend {
  readonly name = "r2";
  constructor(
    private readonly bucket: string,
    private readonly publicUrl: string,
    private readonly putTemplate = "wrangler r2 object put {bucket}/{key} --file {file} --remote",
    private readonly exec: (cmd: string, args: string[]) => Promise<void> = async (cmd, args) => {
      const { execFile } = await import("node:child_process");
      const { promisify } = await import("node:util");
      await promisify(execFile)(cmd, args, { maxBuffer: 1024 * 1024 * 64 });
    },
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  static fromEnv(env: NodeJS.ProcessEnv = process.env): R2MediaBackend {
    const bucket = env.OPENCOURSE_R2_BUCKET;
    const publicUrl = env.OPENCOURSE_R2_PUBLIC_URL;
    if (!bucket || !publicUrl) {
      throw new Error(
        "R2 설정이 없습니다 — OPENCOURSE_R2_BUCKET과 OPENCOURSE_R2_PUBLIC_URL을 지정하십시오 (9단계)",
      );
    }
    return new R2MediaBackend(bucket, publicUrl, env.OPENCOURSE_R2_PUT_CMD ?? undefined);
  }

  async upload(localPath: string, key: string): Promise<UploadedMedia> {
    const bytes = statSync(localPath).size;
    const sha256 = sha256Hex(readFileSync(localPath));
    const parts = this.putTemplate
      .split(/\s+/u)
      .filter(Boolean)
      .map((part) =>
        part.replace(/\{(\w+)\}/gu, (_, name: string) => {
          if (name === "bucket") return this.bucket;
          if (name === "key") return key;
          if (name === "file") return localPath;
          return "";
        }),
      );
    const [cmd, ...args] = parts;
    if (!cmd) throw new Error("R2 업로드 명령 템플릿이 비어 있습니다");
    await this.exec(cmd, args);
    return { key, url: `${this.publicUrl.replace(/\/$/u, "")}/${key}`, bytes, sha256 };
  }

  async verify(uploaded: UploadedMedia): Promise<boolean> {
    try {
      const res = await this.fetchImpl(uploaded.url, { method: "HEAD" });
      if (!res.ok) return false;
      const len = res.headers.get("content-length");
      return len === null || Number(len) === uploaded.bytes;
    } catch {
      return false;
    }
  }
}

/**
 * 환경으로 백엔드를 고른다 — S11이 이 함수 하나만 부른다.
 * 1) R2 (OPENCOURSE_R2_BUCKET + OPENCOURSE_R2_PUBLIC_URL) — 미디어가 GB 규모로 컸을 때
 * 2) Pages 자산 (OPENCOURSE_MEDIA_DIR + OPENCOURSE_MEDIA_BASE_URL) — 사이트와 함께
 *    배포되는 정적 파일. 카드·구독 없이 무료 (2026-08-26 채택, 교재당 ~1.4MB 실측).
 *    본문↔미디어가 같은 커밋에 실리므로 깨진 주소가 구조적으로 불가능하다.
 * 3) 로컬 폴더 — 개발 기본값
 */
export function mediaBackendFromEnv(
  storeDir: string,
  env: NodeJS.ProcessEnv = process.env,
): MediaBackend {
  if (env.OPENCOURSE_R2_BUCKET && env.OPENCOURSE_R2_PUBLIC_URL) {
    return R2MediaBackend.fromEnv(env);
  }
  if (env.OPENCOURSE_MEDIA_DIR && env.OPENCOURSE_MEDIA_BASE_URL) {
    return new LocalMediaBackend(env.OPENCOURSE_MEDIA_DIR, env.OPENCOURSE_MEDIA_BASE_URL);
  }
  return new LocalMediaBackend(storeDir);
}
