import { expect, test } from '@playwright/test';

test('예약 저장 중에는 입력과 다른 예약으로의 편집 전환을 막는다', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('accessToken', 'test-token');
    localStorage.setItem('username', 'test');
    localStorage.setItem('yume:page-guide:test:plan-detail', 'done');
  });
  const reservations = [1, 2].map(id => ({ id, title: `예약 ${id}`, type: 'OTHER', status: 'RESERVED', dayId: null }));
  let release!: () => void;
  const waiting = new Promise<void>(resolve => { release = resolve; });
  await page.route('**/api/**', async route => {
    const path = new URL(route.request().url()).pathname;
    if (!path.startsWith('/api/')) { await route.continue(); return; }
    let data: unknown = [];
    if (path === '/api/plans/1') data = { id: 1, planName: '예약 검증 여행', planDays: 1, planMemo: '', accessRole: 'OWNER', days: [] };
    if (path === '/api/plans/1/reservations') data = reservations;
    if (path === '/api/plans/1/reservations/1') {
      await waiting;
      data = { ...reservations[0], ...route.request().postDataJSON() };
    }
    await route.fulfill({ json: { success: true, data } });
  });
  await page.route('https://maps.googleapis.com/**', route => route.abort());
  await page.goto('/plans/1');
  await page.getByRole('button', { name: /예약 정보/ }).click();
  const dialog = page.getByRole('dialog', { name: '예약 정보', exact: true });
  await dialog.locator('article').filter({ hasText: '예약 1' }).getByRole('button', { name: '수정', exact: true }).click();
  await dialog.getByLabel('예약 이름 *', { exact: true }).fill('수정한 예약 1');
  await dialog.getByRole('button', { name: '변경사항 저장' }).click();
  await expect(dialog.getByLabel('예약 이름 *', { exact: true })).toBeDisabled();
  const otherEdit = dialog.locator('article').filter({ hasText: '예약 2' }).getByRole('button', { name: '수정', exact: true });
  await expect(otherEdit).toBeDisabled();
  await otherEdit.evaluate(button => (button as HTMLButtonElement).click());
  await expect(dialog.getByLabel('예약 이름 *', { exact: true })).toHaveValue('수정한 예약 1');
  release();
  await expect(dialog.getByLabel('예약 이름 *', { exact: true })).toBeEnabled();
  await expect(dialog.locator('article').filter({ hasText: '수정한 예약 1' })).toBeVisible();
});
