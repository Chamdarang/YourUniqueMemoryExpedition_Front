import { randomBytes } from 'node:crypto';
import { expect, test, request as requestFactory, type APIRequestContext } from '@playwright/test';

test.use({ trace: 'off', baseURL: 'http://localhost:5173' });

test('실제 검색은 본인의 독립 코스만 검색하고 페이지 수와 특수문자를 유지한다', async ({ page }) => {
  test.skip(process.env.YUME_LIVE_API !== '1', '실행 중인 로컬 백엔드가 필요한 테스트입니다.');
  test.setTimeout(120_000);
  const api = 'http://localhost:8080';
  const accounts: Array<{ username: string; password: string; token: string; client: APIRequestContext }> = [];
  const marker = `SearchUx${randomBytes(5).toString('hex')}`;
  const signup = async () => {
    const client = await requestFactory.newContext({ timeout: 15_000 });
    const account = { username: `ux_${randomBytes(8).toString('hex')}`, password: randomBytes(24).toString('hex'), token: '', client };
    const registered = await client.post(`${api}/api/auth/signup`, { data: { username: account.username, password: account.password } });
    expect(registered.ok(), `검증 계정 가입 응답: ${registered.status()} (재시도 대기: ${registered.headers()['retry-after'] || '없음'}초)`).toBeTruthy();
    accounts.push(account);
    const login = await client.post(`${api}/api/auth/login`, { data: { username: account.username, password: account.password } });
    expect(login.ok()).toBeTruthy();
    account.token = (await login.json()).data.token;
    return { account, headers: { Authorization: `Bearer ${account.token}` } };
  };
  try {
    const owner = await signup();
    const other = await signup();
    const create = async (client: APIRequestContext, headers: Record<string, string>, name: string) => {
      const response = await client.post(`${api}/api/days/independent`, { headers, data: { dayName: name, scheduleMode: 'SIMPLE' } });
      expect(response.ok()).toBeTruthy();
    };
    await create(owner.account.client, owner.headers, `${marker} 교토 산책`);
    await create(owner.account.client, owner.headers, `${marker} 나라 산책`);
    await create(owner.account.client, owner.headers, '검색에서 제외할 다른 코스');
    await create(other.account.client, other.headers, `${marker} 타인의 코스`);
    const planned = await owner.account.client.post(`${api}/api/plans`, { headers: owner.headers, data: { planName: '검색 범위 검증', planStartDate: '2026-10-07', planEndDate: '2026-10-07', planDays: 1, planMemo: '' } });
    expect(planned.ok()).toBeTruthy();
    const planId = (await planned.json()).data.id;
    const attached = await owner.account.client.post(`${api}/api/days/plan/${planId}`, { headers: owner.headers, data: { dayName: `${marker} 여행에 속한 코스`, dayOrder: 1, scheduleMode: 'SIMPLE' } });
    expect(attached.ok()).toBeTruthy();
    const result = await owner.account.client.get(`${api}/api/days/independent`, { headers: owner.headers, params: { keyword: `  ${marker.toLowerCase()}  `, page: 0, size: 1 } });
    expect(result.ok()).toBeTruthy();
    const first = (await result.json()).data;
    expect(first.totalElements).toBe(2); expect(first.totalPages).toBe(2); expect(first.content).toHaveLength(1);
    const next = await owner.account.client.get(`${api}/api/days/independent`, { headers: owner.headers, params: { keyword: marker, page: 1, size: 1 } });
    const second = (await next.json()).data;
    expect(second.number).toBe(1); expect(second.content).toHaveLength(1);
    expect(second.content[0].id).not.toBe(first.content[0].id);

    await create(owner.account.client, owner.headers, `${marker} 50%_기념 코스`);
    await create(owner.account.client, owner.headers, `${marker} 50xy기념 코스`);
    const literal = await owner.account.client.get(`${api}/api/days/independent`, { headers: owner.headers, params: { keyword: '50%_', size: 20 } });
    const literalResults = (await literal.json()).data;
    expect(literalResults.totalElements).toBe(1);
    expect(literalResults.content[0].dayName).toContain('50%_');

    await page.addInitScript(({ username, token }) => {
      localStorage.setItem('accessToken', token);
      localStorage.setItem('username', username);
      localStorage.setItem(`yume:page-guide:${username}:days`, 'done');
    }, { username: owner.account.username, token: owner.account.token });
    await page.goto('/days');
    await page.getByRole('textbox', { name: '하루 코스 제목 검색' }).fill(marker);
    await page.getByRole('button', { name: '하루 코스 검색 실행' }).click();
    await expect(page.getByRole('link', { name: new RegExp(marker) })).toHaveCount(4);
    await expect(page.getByText(`${marker} 타인의 코스`)).toBeHidden();
    await expect(page.getByText(`${marker} 여행에 속한 코스`)).toBeHidden();
  } finally {
    const failures: string[] = [];
    for (const account of accounts) {
      try {
        if (!account.token) {
          const login = await account.client.post(`${api}/api/auth/login`, { data: { username: account.username, password: account.password } });
          account.token = (await login.json()).data.token;
        }
        const removed = await account.client.delete(`${api}/api/account`, { headers: { Authorization: `Bearer ${account.token}` }, data: { password: account.password } });
        if (!removed.ok()) failures.push(account.username);
      } catch { failures.push(account.username); }
      await account.client.dispose();
    }
    expect(failures, '생성한 검증 계정 정리').toEqual([]);
  }
});
