import { randomBytes } from 'node:crypto';
import { expect, test, request as requestFactory } from '@playwright/test';

// Explicit opt-in: uses a temporary account on the local backend and deletes it afterward.
test.use({ trace: 'off', baseURL: 'http://localhost:5173', isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
test('로컬 백엔드와 모바일 일정·장소·그룹·기념품 저장을 연동한다', async ({ page, request }, testInfo) => {
  test.skip(process.env.YUME_LIVE_API !== '1', '로컬 백엔드 실행 후 YUME_LIVE_API=1로 실행합니다.');
  test.setTimeout(120_000);
  const api = 'http://localhost:8080';
  const username = `ux_${randomBytes(8).toString('hex')}`;
  const password = randomBytes(24).toString('hex');
  const signup = await request.post(`${api}/api/auth/signup`, { data: { username, password } });
  expect(signup.ok(), `검증 계정 가입 응답: ${signup.status()} (재시도 대기: ${signup.headers()['retry-after'] || '없음'}초)`).toBeTruthy();
  const cleanupRequest = await requestFactory.newContext({ timeout: 15_000 });
  const headers: Record<string, string> = {};
  try {
    const login = await request.post(`${api}/api/auth/login`, { data: { username, password } });
    expect(login.ok()).toBeTruthy();
    const auth = (await login.json()).data as { token: string; expiryDate: string };
    headers.Authorization = `Bearer ${auth.token}`;
    await page.addInitScript(({ token, username, expiry }) => {
      localStorage.setItem('accessToken', token);
      localStorage.setItem('username', username);
      localStorage.setItem('tokenExpiry', expiry);
      for (const id of ['days', 'day-detail', 'spots', 'spot-detail']) localStorage.setItem(`yume:page-guide:${username}:${id}`, 'done');
    }, { token: auth.token, username, expiry: auth.expiryDate });

    const created = await request.post(`${api}/api/days/independent`, { headers, data: { dayName: 'UX 검증 하루 코스', scheduleMode: 'SIMPLE' } });
    expect(created.ok()).toBeTruthy();
    const dayId = (await created.json()).data.id as number;
    const added = await request.post(`${api}/api/schedules/day/${dayId}`, { headers, data: { scheduleOrder: 0, spotName: '검증용 산책 장소', startTime: '09:00', memo: '최초 메모' } });
    expect(added.ok()).toBeTruthy();

    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`/days/${dayId}`);
    await expect(page.getByPlaceholder('일정 제목')).toHaveValue('UX 검증 하루 코스');
    const toolbar = page.locator('[data-guide-target="day-detail-toolbar"]');
    await page.getByPlaceholder('일정 제목').fill('실제 API로 저장한 하루 코스');
    await expect(toolbar.getByRole('status')).toContainText('저장되지 않은 변경사항');
    await toolbar.getByText('입력 후 다른 곳을 누르면 자동 저장됩니다.').click();
    await expect(toolbar.getByRole('status')).toContainText('저장 완료');
    const savedDay = await request.get(`${api}/api/days/${dayId}`, { headers });
    expect((await savedDay.json()).data.dayName).toBe('실제 API로 저장한 하루 코스');

    await page.getByLabel('장소명', { exact: true }).fill('변경된 산책 장소');
    await page.getByLabel('일정 메모', { exact: true }).fill('실제 서버에 저장할 새 메모');
    await page.getByLabel('일정 메모', { exact: true }).blur();
    await expect(toolbar.getByRole('status')).toContainText('저장 완료');
    await expect.poll(async () => {
      const response = await request.get(`${api}/api/schedules/day/${dayId}`, { headers });
      return (await response.json()).data[0].memo;
    }).toBe('실제 서버에 저장할 새 메모');
    await page.screenshot({ path: testInfo.outputPath('live-mobile-day.png') });
    await page.reload();
    await expect(page.getByLabel('장소명', { exact: true })).toHaveValue('변경된 산책 장소');
    await expect(page.getByLabel('일정 메모', { exact: true })).toHaveValue('실제 서버에 저장할 새 메모');

    // Onboarding supplies a real place collection; add local test places if it has fewer than 21.
    const initialSpots = await request.get(`${api}/api/spots?page=0&size=20`, { headers });
    const initial = (await initialSpots.json()).data as { totalElements: number };
    for (let index = initial.totalElements; index < 21; index++) {
      const response = await request.post(`${api}/api/spots`, { headers, data: {
        placeId: `${username}_${index}`, spotName: `UX 검증 장소 ${index}`, spotType: 'OTHER', address: '교토', lat: 34.98, lng: 135.75, isVisit: false, metadata: {},
      } });
      expect(response.ok()).toBeTruthy();
    }
    const secondPage = await request.get(`${api}/api/spots?page=1&size=20`, { headers });
    const laterSpot = (await secondPage.json()).data.content[0] as { id: number; spotName: string; displayName?: string | null };
    const displayName = laterSpot.displayName || laterSpot.spotName;
    await page.goto('/spots?mode=PURCHASE');
    await page.getByRole('button', { name: '+ 새 기념품 추가' }).tap();
    await page.getByRole('button', { name: '장소 더 불러오기' }).tap();
    const select = page.getByLabel('장소 (필수)', { exact: true });
    await expect(select.locator(`option[value="${laterSpot.id}"]`)).toHaveCount(1);
    await select.selectOption(String(laterSpot.id));
    await page.getByLabel('장소 검색', { exact: true }).fill(displayName);
    await expect(select).toBeEnabled();
    await expect(select).toHaveValue(String(laterSpot.id));
    await page.getByLabel('기념품 이름 (필수)', { exact: true }).fill('UX 검증 기념품');
    await page.getByRole('button', { name: '저장하기', exact: true }).tap();
    await expect(page.getByText('기념품을 추가했습니다. 🎁')).toBeVisible();
    const purchases = await request.get(`${api}/api/purchases?page=0&size=20&keyword=UX`, { headers });
    const purchase = (await purchases.json()).data.content.find((item: { itemName: string }) => item.itemName === 'UX 검증 기념품') as { spotUserId: number };
    expect(purchase.spotUserId).toBe(laterSpot.id);

    const createdSpot = await request.post(`${api}/api/spots`, { headers, data: {
      placeId: `${username}_mobile`, spotName: '모바일 검증 장소', spotType: 'OTHER', address: '교토',
      lat: 34.98, lng: 135.75, isVisit: false, metadata: {},
    } });
    expect(createdSpot.ok()).toBeTruthy();
    const spotId = (await createdSpot.json()).data.id as number;
    await page.goto(`/spots/${spotId}`);
    await page.getByRole('button', { name: /정보 수정/ }).tap();
    const form = page.getByRole('form', { name: '장소 정보 수정' });
    await form.getByRole('textbox', { name: '장소 이름', exact: true }).fill('모바일에서 수정한 장소');
    await form.getByLabel('설명 (선택)').fill('실제 API로 저장한 장소 설명');
    await form.getByRole('button', { name: '저장', exact: true }).tap();
    await expect(page.getByRole('heading', { name: '모바일에서 수정한 장소', exact: true })).toBeVisible();
    const savedSpot = await request.get(`${api}/api/spots/${spotId}`, { headers });
    expect((await savedSpot.json()).data).toMatchObject({ spotName: '모바일 검증 장소', displayName: '모바일에서 수정한 장소', description: '실제 API로 저장한 장소 설명' });
    await page.reload();
    await expect(page.getByRole('heading', { name: '모바일에서 수정한 장소', exact: true })).toBeVisible();
    await page.getByRole('heading', { name: '모바일에서 수정한 장소', exact: true }).scrollIntoViewIfNeeded();
    await page.screenshot({ path: testInfo.outputPath('live-mobile-spot.png') });

    const createdGroup = await request.post(`${api}/api/groups`, { headers, data: { groupName: '모바일 검증 그룹' } });
    expect(createdGroup.ok()).toBeTruthy();
    const groupId = (await createdGroup.json()).data.id as number;
    const linked = await request.post(`${api}/api/groups/${groupId}/spot/${spotId}`, { headers });
    expect(linked.ok()).toBeTruthy();
    await page.goto('/spots?mode=GROUP');
    await expect(page.getByRole('status', { name: '목록 불러오는 중' })).toBeHidden();
    const group = page.getByRole('button', { name: '모바일 검증 그룹 그룹 열기' });
    await group.focus(); await group.press('Enter');
    await expect(page.getByRole('link').filter({ has: page.getByRole('heading', { name: '모바일에서 수정한 장소', exact: true }), visible: true })).toHaveAttribute('href', `/spots/${spotId}`);
    await page.getByRole('button', { name: /그룹 목록으로 돌아가기/ }).click();
    await page.getByRole('button', { name: '🎁 기념품', exact: true }).click();
    await expect(page.getByRole('button', { name: '+ 새 기념품 추가' })).toBeVisible();
    await page.goBack();
    await expect(page.getByRole('button', { name: '📂 그룹', exact: true })).toHaveAttribute('aria-pressed', 'true');
    await expect(group).toBeVisible();
    await page.goForward();
    await expect(page.getByRole('button', { name: '🎁 기념품', exact: true })).toHaveAttribute('aria-pressed', 'true');

    const detailedDay = await request.post(`${api}/api/days/independent`, { headers, data: { dayName: '모바일 상세 일정 검증', scheduleMode: 'DETAILED' } });
    expect(detailedDay.ok()).toBeTruthy();
    const detailedDayId = (await detailedDay.json()).data.id as number;
    const detailedSchedule = await request.post(`${api}/api/schedules/day/${detailedDayId}`, { headers, data: {
      scheduleOrder: 0, spotUserId: spotId, spotName: '모바일에서 수정한 장소', spotType: 'OTHER',
      lat: 34.98, lng: 135.75, startTime: '09:00', duration: 60,
    } });
    expect(detailedSchedule.ok()).toBeTruthy();
    const scheduleId = (await detailedSchedule.json()).data[0].id as number;
    await page.goto(`/days/${detailedDayId}`);
    const row = page.locator(`[data-schedule-id="${scheduleId}"]`);
    const edit = row.getByRole('button', { name: '모바일에서 수정한 장소 일정 편집', exact: true });
    await edit.focus(); await edit.press('Enter');
    const buffer = row.getByRole('button', { name: '일정 여유시간 15분', exact: true });
    await buffer.focus(); await buffer.press('Space');
    await expect(buffer).toHaveAttribute('aria-pressed', 'true');
    expect(await row.evaluate(node => node.scrollWidth <= node.clientWidth)).toBe(true);
    await buffer.scrollIntoViewIfNeeded();
    await page.screenshot({ path: testInfo.outputPath('live-mobile-detailed.png') });
    await row.getByRole('button', { name: '저장', exact: true }).tap();
    await expect(edit).toBeVisible();
    const storedSchedule = await request.get(`${api}/api/schedules/day/${detailedDayId}`, { headers });
    expect((await storedSchedule.json()).data[0]).toMatchObject({ duration: 75, extraDuration: 15 });
    await page.reload();
    await expect(edit).toBeVisible();
    await row.getByRole('button', { name: '모바일에서 수정한 장소 다음에 일정 추가', exact: true }).press('Enter');
    await expect.poll(async () => {
      const response = await request.get(`${api}/api/schedules/day/${detailedDayId}`, { headers });
      return (await response.json()).data.length;
    }).toBe(2);
  } finally {
    try {
      if (!headers.Authorization) {
        const login = await cleanupRequest.post(`${api}/api/auth/login`, { data: { username, password } });
        expect(login.ok(), '검증 계정 정리를 위한 로그인').toBeTruthy();
        headers.Authorization = `Bearer ${(await login.json()).data.token}`;
      }
      const cleanup = await cleanupRequest.delete(`${api}/api/account`, { headers, data: { password } });
      expect(cleanup.ok(), '검증용 계정과 데이터 정리').toBeTruthy();
    } finally {
      await cleanupRequest.dispose();
    }
  }
});
