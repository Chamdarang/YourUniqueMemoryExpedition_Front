import { expect, test } from '@playwright/test';

test('공유 일정은 날짜를 펼칠 때 그 날짜만 불러온다', async ({ page }) => {
  const requestedDayOrders: number[] = [];

  await page.route('**/api/public/plans/share**', async route => {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith('/events')) {
      await route.abort();
      return;
    }
    if (url.pathname.endsWith('/day-schedules')) {
      const dayOrder = Number(url.searchParams.get('dayOrder'));
      requestedDayOrders.push(dayOrder);
      await route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          message: 'Success',
          data: dayOrder === 1 ? [{
            scheduleOrder: 0,
            spotName: '첫째 날 장소',
            spotType: 'OTHER',
            lat: null,
            lng: null,
            startTime: '09:00:00',
            endTime: '10:00:00',
            duration: 60,
            movingDuration: 0,
            transportation: null,
            memo: null,
            movingMemo: null,
          }] : [],
        }),
      });
      return;
    }
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        success: true,
        message: 'Success',
        data: {
          planId: 22,
          accessMode: 'VIEW',
          planName: '공유 여행',
          planStartDate: '2026-10-10',
          planEndDate: '2026-10-11',
          planMemo: null,
          days: [
            { dayName: '교토 첫째 날', dayOrder: 1, memo: null, scheduleMode: 'DETAILED' },
            { dayName: '교토 둘째 날', dayOrder: 2, memo: null, scheduleMode: 'DETAILED' },
          ],
        },
      }),
    });
  });

  await page.route('https://maps.googleapis.com/**', route => route.abort());
  await page.goto(`/shared#${'A'.repeat(43)}`);

  await expect(page.getByRole('heading', { name: '공유 여행' })).toBeVisible();
  expect(requestedDayOrders).toEqual([]);

  await page.getByRole('button', { name: /DAY 1 · 교토 첫째 날/ }).click();
  await expect(page.getByText('첫째 날 장소')).toBeVisible();
  expect(requestedDayOrders).toEqual([1]);

  await page.getByRole('button', { name: /DAY 2 · 교토 둘째 날/ }).click();
  await expect(page.getByText('등록된 일정이 없습니다.')).toBeVisible();
  expect(requestedDayOrders).toEqual([1, 2]);
});
