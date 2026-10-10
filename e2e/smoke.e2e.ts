import { expect, test } from '@playwright/test';

// 핵심 흐름만 유지하는 최소 E2E 스모크 테스트입니다.
test.beforeEach(async ({ page }) => {
  // Keep onboarding and unrelated collaboration requests out of these flow tests.
  await page.addInitScript(() => {
    localStorage.setItem('yume:first-visit-guide:testuser', 'done');
    for (const id of ['plans', 'plan-detail', 'days', 'day-detail', 'spots']) {
      localStorage.setItem(`yume:page-guide:testuser:${id}`, 'done');
    }
  });
  await page.route(/\/api\/plans\/(?:shared|invitations|\d+\/collaborators)(?:\?|$)/, route => route.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify({ success: true, message: 'Success', data: [] }),
  }));
});

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

test('로그인 후 홈과 하루 경로 점검을 표시한다', async ({ page }) => {
  await page.route('**/api/auth/login', route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({
      success: true,
      message: 'Success',
      data: { token: 'e2e-token', username: 'testuser', nickname: 'testuser', expiryDate: '2099-01-01T00:00:00' },
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
});

test('기념품 장부에서 장소를 선택해 기념품을 등록한다', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('username', 'testuser');
    localStorage.setItem('accessToken', 'e2e-token');
  });

  const spot = {
    id: 7,
    placeId: 'place-7',
    spotName: '교토역',
    displayName: null,
    spotType: 'STATION',
    address: '교토시 시모교구',
    shortAddress: '교토',
    website: null,
    googleMapUrl: null,
    lat: 34.9858,
    lng: 135.7588,
    isVisit: false,
    description: '',
    metadata: {},
    userMetadata: {},
  };
  let purchases: Array<Record<string, unknown>> = [];
  await page.route(/\/api\/spots(?:\?.*)?$/, route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ success: true, message: 'Success', data: {
      content: [spot], totalPages: 1, totalElements: 1, size: 20, number: 0, first: true, last: true, empty: false,
    } }),
  }));
  await page.route(/\/api\/purchases(?:\?.*)?$/, route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ success: true, message: 'Success', data: {
      content: purchases, totalPages: 1, totalElements: purchases.length, size: 20, number: 0, first: true, last: true, empty: purchases.length === 0,
    } }),
  }));
  await page.route('**/api/purchases/spot/7', async route => {
    const request = route.request().postDataJSON() as Record<string, unknown>;
    expect(request.itemName).toBe('교토 여행 자석');
    expect(request.status).toBe('WANT');
    purchases = [{ id: 30, spotUserId: 7, spotName: '교토역', ...request }];
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ success: true, message: 'Success', data: purchases[0] }),
    });
  });

  await page.goto('/spots?mode=PURCHASE');
  await expect(page.getByRole('heading', { name: '기념품 장부' })).toBeVisible();
  await page.getByRole('button', { name: '+ 새 기념품 추가' }).click();
  await page.getByLabel('기념품 이름 (필수)').fill('교토 여행 자석');
  await page.getByRole('combobox').first().selectOption('7');
  await page.getByRole('button', { name: '저장하기' }).click();

  await expect(page.getByText('기념품을 추가했습니다. 🎁')).toBeVisible();
  await expect(page.getByRole('table').getByText('교토 여행 자석')).toBeVisible();
});

test('CSV 일정 파일을 분석하고 미리보기 후 계획으로 등록한다', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('username', 'testuser');
    localStorage.setItem('accessToken', 'e2e-token');
  });

  const importedPlan = {
    id: 51,
    planName: '교토 CSV 여행',
    planStartDate: '2026-10-04',
    planEndDate: '2026-10-04',
    planDays: 1,
    planMemo: '범용 파일 Import: 교토 CSV 여행.csv',
  };
  await page.route(/\/api\/plans(?:\?.*)?$/, route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ success: true, message: 'Success', data: {
      content: [importedPlan], totalPages: 1, totalElements: 1, size: 10, number: 0, first: true, last: true, empty: false,
    } }),
  }));
  await page.route(/\/api\/plans\/import\/file\/analyze(?:\?.*)?$/, route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ success: true, message: 'Success', data: {
      fileName: '교토 CSV 여행.csv',
      fileType: 'CSV',
      detectedCharset: 'UTF-8',
      detectedDelimiter: ',',
      sheets: [{
        name: '교토 CSV 여행.csv',
        rowCount: 3,
        suggestedHeaderRow: 1,
        columns: [
          { index: 0, label: '일차', samples: ['1일'] },
          { index: 1, label: '시작시간', samples: ['09:00', '10:30'] },
          { index: 2, label: '장소', samples: ['교토역', '기요미즈데라'] },
        ],
      }],
    } }),
  }));
  const previewPlan = {
    formatVersion: 1,
    planName: '교토 CSV 여행',
    planStartDate: '2026-10-04',
    planEndDate: '2026-10-04',
    planDays: 1,
    planMemo: '범용 파일 Import: 교토 CSV 여행.csv',
    days: [{
      dayName: '1일차',
      dayOrder: 1,
      memo: '',
      scheduleMode: 'DETAILED',
      schedules: [
        { scheduleOrder: 0, spotUserId: null, spotName: '교토역', spotType: 'STATION', lat: null, lng: null, isChecked: false, isSkipped: false, startTime: '09:00:00', fixedStartTime: true, duration: 90, endTime: '10:30:00', movingDuration: 0, extraDuration: 0, extraMovingDuration: 0, transportation: null, memo: null, movingMemo: null },
        { scheduleOrder: 1, spotUserId: null, spotName: '기요미즈데라', spotType: 'RELIGIOUS_SITE', lat: null, lng: null, isChecked: false, isSkipped: false, startTime: '10:30:00', fixedStartTime: true, duration: 60, endTime: '11:30:00', movingDuration: 0, extraDuration: 0, extraMovingDuration: 0, transportation: null, memo: null, movingMemo: null },
      ],
    }],
  };
  await page.route('**/api/plans/import/file/preview', route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ success: true, message: 'Success', data: {
      plan: previewPlan,
      summary: { sourceRows: 2, importedDays: 1, importedSchedules: 2, skippedRows: 0, fixedStartTimes: 2, newSpots: 2 },
      issues: [],
    } }),
  }));
  await page.route('**/api/plans/import', async route => {
    const request = route.request().postDataJSON() as typeof previewPlan;
    expect(request.planName).toBe('교토 CSV 여행');
    expect(request.days[0].schedules).toHaveLength(2);
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ success: true, message: 'Success', data: importedPlan }),
    });
  });

  await page.goto('/plans');
  await page.getByRole('button', { name: '📂 불러오기' }).click();
  await page.locator('input[type="file"]').setInputFiles({
    name: '교토 CSV 여행.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from('일차,시작시간,장소\n1일,09:00,교토역\n,10:30,기요미즈데라\n', 'utf-8'),
  });

  await expect(page.getByRole('heading', { name: '파일에서 계획 가져오기' })).toBeVisible();
  await expect(page.getByText('자동 분석 완료')).toBeVisible();
  await page.getByLabel('여행 시작일').fill('2026-10-04');
  await page.getByRole('button', { name: '자동 설정으로 미리보기' }).click();
  await expect(page.getByText('기요미즈데라')).toBeVisible();
  await page.getByRole('button', { name: '이 계획으로 등록' }).click();

  await expect(page.getByRole('heading', { name: '계획을 가져왔습니다' })).toBeVisible();
  await expect(page.getByRole('heading', { name: '교토 CSV 여행' })).toBeVisible();
  await expect(page.getByText('FILE Import 결과')).toBeVisible();
});

test('여행 전체 점검에서 일정 문제와 요약을 표시한다', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('username', 'testuser');
    localStorage.setItem('accessToken', 'e2e-token');
  });

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
  let auditCalls = 0;
  await page.route('**/api/routes/plan/1/audit', route => {
    auditCalls += 1;
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
          scheduleIssues: [{
            scheduleId: 11,
            spotName: '교토역',
            severity: 'WARNING',
            code: 'MISSING_LOCATION',
            message: '지도에 표시할 위치가 없습니다.',
          }],
          routeAudit: null,
        }],
      } }),
    });
  });

  await page.goto('/plans/1');
  await page.locator('summary[aria-label="더 많은 일정 도구"]').click();
  await page.getByRole('button', { name: '전체 점검', exact: true }).click();

  await expect(page.getByRole('heading', { name: '여행 전체 일정 점검' })).toBeVisible();
  const issueSummary = page.getByText('발견 항목').locator('..');
  await expect(issueSummary.getByText('1개', { exact: true })).toBeVisible();
  await expect(page.getByRole('article').getByText('교토 1일차')).toBeVisible();
  await expect(page.getByText('지도에 표시할 위치가 없습니다.')).toBeVisible();
  expect(auditCalls).toBe(1);
});
