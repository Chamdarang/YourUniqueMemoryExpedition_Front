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
    for (const id of ['plans', 'plan-detail', 'days', 'day-detail', 'spots', 'spot-detail']) localStorage.setItem(`yume:page-guide:testuser:${id}`, 'done');
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
      return reply(route, paged(matches, Number(url.searchParams.get('page') || 0), Number(url.searchParams.get('size') || 20)));
    }
    return reply(route, []);
  });
  await page.route('https://maps.googleapis.com/**', route => route.abort());
}

test.beforeEach(async ({ page }) => { await setup(page); });




const detail = { ...spots[0], groupName: [], purchases: [], visitHistory: [] };

test('장소 상세 조회 실패 시 경로를 유지하고 재시도한다', async ({ page }) => {
  let fail = true;
  await page.route('**/api/spots/1', route => reply(route, fail ? null : detail, fail ? 500 : 200));
  await page.goto('/spots/1');
  await expect(page.getByRole('alert')).toContainText('장소 정보를 불러오지 못했습니다.');
  await expect(page).toHaveURL(/\/spots\/1$/);
  await expect(page.getByRole('button', { name: '장소 목록으로' })).toBeVisible();
  fail = false; await page.getByRole('button', { name: '다시 시도' }).click();
  await expect(page.getByRole('heading', { name: '교토 장소 1', exact: true })).toBeVisible();
  await expect(page.getByRole('alert')).toBeHidden();
});

test('장소 갱신 실패와 재시도 후에도 수정 초안을 유지한다', async ({ page }) => {
  let fail = false; const updates: unknown[] = [];
  await page.route('**/api/spots/1', route => {
    if (route.request().method() !== 'GET') { updates.push(route.request().postDataJSON()); return reply(route, detail); }
    return reply(route, fail ? null : detail, fail ? 500 : 200);
  });
  await page.goto('/spots/1');
  await page.getByRole('button', { name: /정보 수정/ }).click();
  const input = page.getByRole('textbox', { name: '장소 이름', exact: true });
  await input.fill('작성 중인 장소 이름');
  fail = true; await page.getByRole('button', { name: /방문 체크/ }).click();
  await expect(page.getByRole('alert')).toBeVisible(); await expect(input).toHaveValue('작성 중인 장소 이름');
  fail = false; await page.getByRole('button', { name: '다시 시도' }).click();
  await expect(page.getByRole('alert')).toBeHidden(); await expect(input).toHaveValue('작성 중인 장소 이름');
  expect(updates).toEqual([{ isVisit: true }]);
});

test('간편 일정 검색을 방향키와 Enter로 선택하고 실제 장소 ID를 저장한다', async ({ page }) => {
  const requests: Record<string, unknown>[] = [];
  await page.route('**/api/schedules/day/1', route => { if (route.request().method() === 'POST') requests.push(route.request().postDataJSON()); return reply(route, [schedule]); });
  await page.goto('/days/1'); await page.getByRole('button', { name: '+ 간편 일정 추가' }).click();
  const input = page.getByRole('combobox', { name: '일정 장소 검색' });
  await input.fill('교토'); await expect(page.getByRole('listbox', { name: '일정 장소 검색 결과' }).getByRole('option')).toHaveCount(8);
  await input.press('ArrowDown'); await input.press('ArrowDown');
  await expect(page.getByRole('listbox', { name: '일정 장소 검색 결과' }).getByRole('option', { selected: true })).toContainText('교토 장소 2');
  await expect(input).toBeFocused(); await input.press('Enter');
  await expect(input).toHaveValue('교토 장소 2'); expect(requests).toHaveLength(0);
  await page.getByRole('button', { name: '일정 추가', exact: true }).click();
  await expect.poll(() => requests.length).toBe(1); expect(requests[0].spotUserId).toBe(2);
});

test('간편 일정 검색의 늦은 응답이 Esc로 닫은 목록을 다시 열지 않는다', async ({ page }) => {
  let release: () => void = () => {};
  const pending = new Promise<void>(resolve => { release = resolve; });
  let started = false;
  await page.route('**/api/spots?**', async route => { started = true; await pending; return reply(route, paged(spots.slice(0, 2))); });
  await page.goto('/days/1'); await page.getByRole('button', { name: '+ 간편 일정 추가' }).click();
  const input = page.getByRole('combobox', { name: '일정 장소 검색' });
  await input.fill('교토'); await expect.poll(() => started).toBe(true);
  await input.press('Escape'); release();
  await expect(input).toHaveAttribute('aria-expanded', 'false');
  await expect(page.getByRole('listbox')).toBeHidden(); await expect(input).toBeFocused();
});

test('상세 일정 검색을 키보드로 선택하고 늦은 응답이 선택을 덮어쓰지 않는다', async ({ page }) => {
  await page.route('**/api/days/1', route => reply(route, { ...day, scheduleMode: 'DETAILED' }));
  await page.goto('/days/1');
  await page.locator('[data-schedule-id="10"]').getByRole('button', { name: `${schedule.spotName} 일정 편집`, exact: true }).click();
  const input = page.getByRole('combobox', { name: '일정 장소 검색' });
  await input.fill('교토'); await expect(page.getByRole('listbox', { name: '일정 장소 검색 결과' }).getByRole('option')).toHaveCount(20);
  await input.press('ArrowUp'); await expect(page.getByRole('listbox', { name: '일정 장소 검색 결과' }).getByRole('option', { selected: true })).toContainText('교토 장소 20');
  await input.press('Enter'); await expect(input).toHaveValue('교토 장소 20');
  await expect(page.getByRole('listbox')).toBeHidden();
  await page.waitForTimeout(650); await expect(page.getByRole('listbox')).toBeHidden();
});

test('장소와 기념품의 검색 조건 초기화가 입력과 목록을 복원한다', async ({ page }) => {
  await page.goto('/spots');
  await page.getByRole('textbox', { name: '장소명 또는 주소 검색' }).fill('없는 장소');
  await page.getByRole('button', { name: '조회', exact: true }).click();
  await expect(page.getByText('조건에 맞는 장소가 없습니다.')).toBeVisible();
  await page.getByRole('button', { name: '검색 조건 초기화' }).click();
  await expect(page.getByRole('textbox', { name: '장소명 또는 주소 검색' })).toHaveValue('');
  await expect(page.getByRole('link', { name: '교토 장소 1', exact: true }).filter({ visible: true })).toBeVisible();
  const queries: string[] = [];
  await page.route('**/api/purchases?**', route => { queries.push(new URL(route.request().url()).searchParams.get('keyword') || ''); return reply(route, paged([])); });
  await page.getByRole('button', { name: '🎁 기념품', exact: true }).click();
  await expect(page.getByText('저장한 기념품이 아직 없습니다.')).toBeVisible();
  await page.getByLabel('기념품·메모 검색').fill('없는 기념품'); await page.getByRole('button', { name: '검색', exact: true }).click();
  await expect(page.getByText('조건에 맞는 기념품이 없습니다.')).toBeVisible();
  await page.getByRole('button', { name: '검색 조건 초기화' }).click();
  await expect(page.getByLabel('기념품·메모 검색')).toHaveValue('');
  await expect(page.getByText('저장한 기념품이 아직 없습니다.')).toBeVisible();
  expect(queries).toContain('없는 기념품'); expect(queries.at(-1)).toBe('');
});

test('여행 필터 초기화가 상태와 목록을 복원한다', async ({ page }) => {
  await page.route('**/api/plans?**', route => reply(route, paged(new URL(route.request().url()).searchParams.get('status') === 'PAST' ? [] : [plan])));
  await page.goto('/plans'); await page.getByRole('button', { name: '지난', exact: true }).click();
  await expect(page.getByText('조건에 맞는 여행이 없습니다.')).toBeVisible();
  await page.getByRole('button', { name: '검색 조건 초기화' }).click();
  await expect(page.getByRole('link', { name: /간사이 여행/ })).toBeVisible();
});

test('여행 수정과 내보내기 모달이 포커스를 가두고 Esc 이후 호출 요소로 복원한다', async ({ page }) => {
  await page.goto('/plans');
  const edit = page.getByRole('button', { name: '간사이 여행 수정', exact: true });
  await edit.click();
  const dialog = page.getByRole('dialog', { name: '여행 정보 수정' });
  await expect(dialog).toBeVisible();
  for (let i = 0; i < 12; i++) { await page.keyboard.press('Tab'); expect(await dialog.evaluate(node => node.contains(document.activeElement))).toBe(true); }
  await page.keyboard.press('Escape'); await expect(dialog).toBeHidden(); await expect(edit).toBeFocused();
  await page.goto('/plans/1');
  const tools = page.getByLabel('더 많은 일정 도구', { exact: true }); await tools.click();
  const exportButton = page.getByRole('button', { name: '내보내기', exact: true }); await exportButton.click();
  const exportDialog = page.getByRole('dialog', { name: '계획 내보내기' }); await expect(exportDialog).toBeVisible();
  await page.keyboard.press('Shift+Tab'); expect(await exportDialog.evaluate(node => node.contains(document.activeElement))).toBe(true);
  await page.keyboard.press('Escape'); await expect(exportDialog).toBeHidden(); await expect(tools).toBeFocused();
});

test('360px 화면에서 페이지 이동 버튼이 44px이고 현재 페이지를 알린다', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 360, height: 780 });
  await page.goto('/spots');
  const nav = page.getByRole('navigation', { name: '페이지 이동' }); await expect(nav).toBeVisible();
  await expect(nav.getByRole('button', { name: '1페이지', exact: true })).toHaveAttribute('aria-current', 'page');
  for (const button of await nav.getByRole('button').all()) { const box = await button.boundingBox(); expect(box!.height).toBeGreaterThanOrEqual(44); expect(box!.width).toBeGreaterThanOrEqual(44); }
  await nav.getByRole('button', { name: '다음 페이지' }).click();
  await expect(nav.getByRole('button', { name: '2페이지', exact: true })).toHaveAttribute('aria-current', 'page');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('mobile-spots.png'), animations: 'disabled' });
});
