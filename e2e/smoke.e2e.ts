import { expect, test } from '@playwright/test';

// 핵심 흐름만 유지하는 최소 E2E 스모크 테스트입니다.

test('비로그인 사용자는 로그인 화면으로 이동하고 가입 입력을 검증한다', async ({ page }) => {
  await page.goto('/plans');

  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByRole('heading', { name: '여행의 모든 순간을 한곳에' })).toBeVisible();

  await page.getByRole('button', { name: '회원가입' }).click();
  await page.getByLabel('아이디').fill('a-1');
  await page.getByLabel('비밀번호', { exact: true }).fill('1234');
  await page.getByLabel('비밀번호 확인').fill('1234');
  await page.getByRole('button', { name: '가입하고 시작하기' }).click();

  await expect(page.getByRole('alert')).toContainText('아이디는 영문, 숫자, 밑줄을 사용해 3~30자로');
});

test('로그인 후 홈과 하루·여행 전체 점검을 표시한다', async ({ page }) => {
  await page.route('**/api/auth/login', route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({
      success: true,
      message: 'Success',
      data: { token: 'e2e-token', username: 'testuser', expiryDate: '2099-01-01T00:00:00' },
    }),
  }));
  await page.route('**/api/plans/upcoming', route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ success: true, message: 'Success', data: null }),
  }));

  await page.goto('/login');
  await page.getByLabel('아이디').fill('testuser');
  await page.getByLabel('비밀번호').fill('test-password');
  await page.getByRole('button', { name: '로그인', exact: true }).last().click();

  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole('heading', { name: '안녕하세요, testuser님.' })).toBeVisible();
  await expect(page.getByRole('link', { name: '새 여행 계획하기' })).toBeVisible();

  await page.route('**/api/days/1', route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ success: true, message: 'Success', data: {
      id: 1, dayName: '교토 1일차', dayOrder: 1, memo: '', scheduleMode: 'DETAILED', schedules: [],
    } }),
  }));
  const daySchedules = [
    { id: 10, dayId: 1, scheduleOrder: 0, spotUserId: null, spotName: '교토역', spotType: 'OTHER', isChecked: false, isSkipped: false, lat: 34.9858, lng: 135.7588, startTime: '09:00:00', fixedStartTime: false, duration: 60, endTime: '10:00:00', movingDuration: 0, extraDuration: 0, extraMovingDuration: 0, transportation: null, memo: null, movingMemo: null },
    { id: 11, dayId: 1, scheduleOrder: 1, spotUserId: null, spotName: '기요미즈데라', spotType: 'SIGHTSEEING', isChecked: false, isSkipped: false, lat: 34.9949, lng: 135.785, startTime: '10:20:00', fixedStartTime: true, duration: 60, endTime: '11:20:00', movingDuration: 20, extraDuration: 0, extraMovingDuration: 0, transportation: 'TRAIN', memo: null, movingMemo: null },
  ];
  await page.route('**/api/schedules/day/1', route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ success: true, message: 'Success', data: daySchedules }),
  }));
  let dayAuditCalls = 0;
  await page.route('**/api/routes/day/1/audit', route => {
    dayAuditCalls += 1;
    return route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ success: true, message: 'Success', data: {
      totalLegs: 1,
      calculatedLegs: 1,
      issueCount: 1,
      plannedTotalMinutes: 20,
      estimatedTotalMinutes: 45,
      legs: [{
        fromScheduleId: 10,
        fromSpotName: '교토역',
        toScheduleId: 11,
        toSpotName: '기요미즈데라',
        transportation: 'TRAIN',
        plannedDurationMinutes: 20,
        estimatedDurationMinutes: 45,
        encodedPolyline: '',
        differenceMinutes: 25,
        estimatedArrivalTime: '10:45:00',
        fixedStartConflictMinutes: 15,
        status: 'WARNING',
        message: '고정 시작시간보다 15분 늦게 도착할 수 있습니다.',
      }],
    } }),
    });
  });
  await page.route('**/api/routes/day/1/apply', route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ success: true, message: 'Success', data: daySchedules.map(schedule => schedule.id === 11 ? { ...schedule, movingDuration: 45, startTime: '10:45:00', endTime: '11:45:00' } : schedule) }),
  }));
  await page.route('**/api/plans/1', route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ success: true, message: 'Success', data: {
      id: 1,
      planName: '교토 여행',
      planStartDate: '2026-09-01',
      planEndDate: '2026-09-01',
      planDays: 1,
      planMemo: '',
      days: [{ id: 1, dayName: '교토 1일차', dayOrder: 1, memo: '', scheduleMode: 'DETAILED' }],
    } }),
  }));
  let planAuditCalls = 0;
  await page.route('**/api/routes/plan/1/audit', route => {
    planAuditCalls += 1;
    return route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ success: true, message: 'Success', data: {
      routesCalculated: false,
      maxRouteCalculationLegs: 50,
      totalDays: 1,
      totalSchedules: 2,
      totalLegs: 1,
      issueCount: 1,
      days: [{
        dayId: 1,
        dayOrder: 1,
        dayName: '교토 1일차',
        scheduleCount: 2,
        issueCount: 1,
        scheduleIssues: [{ scheduleId: 10, spotName: '교토역', severity: 'WARNING', code: 'MISSING_LOCATION', message: '지도에 표시할 위치가 없습니다.' }],
        routeAudit: null,
      }],
    } }),
    });
  });

  await page.goto('/days/1');
  await page.getByRole('button', { name: '전체 경로 점검' }).click();
  await expect(page.getByRole('heading', { name: '하루 전체 경로 점검' })).toBeVisible();
  await expect(page.getByText('교토역 → 기요미즈데라')).toBeVisible();
  await expect(page.getByText('고정 시작시간보다 15분 늦게 도착할 수 있습니다.')).toBeVisible();
  await page.getByRole('button', { name: '이 구간 예상시간 적용' }).click();
  await expect(page.getByText('1개 구간의 예상 이동시간을 적용했습니다.')).toBeVisible();
  await page.getByRole('button', { name: /점검 결과 보기/ }).click();
  await expect(page.getByText('일정이 변경되어 이 결과는 오래되었습니다.')).toBeVisible();
  expect(dayAuditCalls).toBe(1);
  await page.getByRole('button', { name: '닫기', exact: true }).click();

  await page.goto('/plans/1');
  await page.getByRole('button', { name: '🗺️ 지도: 핀+경로' }).click();
  await expect(page.getByRole('button', { name: '📍 지도: 핀만' })).toBeVisible();
  await page.getByRole('searchbox', { name: '여행 전체 일정 검색' }).fill('기요미즈');
  await page.getByRole('button', { name: /기요미즈데라/ }).click();
  await expect(page.locator('[data-schedule-id="11"]')).toHaveClass(/ring-blue-500/);
  await expect(page.getByRole('heading', { name: '일정 편집' })).not.toBeVisible();
  await expect(page.getByText('📤 내보내기 ▾')).toBeVisible();
  await page.getByText('📤 내보내기 ▾').click();
  await expect(page.getByRole('button', { name: '📸 전체 이미지 저장' })).toBeVisible();
  await expect(page.getByRole('button', { name: /계획 파일 내보내기/ })).toBeVisible();
  await page.getByText('📤 내보내기 ▾').click();
  await page.getByRole('button', { name: '🩺 전체 점검' }).click();
  await expect(page.getByRole('heading', { name: '여행 전체 일정 점검' })).toBeVisible();
  await expect(page.getByText('지도에 표시할 위치가 없습니다.')).toBeVisible();
  await page.getByRole('button', { name: '경로까지 점검' }).click();
  await page.getByRole('button', { name: '경로까지 점검' }).last().click();
  await expect(page.getByText('실제 경로 계산을 포함한 결과입니다.')).toBeVisible();
  await expect(page.getByText('고정 시작시간보다 15분 늦게 도착할 수 있습니다.')).toBeVisible();
  await page.getByRole('button', { name: '닫기', exact: true }).click();
  await page.getByRole('button', { name: '🩺 점검 결과' }).click();
  await expect(page.getByRole('heading', { name: '여행 전체 일정 점검' })).toBeVisible();
  expect(planAuditCalls).toBe(1);
  await page.getByRole('button', { name: /일정 열기/ }).click();
  await expect(page).toHaveURL(/\/plans\/1$/);
  await expect(page.locator('[data-plan-day-id="1"]').getByText('교토역', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: /DAY 1/ })).toContainText('!');
  await expect(page.getByRole('button', { name: /문제 날짜만/ })).toBeEnabled();
  await page.getByRole('button', { name: /🩺 점검 결과/ }).click();
  await page.getByRole('button', { name: '교토역지도에 표시할 위치가 없습니다.수정 →', exact: true }).click();
  await expect(page.locator('[data-schedule-id="10"]')).toHaveClass(/ring-blue-500/);
  await expect(page.getByRole('heading', { name: '일정 편집' })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('button', { name: '📍 지도: 핀만' })).toBeVisible();
  await expect(page.locator('[data-plan-day-id="1"]').getByText('교토역', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: '교토 1일차 경로 점검' }).click();
  await expect(page.getByRole('heading', { name: '하루 전체 경로 점검' })).toBeVisible();
});
