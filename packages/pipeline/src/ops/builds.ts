/**
 * 월별 빌드 횟수 (구현 계획 9단계 — Cloudflare Pages 무료 한도 월 500회 대비).
 * `pnpm ops builds`가 Pages 배포 목록을 API로 세어 이번 달 사용량을 보인다.
 * 자격 증명은 환경 변수로만 받는다 (docs/13 절차).
 */
export interface DeploymentLike {
  created_on: string;
}

export function countMonthlyDeployments(deployments: DeploymentLike[], now: Date): number {
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth();
  return deployments.filter((d) => {
    const t = new Date(d.created_on);
    return t.getUTCFullYear() === y && t.getUTCMonth() === m;
  }).length;
}

export const PAGES_FREE_MONTHLY_BUILDS = 500;

export interface BuildUsage {
  used: number;
  limit: number;
  month: string;
}

export async function fetchMonthlyBuildUsage(
  env: NodeJS.ProcessEnv = process.env,
  fetchImpl: typeof fetch = fetch,
  now = new Date(),
): Promise<BuildUsage> {
  const token = env.CLOUDFLARE_API_TOKEN;
  const account = env.CLOUDFLARE_ACCOUNT_ID;
  const project = env.CLOUDFLARE_PAGES_PROJECT;
  if (!token || !account || !project) {
    throw new Error(
      "Cloudflare 설정이 없습니다 — CLOUDFLARE_API_TOKEN·CLOUDFLARE_ACCOUNT_ID·CLOUDFLARE_PAGES_PROJECT (9단계, docs/13)",
    );
  }
  const deployments: DeploymentLike[] = [];
  for (let page = 1; page <= 10; page += 1) {
    const res = await fetchImpl(
      `https://api.cloudflare.com/client/v4/accounts/${account}/pages/projects/${project}/deployments?per_page=25&page=${page}`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    if (!res.ok) throw new Error(`Cloudflare API 오류: ${res.status}`);
    const body = (await res.json()) as { result?: DeploymentLike[] };
    const batch = body.result ?? [];
    deployments.push(...batch);
    if (batch.length < 25) break;
    // 이번 달 이전 배포까지 내려갔으면 더 볼 필요 없다
    const oldest = batch[batch.length - 1];
    if (oldest && countMonthlyDeployments([oldest], now) === 0) break;
  }
  return {
    used: countMonthlyDeployments(deployments, now),
    limit: PAGES_FREE_MONTHLY_BUILDS,
    month: `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`,
  };
}
