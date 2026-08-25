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
