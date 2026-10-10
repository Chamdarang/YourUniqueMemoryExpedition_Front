import { expect, test, type Page, type Route } from '@playwright/test';

const day = { id: 1, dayName: '교토 하루 코스', dayOrder: 1, memo: '예약 시간 확인', scheduleMode: 'SIMPLE' };
const plan = { id: 1, planName: '간사이 여행', planStartDate: '2026-10-08', planEndDate: '2026-10-08', planDays: 1, planMemo: '', accessRole: 'OWNER', days: [day] };
const schedule = {
  id: 10, dayId: 1, scheduleOrder: 0, spotUserId: null,
  spotName: '기요미즈데라와 산넨자카 산책', spotType: 'OTHER', isChecked: false, isSkipped: false,
  lat: null, lng: null, startTime: '09:00:00', fixedStartTime: false, duration: 60, endTime: '10:00:00',
  movingDuration: 0, extraDuration: 0, extraMovingDuration: 0, transportation: null, memo: '예약 정보를 충분히 길게 적은 메모입니다.', movingMemo: null,
};
const spots = Array.from({ length: 25 }, (_, i) => ({
  id: i + 1, placeId: `place-${i}`, spotName: `교토 장소 ${i + 1}`, displayName: null,
  spotType: 'OTHER', address: '일본 교토', shortAddress: '교토', lat: 34.98, lng: 135.75,
  isVisit: false, description: '', metadata: {}, userMetadata: {},
}));
function paged<T>(items: T[], page = 0, size = 20) {
  return { content: items.slice(page * size, (page + 1) * size), totalPages: Math.ceil(items.length / size), totalElements: items.length, size, number: page, first: page === 0, last: (page + 1) * size >= items.length, empty: items.length === 0 };
}
function reply(route: Route, data: unknown, status = 200) {
  return route.fulfill({ status, contentType: 'application/json', body: JSON.stringify({ success: status < 400, message: status < 400 ? 'Success' : '일시적인 서버 오류', data }) });
}
async function setup(page: Page) {
  await page.addInitScript(() => {
    localStorage.setItem('username', 'testuser');
    localStorage.setItem('accessToken', 'e2e-token');
    for (const id of ['plans', 'plan-detail', 'days', 'day-detail', 'spots']) localStorage.setItem(`yume:page-guide:testuser:${id}`, 'done');
  });
  await page.route('**/api/**', route => {
    const url = new URL(route.request().url());
    const path = url.pathname;
    if (!path.startsWith('/api/')) return route.continue();
    if (path === '/api/days/1') return reply(route, day);
    if (path === '/api/days/independent') return reply(route, paged([day]));
    if (path === '/api/days/plan/1') return reply(route, [day]);
    if (path === '/api/plans/1') return reply(route, plan);
    if (path === '/api/plans') return reply(route, paged([plan]));
    if (path === '/api/schedules/day/1') return reply(route, [schedule]);
    if (path === '/api/purchases') return reply(route, paged([]));
    if (path === '/api/spots') {
      const matches = spots.filter(spot => spot.spotName.includes(url.searchParams.get('keyword') || ''));
      return reply(route, paged(matches, Number(url.searchParams.get('page') || 0)));
    }
    return reply(route, []);
  });
  await page.route('https://maps.googleapis.com/**', route => route.abort());
}

test.beforeEach(async ({ page }) => { await setup(page); });

test('하루 목록 조회 실패를 빈 목록과 구분하고 재시도한다', async ({ page }) => {
  let failed = true;
  await page.route('**/api/days/independent?**', route => reply(route, failed ? null : paged([day]), failed ? 500 : 200));
  await page.goto('/days');
  await expect(page.getByRole('alert')).toContainText('하루 일정 목록을 불러오지 못했습니다.');
  await expect(page.getByText('등록된 하루 코스가 없습니다.')).toBeHidden();
  failed = false;
  await page.getByRole('button', { name: '다시 시도', exact: true }).click();
  await expect(page.getByRole('heading', { name: day.dayName })).toBeVisible();
  await expect(page.getByRole('alert')).toBeHidden();
});

for (const failingEndpoint of ['/api/days/1', '/api/schedules/day/1']) {
  test(`하루 상세 ${failingEndpoint} 실패 후 다시 불러온다`, async ({ page }) => {
    let failed = true;
    await page.route(`**${failingEndpoint}`, route => reply(route, failed ? null : failingEndpoint.includes('schedules') ? [schedule] : day, failed ? 500 : 200));
    await page.goto('/days/1');
    await expect(page.getByRole('alert')).toContainText('하루 일정 정보를 불러오지 못했습니다.');
    await expect(page.getByText('로딩 중...', { exact: true })).toBeHidden();
    failed = false;
    await page.getByRole('button', { name: '다시 시도', exact: true }).click();
    await expect(page.getByPlaceholder('일정 제목')).toHaveValue(day.dayName);
    await expect(page.getByLabel('장소명', { exact: true })).toHaveValue(schedule.spotName);
  });
}

test('여행 상세 조회 실패에서 목록 복귀와 재시도를 제공한다', async ({ page }) => {
  let failed = true;
  await page.route('**/api/plans/1', route => reply(route, failed ? null : plan, failed ? 500 : 200));
  await page.goto('/plans/1');
  await expect(page.getByRole('alert')).toContainText('여행 정보를 불러오지 못했습니다.');
  await expect(page.getByRole('link', { name: '목록으로', exact: true })).toHaveAttribute('href', '/plans');
  failed = false;
  await page.getByRole('button', { name: '다시 시도', exact: true }).click();
  await expect(page.locator('[data-guide-target="plan-detail-header"]').getByRole('heading', { name: plan.planName, exact: true })).toBeVisible();
});

test('하루 제목의 변경·저장 실패·재시도와 화면 이탈 보호', async ({ page }) => {
  let failed = true;
  const requests: unknown[] = [];
  await page.route('**/api/days/1', route => {
    if (route.request().method() === 'GET') return reply(route, day);
    requests.push(route.request().postDataJSON());
    return reply(route, null, failed ? 500 : 200);
  });
  await page.goto('/days/1');
  const toolbar = page.locator('[data-guide-target="day-detail-toolbar"]');
  await page.getByPlaceholder('일정 제목').fill('수정한 하루 제목');
  await expect(toolbar.getByRole('status')).toContainText('저장되지 않은 변경사항');
  await toolbar.getByText('입력 후 다른 곳을 누르면 자동 저장됩니다.').click();
  await expect(page.getByRole('alert')).toContainText('변경사항을 저장하지 못했습니다.');
  await expect(page.getByPlaceholder('일정 제목')).toHaveValue('수정한 하루 제목');
  await page.getByRole('link', { name: /내 여행/ }).click();
  await expect(page.getByRole('dialog')).toContainText('저장되지 않은 변경사항');
  await page.getByRole('button', { name: '취소', exact: true }).click();
  await expect(page).toHaveURL(/\/days\/1$/);
  failed = false;
  await page.getByRole('button', { name: '저장 다시 시도', exact: true }).click();
  await expect(toolbar.getByRole('status')).toContainText('저장 완료');
  expect(requests.at(-1)).toEqual({ dayName: '수정한 하루 제목', memo: day.memo });
});

test('느린 일정 저장 응답이 다음 입력을 지우지 않고 실패 후 다시 저장한다', async ({ page }) => {
  let current = { ...schedule };
  let failed = false;
  let releaseFirst!: () => void;
  const firstResponse = new Promise<void>(resolve => { releaseFirst = resolve; });
  let firstFinished = false;
  const requests: Record<string, unknown>[] = [];
  await page.route('**/api/schedules/10', async route => {
    const request = route.request().postDataJSON() as Record<string, unknown>;
    requests.push(request);
    const first = requests.length === 1;
    if (first) await firstResponse;
    if (failed) return reply(route, null, 500);
    current = { ...current, ...request };
    await reply(route, [current]);
    if (first) firstFinished = true;
  });
  await page.goto('/days/1');
  await page.getByLabel('장소명', { exact: true }).fill('새 장소 이름');
  await page.getByLabel('일정 메모', { exact: true }).fill('응답을 기다리는 중에 쓴 메모');
  await expect.poll(() => requests.length).toBe(1);
  releaseFirst();
  await expect.poll(() => firstFinished).toBe(true);
  await expect(page.getByLabel('장소명', { exact: true })).toHaveValue('새 장소 이름');
  await expect(page.getByLabel('일정 메모', { exact: true })).toHaveValue('응답을 기다리는 중에 쓴 메모');
  failed = true;
  await page.getByLabel('일정 메모', { exact: true }).blur();
  await expect(page.getByText('저장 실패 · 입력한 내용은 유지됩니다.')).toBeVisible();
  await expect(page.getByLabel('일정 메모', { exact: true })).toHaveValue('응답을 기다리는 중에 쓴 메모');
  failed = false;
  await page.getByRole('button', { name: '저장 다시 시도', exact: true }).click();
  await expect(page.getByText('저장됨', { exact: true })).toBeVisible();
  expect(requests.at(-1)?.memo).toBe('응답을 기다리는 중에 쓴 메모');
  expect(requests[0]).toEqual({ spotName: '새 장소 이름' });
});

test('기념품 등록에서 20개 이후의 장소를 검색·추가 조회하고 선택을 유지한다', async ({ page }) => {
  await page.goto('/spots?mode=PURCHASE');
  await page.getByRole('button', { name: '+ 새 기념품 추가' }).click();
  const select = page.getByLabel('장소 (필수)', { exact: true });
  await expect(select).toBeEnabled();
  await expect(select.locator('option[value="25"]')).toHaveCount(0);
  await page.getByRole('button', { name: '장소 더 불러오기' }).click();
  await expect(select.locator('option[value="25"]')).toHaveCount(1);
  await select.selectOption('25');
  await page.getByLabel('장소 검색', { exact: true }).fill('장소 1');
  await expect(select).toBeEnabled();
  await expect(select).toHaveValue('25');
  await expect(select.locator('option:checked')).toHaveText('교토 장소 25');
  await page.getByLabel('장소 검색', { exact: true }).fill('장소 24');
  await expect(select.locator('option[value="24"]')).toHaveCount(1);
});

test('모바일 간편 일정의 필드와 터치 영역이 충분하고 경로 점검이 잘리지 않는다', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/days/1');
  const visit = await page.getByRole('button', { name: '방문 완료', exact: true }).boundingBox();
  const name = await page.getByLabel('장소명', { exact: true }).boundingBox();
  const time = await page.getByLabel('시작 시간', { exact: true }).boundingBox();
  const audit = await page.getByRole('button', { name: /전체 경로 점검/ }).boundingBox();
  expect(visit?.width).toBeGreaterThanOrEqual(44);
  expect(visit?.height).toBeGreaterThanOrEqual(44);
  expect(name?.width).toBeGreaterThan(280);
  expect(name!.y).toBeGreaterThan(time!.y);
  expect(audit!.x + audit!.width).toBeLessThanOrEqual(390);
  await expect(page.getByRole('button', { name: '📸 이미지로 내보내기' })).toBeVisible();
});
