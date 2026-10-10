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





const group = { id: 1, groupName: '교토 산책', spotCount: 1 };
const detail = { ...spots[0], groupName: [], purchases: [], spotVisitHistory: [] };

test('그룹 직접 진입과 잘못된 탭 값에서 로딩이 종료된다', async ({ page }) => {
  await page.goto('/spots?mode=GROUP');
  await expect(page.getByText('만든 그룹이 아직 없습니다.')).toBeVisible();
  await expect(page.getByRole('status', { name: '목록 불러오는 중' })).toBeHidden();
  await expect(page.getByRole('button', { name: '📂 그룹', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: '🎁 기념품', exact: true }).click();
  await expect(page.getByText('저장한 기념품이 아직 없습니다.')).toBeVisible();
  await page.goto('/spots?mode=INVALID');
  await expect(page.getByRole('button', { name: '📍 장소', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('link', { name: '교토 장소 1', exact: true }).filter({ visible: true })).toBeVisible();
});

test('그룹 목록과 상세의 오류를 빈 목록과 구분하고 재시도하며 기존 목록을 유지한다', async ({ page }) => {
  let listFail = true; let detailFail = true;
  await page.route('**/api/groups', route => reply(route, listFail ? null : [group], listFail ? 500 : 200));
  await page.route('**/api/groups/1', route => reply(route, detailFail ? null : { ...group, spots: [spots[0]] }, detailFail ? 500 : 200));
  await page.goto('/spots?mode=GROUP');
  await expect(page.getByRole('alert')).toContainText('그룹 목록을 불러오지 못했습니다.');
  await expect(page.getByText('만든 그룹이 아직 없습니다.')).toBeHidden();
  listFail = false; await page.getByRole('button', { name: '다시 시도' }).click();
  const folder = page.getByRole('button', { name: '교토 산책 그룹 열기' });
  await folder.focus(); await folder.press('Enter');
  await expect(page.getByRole('alert')).toContainText('그룹의 장소를 불러오지 못했습니다.');
  await expect(page.getByText('이 그룹에 저장된 장소가 없습니다.')).toBeHidden();
  detailFail = false; await page.getByRole('button', { name: '다시 시도' }).click();
  await expect(page.getByRole('link', { name: '교토 장소 1', exact: true }).filter({ visible: true })).toBeVisible();
  listFail = true; await page.getByRole('button', { name: /그룹 목록으로 돌아가기/ }).click();
  await expect(page.getByRole('alert')).toContainText('그룹 목록을 불러오지 못했습니다.');
  await expect(folder).toBeVisible();
});

test('뒤로 돌아간 뒤 도착한 그룹 응답이 현재 선택을 덮어쓰지 않는다', async ({ page }) => {
  let release: () => void = () => {};
  const pending = new Promise<void>(resolve => { release = resolve; });
  let started = false;
  await page.route('**/api/groups', route => reply(route, [group, { ...group, id: 2, groupName: '나라 산책' }]));
  await page.route('**/api/groups/1', async route => { started = true; await pending; return reply(route, { ...group, spots: [spots[0]] }); });
  await page.route('**/api/groups/2', route => reply(route, { ...group, id: 2, groupName: '나라 산책', spots: [spots[1]] }));
  await page.goto('/spots?mode=GROUP'); await page.getByRole('button', { name: '교토 산책 그룹 열기' }).click();
  await expect.poll(() => started).toBe(true); await page.getByRole('button', { name: /그룹 목록으로 돌아가기/ }).click();
  await page.getByRole('button', { name: '나라 산책 그룹 열기' }).click();
  await expect(page.getByRole('heading', { name: '#나라 산책' })).toBeVisible();
  const response = page.waitForResponse(res => new URL(res.url()).pathname === '/api/groups/1'); release(); await response;
  await expect(page.getByRole('heading', { name: '#나라 산책' })).toBeVisible();
  await expect(page.getByRole('link', { name: '교토 장소 2', exact: true }).filter({ visible: true })).toBeVisible();
});

test('장소 보관함의 뒤로가기와 앞으로가기가 URL과 탭을 함께 바꾼다', async ({ page }) => {
  await page.goto('/spots?keep=value');
  await page.getByRole('button', { name: '📂 그룹', exact: true }).click();
  await expect(page.getByText('만든 그룹이 아직 없습니다.')).toBeVisible();
  await page.getByRole('button', { name: '🎁 기념품', exact: true }).click();
  await expect(page).toHaveURL(/keep=value.*mode=PURCHASE/);
  await page.goBack(); await expect(page.getByRole('button', { name: '📂 그룹', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await page.goBack(); await expect(page.getByRole('button', { name: '📍 장소', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await page.goForward(); await expect(page.getByRole('button', { name: '📂 그룹', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await page.goForward(); await expect(page.getByRole('button', { name: '🎁 기념품', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByText('저장한 기념품이 아직 없습니다.')).toBeVisible();
});

test('장소 수정은 검증·중복 저장 방지·실패 입력 유지·재시도를 제공한다', async ({ page }) => {
  let current = { ...detail }; let fail = true; const requests: Record<string, unknown>[] = [];
  let release: () => void = () => {};
  const pending = new Promise<void>(resolve => { release = resolve; });
  await page.route('**/api/spots/1', async route => {
    if (route.request().method() === 'GET') return reply(route, current);
    const value = route.request().postDataJSON(); requests.push(value); await pending;
    if (fail) return reply(route, null, 500);
    current = { ...current, ...value }; return reply(route, current);
  });
  await page.goto('/spots/1'); await page.getByRole('button', { name: /정보 수정/ }).click();
  const form = page.getByRole('form', { name: '장소 정보 수정' }); const name = form.getByRole('textbox', { name: '장소 이름', exact: true });
  await name.fill('   '); await form.getByRole('button', { name: '저장', exact: true }).click();
  await expect(name).toBeFocused(); await expect(form.getByRole('alert')).toHaveText('장소 이름을 입력해 주세요.'); expect(requests).toHaveLength(0);
  await name.fill('  새 장소 이름  '); await form.getByLabel('설명 (선택)').fill('새로운 장소 메모');
  await form.evaluate(node => { node.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })); node.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })); });
  await expect.poll(() => requests.length).toBe(1); await expect(name).toBeDisabled(); await expect(form.getByRole('button', { name: '취소', exact: true })).toBeDisabled();
  expect(requests[0]).toEqual({ spotName: '새 장소 이름', spotType: 'OTHER', description: '새로운 장소 메모' });
  await page.getByRole('button', { name: '← 목록', exact: true }).click();
  const leaving = page.getByRole('dialog', { name: '저장되지 않은 변경사항' }); await expect(leaving).toBeVisible();
  await leaving.getByRole('button', { name: '취소', exact: true }).click(); await expect(name).toBeDisabled();
  release(); await expect(form.getByRole('alert')).toContainText('장소 정보를 저장하지 못했습니다.'); await expect(name).toHaveValue('  새 장소 이름  '); await expect(name).toBeEnabled();
  fail = false; await form.getByRole('button', { name: '저장 다시 시도' }).click();
  await expect(page.getByRole('heading', { name: '새 장소 이름', exact: true })).toBeVisible(); expect(requests).toHaveLength(2);
  await page.getByRole('button', { name: '← 목록', exact: true }).click(); await expect(page).toHaveURL(/\/spots$/);
  await expect(page.getByRole('dialog', { name: '저장되지 않은 변경사항' })).toBeHidden();
});

test('수정한 장소를 두고 이동하면 확인하고 취소하면 초안을 유지한다', async ({ page }) => {
  await page.route('**/api/spots/1', route => reply(route, detail));
  await page.goto('/spots/1'); await page.getByRole('button', { name: /정보 수정/ }).click();
  const name = page.getByRole('textbox', { name: '장소 이름', exact: true }); await name.fill('작성 중인 이름');
  await page.getByRole('button', { name: '← 목록', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: '저장되지 않은 변경사항' }); await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: '취소', exact: true }).click(); await expect(name).toHaveValue('작성 중인 이름'); await expect(page).toHaveURL(/\/spots\/1$/);
  await page.getByRole('link', { name: '✈️ 내 여행', exact: true }).click(); await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: '화면 떠나기' }).click(); await expect(page).toHaveURL(/\/plans$/);
});

test('장소 수정 중 새로고침은 브라우저 확인으로 보호하고 취소는 초안을 유지한다', async ({ page }) => {
  await page.route('**/api/spots/1', route => reply(route, detail));
  await page.goto('/spots/1'); await page.getByRole('button', { name: /정보 수정/ }).click();
  const name = page.getByRole('textbox', { name: '장소 이름', exact: true }); await name.fill('새로고침 전 초안');
  let warned = false;
  page.once('dialog', async dialog => { warned = dialog.type() === 'beforeunload'; await dialog.dismiss(); });
  await page.reload({ timeout: 2000 }).catch(() => {}); expect(warned).toBe(true); await expect(name).toHaveValue('새로고침 전 초안');
  await page.getByRole('form', { name: '장소 정보 수정' }).getByRole('button', { name: '취소', exact: true }).click();
  await page.reload(); await expect(page.getByRole('heading', { name: '교토 장소 1', exact: true })).toBeVisible();
});

test('360px 상세 일정의 편집·이동·추가 버튼과 여유시간을 키보드로 사용한다', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 360, height: 780 });
  const second = { ...schedule, id: 11, scheduleOrder: 1, spotName: '다음 장소', startTime: '11:00:00' };
  await page.route('**/api/days/1', route => reply(route, { ...day, scheduleMode: 'DETAILED' }));
  await page.route('**/api/schedules/day/1', route => reply(route, [schedule, second]));
  await page.goto('/days/1');
  const row = page.locator('[data-schedule-id="11"]'); const move = row.getByRole('button', { name: '➕ 이동 시간 추가', exact: true });
  await expect(move).toBeVisible(); await move.focus(); await move.press('Enter'); await expect(row.getByText('이동 경로 설정', { exact: true })).toBeVisible();
  const moveBuffer = row.getByRole('button', { name: '이동 여유시간 5분' }); await moveBuffer.focus(); await moveBuffer.press('Space'); await expect(moveBuffer).toHaveAttribute('aria-pressed', 'true');
  await row.getByRole('button', { name: '취소', exact: true }).click();
  const edit = row.getByRole('button', { name: '다음 장소 일정 편집' }); await edit.focus(); await edit.press('Enter'); await expect(row.getByText('일정 편집', { exact: true })).toBeVisible();
  const timeBounds = await row.getByLabel('시작 시간', { exact: true }).boundingBox();
  const stayBounds = await row.getByLabel('기본 체류(분)', { exact: true }).boundingBox();
  expect(timeBounds!.width).toBeGreaterThanOrEqual(180);
  expect(stayBounds!.y).toBeGreaterThanOrEqual(timeBounds!.y + timeBounds!.height);
  for (const button of await row.getByRole('button', { name: /일정 여유시간/ }).all()) { const bounds = await button.boundingBox(); expect(bounds!.height).toBeGreaterThanOrEqual(44); expect(bounds!.width).toBeGreaterThanOrEqual(44); }
  expect(await row.evaluate(node => node.scrollWidth <= node.clientWidth)).toBe(true);
  await row.getByLabel('시작 시간', { exact: true }).scrollIntoViewIfNeeded(); await page.screenshot({ path: testInfo.outputPath('mobile-detailed-edit.png'), animations: 'disabled' });
  await row.getByRole('button', { name: '취소', exact: true }).click(); await expect(row.getByRole('button', { name: '다음 장소 다음에 일정 추가' })).toBeVisible();
});

test('다음 일정 추가 버튼은 키보드로 실제 추가 요청을 보낸다', async ({ page }) => {
  const requests: Record<string, unknown>[] = [];
  await page.route('**/api/days/1', route => reply(route, { ...day, scheduleMode: 'DETAILED' }));
  await page.route('**/api/schedules/day/1', route => { if (route.request().method() === 'POST') requests.push(route.request().postDataJSON()); return reply(route, [schedule]); });
  await page.goto('/days/1'); const add = page.getByRole('button', { name: `${schedule.spotName} 다음에 일정 추가` });
  await add.focus(); await add.press('Enter'); await expect.poll(() => requests.length).toBe(1); expect(requests[0].scheduleOrder).toBe(1);
});
