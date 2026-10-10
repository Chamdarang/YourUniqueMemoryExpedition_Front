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


test('목록 카드는 키보드로 여는 실제 링크다', async ({ page }) => {
  await page.goto('/days');
  const card = page.getByRole('link', { name: /교토 하루 코스/ });
  await expect(card).toHaveAttribute('href', '/days/1');
  await card.focus(); await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/days\/1$/);
  await page.goto('/plans');
  const travel = page.getByRole('link', { name: /간사이 여행/ });
  await expect(travel).toHaveAttribute('href', '/plans/1');
  await travel.focus(); await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/plans\/1$/);
});

test('확인창의 Tab 순환, Escape 취소, 호출 버튼 포커스 복원', async ({ page }) => {
  await page.goto('/days');
  const opener = page.getByRole('button', { name: '로그아웃', exact: true }).filter({ visible: true });
  await opener.click();
  const dialog = page.getByRole('dialog', { name: '로그아웃' });
  const cancel = dialog.getByRole('button', { name: '취소' });
  const accept = dialog.getByRole('button', { name: '로그아웃' });
  await expect(cancel).toBeFocused();
  await page.keyboard.press('Shift+Tab'); await expect(accept).toBeFocused();
  await page.keyboard.press('Tab'); await expect(cancel).toBeFocused();
  await page.keyboard.press('Escape'); await expect(dialog).toBeHidden();
  await expect(opener).toBeFocused(); await expect(page).toHaveURL(/days$/);
});

test('모바일은 주요 메뉴 5개이고 알림은 하단 메뉴와 지도 버튼 영역을 피한다', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 360, height: 780 });
  await page.goto('/days');
  const nav = page.getByRole('navigation', { name: '주요 메뉴' });
  await expect(nav.getByRole('link')).toHaveCount(5);
  await expect(page.getByRole('button', { name: '현재 화면 가이드 다시보기' })).toBeVisible();
  await page.locator('[title="삭제"]').click();
  await page.getByRole('dialog').getByRole('button', { name: '삭제', exact: true }).click();
  const undo = page.getByRole('button', { name: '실행 취소' });
  await expect(undo).toBeVisible();
  const toastBox = await page.locator('.yume-toast-region').boundingBox();
  const navBox = await nav.boundingBox();
  expect(toastBox!.y + toastBox!.height).toBeLessThan(navBox!.y - 60);
  expect(toastBox!.x).toBeGreaterThanOrEqual(0);
  await page.screenshot({ path: testInfo.outputPath('mobile-toast.png') });
  await undo.click();
});

test('가이드는 3단계로 안내하고 여행 폼을 자동으로 열지 않는다', async ({ page }) => {
  await page.addInitScript(() => localStorage.removeItem('yume:page-guide:testuser:plans'));
  await page.goto('/plans');
  const dialog = page.getByRole('dialog', { name: '새 여행을 만들어요' });
  await expect(dialog).toContainText('1/3');
  await dialog.getByRole('button', { name: '다음' }).click();
  await expect(page.getByRole('dialog')).toContainText('2/3');
  await expect(page.locator('[data-guide-target="plans-create-form"]')).toBeHidden();
  await page.keyboard.press('Escape'); await expect(page.getByRole('dialog')).toBeHidden();
  await page.getByRole('button', { name: '가이드 다시보기', exact: true }).click();
  await expect(page.getByRole('dialog')).toContainText('1/3');
});

test('장소 가이드는 사용자가 선택한 기념품 탭을 유지한다', async ({ page }) => {
  await page.goto('/spots?mode=PURCHASE');
  await page.getByRole('button', { name: '가이드 다시보기', exact: true }).click();
  await expect(page.getByRole('dialog')).toContainText('1/2');
  await page.getByRole('dialog').getByRole('button', { name: '다음' }).click();
  await expect(page.getByRole('dialog')).toContainText('2/2');
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: '+ 새 기념품 추가' })).toBeVisible();
});

test('기념품 폼은 필드 오류와 저장 실패를 표시하고 입력을 유지한다', async ({ page }, testInfo) => {
  let requests = 0;
  await page.route('**/api/purchases/spot/1', route => { requests++; return reply(route, null, 500); });
  await page.goto('/spots?mode=PURCHASE');
  await page.getByRole('button', { name: '+ 새 기념품 추가' }).click();
  await page.getByRole('button', { name: '저장하기', exact: true }).click();
  const name = page.getByLabel('기념품 이름 (필수)');
  await expect(name).toBeFocused(); await expect(name).toHaveAttribute('aria-invalid', 'true');
  await expect(page.getByText('연결할 장소를 선택해 주세요.')).toBeVisible();
  expect(requests).toBe(0);
  await name.fill('  교토 부적  ');
  await page.getByLabel('장소 (필수)', { exact: true }).selectOption('1');
  await page.getByRole('button', { name: '저장하기', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('입력 내용을 유지');
  await expect(name).toHaveValue('  교토 부적  ');
  await expect(page.getByLabel('가격 (선택)')).toBeVisible();
  expect(requests).toBe(1);
  await page.screenshot({ path: testInfo.outputPath('purchase-form.png') });
});

test('탐색 자동완성은 방향키·Enter 선택과 Escape 닫기를 지원한다', async ({ page }) => {
  await page.route('**/@vis*react-google-maps.js*', route => route.fulfill({
    contentType: 'application/javascript',
    body: `
      export const APIProvider = ({ children }) => children;
      export const Map = ({ children }) => children;
      export const AdvancedMarker = () => null;
      export const useMap = () => null;
      class Place {
        constructor({ id }) { this.id = id; this.displayName = id === 'second' ? '교토역' : '교토타워'; this.formattedAddress = '교토'; this.location = { lat: () => 35, lng: () => 135 }; this.types = []; }
        async fetchFields() {} async isOpen() { return true; }
      }
      const places = { Place, AutocompleteSuggestion: { async fetchAutocompleteSuggestions() {
        return { suggestions: ['first', 'second'].map((id, i) => ({ placePrediction: { placeId: id, mainText: { text: i ? '교토역' : '교토타워' }, text: { text: i ? '교토역' : '교토타워' } } })) };
      } } };
      export const useMapsLibrary = name => name === 'places' ? places : null;
    `,
  }));
  await page.addInitScript(() => localStorage.setItem('yume:page-guide:testuser:explore', 'done'));
  await page.goto('/map');
  const input = page.getByRole('combobox', { name: '장소명 또는 주소 검색' });
  await input.fill('교토');
  await expect(page.getByRole('option')).toHaveCount(2);
  await input.press('ArrowDown');
  await expect(page.getByRole('option', { name: '교토타워' })).toHaveAttribute('aria-selected', 'true');
  await input.press('ArrowDown'); await input.press('Enter');
  await expect(input).toHaveValue('교토역');
  await expect(page.getByRole('listbox')).toBeHidden();
  await input.fill('교토 다시 검색');
  await expect(page.getByRole('option')).toHaveCount(2);
  await input.press('ArrowUp');
  await expect(page.getByRole('option', { name: '교토역' })).toHaveAttribute('aria-selected', 'true');
  await input.press('Escape');
  await expect(page.getByRole('listbox')).toBeHidden();
  await expect(input).toBeFocused();
});
