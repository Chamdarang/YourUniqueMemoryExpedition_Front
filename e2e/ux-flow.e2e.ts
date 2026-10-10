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
      return reply(route, paged(matches, Number(url.searchParams.get('page') || 0)));
    }
    return reply(route, []);
  });
  await page.route('https://maps.googleapis.com/**', route => route.abort());
}

test.beforeEach(async ({ page }) => { await setup(page); });



const purchase = { id: 30, spotUserId: 1, spotName: '교토 장소 1', itemName: '교토 부적', kind: 'SOUVENIR', status: 'WANT', category: '', price: 800, currency: 'JPY', quantity: 2, acquiredDate: '2026-10-07', note: '잊지 않고 구매하기' };

test('하루 코스 검색 결과 없음과 초기화가 목록에 반영된다', async ({ page }) => {
  const keywords: string[] = [];
  await page.route('**/api/days/independent?**', route => {
    const keyword = new URL(route.request().url()).searchParams.get('keyword') || '';
    keywords.push(keyword);
    return reply(route, paged(day.dayName.includes(keyword) ? [day] : []));
  });
  await page.goto('/days');
  const input = page.getByRole('textbox', { name: '하루 코스 제목 검색' });
  await input.fill('  없는 코스  '); await input.press('Enter');
  await expect(page.getByText('“없는 코스”에 맞는 하루 코스가 없습니다.')).toBeVisible();
  await expect(page.getByText('등록된 하루 코스가 없습니다.')).toBeHidden();
  await page.getByRole('button', { name: '검색 초기화' }).click();
  await expect(input).toHaveValue('');
  await expect(page.getByRole('link', { name: /교토 하루 코스/ })).toBeVisible();
  expect(keywords).toContain('없는 코스');
});

for (const width of [390, 1280]) {
  test(`기념품 수정 시 실제 스크롤 영역에서 폼으로 이동하고 이름에 포커스한다 (${width}px)`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 780 });
    const purchases = Array.from({ length: 20 }, (_, i) => ({ ...purchase, id: i + 1, itemName: `검증 기념품 ${i + 1}` }));
    await page.route('**/api/purchases?**', route => reply(route, paged(purchases)));
    await page.goto('/spots?mode=PURCHASE');
    const edit = page.getByRole('button', { name: '검증 기념품 20 수정', exact: true }).filter({ visible: true });
    await edit.scrollIntoViewIfNeeded();
    expect(await page.locator('main').evaluate(node => node.scrollTop)).toBeGreaterThan(100);
    await edit.click();
    const input = page.getByLabel('기념품 이름 (필수)');
    await expect(input).toHaveValue('검증 기념품 20'); await expect(input).toBeFocused();
    await expect(page.getByRole('form', { name: '기념품 정보 수정' }).getByRole('heading')).toBeInViewport();
    await expect(page.getByLabel('수량', { exact: true })).toHaveValue('2');
    await page.screenshot({ path: testInfo.outputPath(`purchase-edit-${width}.png`) });
    await page.getByRole('button', { name: '취소', exact: true }).click();
    await page.getByRole('button', { name: '+ 새 기념품 추가' }).click();
    await expect(page.getByLabel('기념품 이름 (필수)')).toHaveValue('');
    await expect(page.getByLabel('수량', { exact: true })).toHaveValue('1');
  });
}

test('장소 상세도 공통 기념품 폼에서 검증·실패 유지·재시도·수정한다', async ({ page }) => {
  let purchases = [purchase];
  let fail = true;
  let saves = 0;
  await page.route('**/api/spots/1', route => reply(route, { ...spots[0], groupName: [], spotVisitHistory: [], purchases }));
  await page.route('**/api/purchases/spot/1', route => {
    saves++;
    if (fail) return reply(route, null, 500);
    const value = route.request().postDataJSON();
    purchases = [...purchases, { ...purchase, ...value, id: 31 }];
    return reply(route, purchases[1]);
  });
  await page.route('**/api/purchases/30', route => {
    saves++;
    const value = route.request().postDataJSON();
    purchases[0] = { ...purchase, ...value };
    return reply(route, purchases[0]);
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/spots/1');
  await page.getByRole('button', { name: '+ 새 기념품 추가' }).click();
  const form = page.getByRole('form', { name: '새 기념품 등록' });
  const name = form.getByLabel('기념품 이름 (필수)');
  await expect(name).toBeFocused();
  await form.getByRole('button', { name: '저장하기' }).click();
  await expect(name).toHaveAttribute('aria-invalid', 'true'); expect(saves).toBe(0);
  await name.fill('  나라 자석  ');
  const quantity = form.getByLabel('수량', { exact: true });
  await quantity.fill('0');
  await form.getByRole('button', { name: '저장하기' }).click();
  await expect(quantity).toBeFocused(); await expect(form.getByText('수량은 1 이상의 정수로 입력해 주세요.')).toBeVisible();
  expect(saves).toBe(0); await quantity.fill('3');
  await form.getByRole('button', { name: '저장하기' }).click();
  await expect(form.getByRole('alert')).toContainText('입력 내용을 유지');
  await expect(name).toHaveValue('  나라 자석  '); await expect(quantity).toHaveValue('3');
  fail = false;
  await form.getByRole('button', { name: '저장하기' }).click();
  await expect(page.getByRole('heading', { name: '나라 자석', exact: true })).toBeVisible();
  await page.getByRole('button', { name: '교토 부적 수정', exact: true }).click();
  const edit = page.getByRole('form', { name: '기념품 정보 수정' });
  await expect(edit.getByLabel('기념품 이름 (필수)')).toHaveValue('교토 부적');
  await edit.getByLabel('기념품 이름 (필수)').fill('변경한 교토 부적');
  await edit.getByRole('button', { name: '수정 완료' }).click();
  await expect(page.getByRole('heading', { name: '변경한 교토 부적', exact: true })).toBeVisible();
  expect(saves).toBe(3);
});


test('공통 기념품 폼은 저장 중 중복 요청을 막고 실패 후 다시 입력할 수 있다', async ({ page }) => {
  let count = 0;
  let release!: () => void;
  const hold = new Promise<void>(resolve => { release = resolve; });
  await page.route('**/api/purchases/spot/1', async route => {
    count++; await hold; return reply(route, null, 500);
  });
  await page.goto('/spots?mode=PURCHASE');
  await page.getByRole('button', { name: '+ 새 기념품 추가' }).click();
  const name = page.getByLabel('기념품 이름 (필수)');
  await name.fill('중복 방지 검증');
  await page.getByLabel('장소 (필수)', { exact: true }).selectOption('1');
  await page.getByRole('button', { name: '저장하기', exact: true }).evaluate(button => { (button as HTMLButtonElement).click(); (button as HTMLButtonElement).click(); });
  await expect.poll(() => count).toBe(1);
  await expect(name).toBeDisabled();
  await expect(page.getByRole('button', { name: '취소', exact: true })).toBeDisabled();
  release();
  await expect(page.getByRole('alert')).toContainText('입력 내용을 유지');
  await expect(name).toBeEnabled(); await expect(name).toHaveValue('중복 방지 검증');
});
