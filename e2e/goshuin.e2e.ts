import { randomBytes } from 'node:crypto';
import { expect, test, type APIResponse } from '@playwright/test';

test('고슈인첩 모바일·PC와 실제 저장·정렬·사진·삭제 보존을 확인한다', async ({ page, request }) => {
  test.skip(process.env.YUME_LIVE_API !== '1', '로컬 개발 서버 검증을 명시적으로 활성화해야 합니다.');
  const api = 'http://localhost:8080';
  let username = 'test', password = 'test', temporary = false;
  let login = await request.post(api + '/api/auth/login', { data: { username, password } });
  if (!login.ok()) {
    expect(login.status()).not.toBe(429);
    username = 'goshuin_' + randomBytes(6).toString('hex'); password = randomBytes(16).toString('hex');
    const signup = await request.post(api + '/api/auth/signup', { data: { username, password } });
    expect(signup.ok()).toBeTruthy(); temporary = true;
    login = await request.post(api + '/api/auth/login', { data: { username, password } });
  }
  expect(login.ok()).toBeTruthy();
  const auth = (await login.json()).data;
  const headers = { Authorization: 'Bearer ' + auth.token };
  const prefix = '검증_' + randomBytes(4).toString('hex');
  const bookIds = new Set<number>(), recordIds = new Set<number>(), purchaseIds = new Set<number>(), spotIds = new Set<number>();
  const groupIds = new Set<number>();
  const failures: string[] = [];
  page.on('pageerror', error => failures.push(error.message));
  const data = async (response: APIResponse) => { expect(response.ok(), await response.text()).toBeTruthy(); const result = await response.json(); expect(result.success).toBeTruthy(); return result.data; };
  const getEntry = (id: number) => request.get(api + '/api/goshuin/records/' + id, { headers }).then(data);
  try {
    await page.addInitScript(({ token, username, expiry }) => {
      localStorage.setItem('accessToken', token); localStorage.setItem('username', username);
      localStorage.setItem('tokenExpiry', expiry);
      for (const id of ['spots', 'spot-detail']) localStorage.setItem(`yume:page-guide:${username}:${id}`, 'done');
    }, { token: auth.token, username, expiry: auth.expiryDate });
    for (const width of [320, 1280]) {
      await page.setViewportSize({ width, height: 900 });
      let headerShape: unknown;
      for (const [tab, path] of [['spot', '/spots'], ['purchase', '/spots?mode=PURCHASE'], ['goshuin', '/goshuin-books']] as const) {
        await page.goto(path);
        const header = page.locator('[data-records-header]'); await expect(header).toBeVisible();
        const shape = await header.evaluate(element => { const rect = element.getBoundingClientRect(); const tabs = element.querySelector('nav')!.getBoundingClientRect(); return [rect.x, rect.y, rect.width, rect.height, tabs.x, tabs.y, tabs.width, tabs.height]; });
        if (headerShape) expect(shape).toEqual(headerShape); else headerShape = shape;
        await header.screenshot({ path: `../artifacts/goshuin-test/header-${tab}-${width}.png` });
      }
    }
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/goshuin-books');
    const mobileMenu = page.getByRole('navigation', { name: '주요 메뉴' }).filter({ visible: true });
    await expect(mobileMenu.getByRole('link')).toHaveCount(5);
    await expect(mobileMenu.getByRole('link', { name: '내 기록', exact: true })).toHaveClass(/text-blue-600/);
    await expect(page.getByRole('navigation', { name: '내 기록 탭' }).getByRole('link', { name: '고슈인', exact: true })).toHaveAttribute('aria-current', 'page');
    await page.getByRole('button', { name: '새 첩', exact: true }).first().click();
    let dialog = page.getByRole('region', { name: '새 고슈인첩', exact: true });
    await dialog.getByLabel('첩 이름 (필수)').fill(prefix + ' 교토 여행첩');
    await dialog.getByRole('button', { name: '저장', exact: true }).click();
    await expect(page).toHaveURL(/goshuin-books\/\d+$/);
    const bookId = Number(new URL(page.url()).pathname.split('/').at(-1)); bookIds.add(bookId);
    await expect(page.getByRole('heading', { name: prefix + ' 교토 여행첩', exact: true })).toBeVisible();
    await page.getByRole('button', { name: '고슈인 추가', exact: true }).click();
    dialog = page.getByRole('region', { name: '고슈인 추가', exact: true });
    await dialog.getByLabel('받은 장소 (필수)').fill(prefix + ' 후시미이나리 신사');
    await expect(dialog.getByLabel('받은 날짜 (선택)')).toHaveValue('');
    await dialog.getByRole('button', { name: '저장', exact: true }).click();
    const detail = page.getByRole('region', { name: prefix + ' 후시미이나리 신사', exact: true });
    await expect(detail).toContainText('받은 날짜');
    await expect(detail).toContainText('미입력');
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await detail.getByRole('button', { name: '닫기', exact: true }).click();
    const first = (await data(await request.get(api + '/api/goshuin/records?bookId=' + bookId, { headers }))).content[0]; recordIds.add(first.id);
    expect(first.acquiredDate).toBeNull(); expect(first.photoId).toBeNull(); expect(first.position).toBe(1);
    const add = async (place: string, position: number | null, photo = false) => {
      const entry = await data(await request.post(api + '/api/goshuin/records', { headers, data: { placeName: prefix + place, bookId, position } }));
      recordIds.add(entry.id);
      if (photo) {
        const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aL1kAAAAASUVORK5CYII=', 'base64');
        const uploaded = await request.post(api + `/api/goshuin/records/${entry.id}/photo?version=${entry.version}`, { headers, multipart: { file: { name: 'goshuin.png', mimeType: 'image/png', buffer: png } } });
        await data(uploaded);
      }
      return entry;
    };
    const second = await add(' 기요미즈데라', null), inserted = await add(' 도다이지', 2, true);
    await page.reload();
    await expect(page.getByRole('button', { name: '순서 편집', exact: true })).toBeEnabled();
    const section = page.getByRole('region', { name: '선택한 고슈인첩' });
    await expect(section.locator('ol li')).toHaveCount(3);
    await expect(section.locator('ol li').nth(1)).toContainText(prefix + ' 도다이지');
    await expect(section.locator('ol li').first().locator('img')).toHaveCount(0);
    await expect(section.locator('ol li').nth(1).locator('img')).toBeVisible();
    await page.screenshot({ path: '../artifacts/goshuin-test/mobile-390.png' });
    await page.setViewportSize({ width: 320, height: 740 });
    expect(await page.evaluate(() => document.querySelector('main')!.scrollWidth <= document.querySelector('main')!.clientWidth)).toBeTruthy();
    expect(await mobileMenu.evaluate(menu => menu.scrollWidth <= menu.clientWidth)).toBeTruthy();
    await page.screenshot({ path: '../artifacts/goshuin-test/mobile-320.png' });
    await page.setViewportSize({ width: 1280, height: 900 });
    await expect(page.getByRole('navigation', { name: '주요 메뉴' }).filter({ visible: true }).getByRole('link', { name: '내 기록', exact: true })).toHaveClass(/text-blue-600/);
    await expect(page.getByRole('complementary', { name: '고슈인첩 목록' })).toBeVisible();
    await page.screenshot({ path: '../artifacts/goshuin-test/desktop-1280.png' });
    await page.getByRole('button', { name: '순서 편집', exact: true }).click();
    dialog = page.getByRole('region', { name: '고슈인 순서 편집', exact: true });
    await expect(dialog.locator('ol li')).toHaveCount(3);
    await dialog.getByRole('button', { name: prefix + ' 도다이지 위로', exact: true }).click();
    await dialog.getByRole('button', { name: '순서 저장', exact: true }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    const ordered = await data(await request.get(api + '/api/goshuin/books/' + bookId + '/order', { headers }));
    expect(ordered.map((e: { id: number }) => e.id)).toEqual([inserted.id, first.id, second.id]);
    expect(ordered.map((e: { position: number }) => e.position)).toEqual([1, 2, 3]);
    const staleDelete = await request.delete(api + `/api/goshuin/books/${bookId}?version=0&deleteEntries=true`, { headers });
    expect(staleDelete.status()).toBe(409);
    await page.getByLabel('첩 관리').click();
    await page.getByRole('button', { name: '첩 삭제', exact: true }).click();
    dialog = page.getByRole('region', { name: '고슈인첩 삭제', exact: true });
    await expect(dialog.getByLabel('등록된 고슈인도 함께 삭제')).not.toBeChecked();
    await expect(dialog).toContainText('고슈인 3개는 남겨두고');
    await dialog.getByRole('button', { name: '첩 삭제', exact: true }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    bookIds.delete(bookId);
    const kept = await getEntry(inserted.id); expect(kept.bookId).toBeNull(); expect(kept.position).toBeNull(); expect(kept.photoId).toBeTruthy();
    await page.getByRole('button', { name: /^첩 없음/ }).click();
    await page.getByLabel('장소·고슈인 이름 검색').fill(prefix);
    await page.getByRole('button', { name: '검색', exact: true }).click();
    await expect(page.getByRole('region', { name: '첩 없는 고슈인' }).locator('ol li')).toHaveCount(3);
    await page.screenshot({ path: '../artifacts/goshuin-test/unbound.png' });

    // Link actual ledger records without copying and verify checked deletion scope.
    const source = await data(await request.post(api + '/api/purchases/spot/0', { headers, data: { kind: 'GOSHUINCHO', status: 'ACQUIRED', quantity: 1, itemName: prefix + ' 구매 첩' } })); purchaseIds.add(source.id);
    await page.goto('/goshuin-books?sourcePurchaseId=' + source.id);
    dialog = page.getByRole('region', { name: '새 고슈인첩', exact: true }); await expect(dialog.getByLabel('첩 이름 (필수)')).toHaveValue(prefix + ' 구매 첩');
    await dialog.getByRole('button', { name: '저장', exact: true }).click();
    await expect(page).toHaveURL(/goshuin-books\/\d+$/);
    const linkedBookId = Number(new URL(page.url()).pathname.split('/').at(-1)); bookIds.add(linkedBookId);
    await page.getByRole('button', { name: '기존 기록 넣기', exact: true }).click();
    dialog = page.getByRole('region', { name: '기존 고슈인 넣기', exact: true });
    await dialog.getByLabel('기존 고슈인 장소·이름 검색').fill(prefix);
    await dialog.getByRole('button', { name: '검색', exact: true }).click();
    await dialog.getByText(prefix + ' 후시미이나리 신사', { exact: true }).click();
    await dialog.getByRole('button', { name: '1개 넣기', exact: true }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    expect((await getEntry(first.id)).bookId).toBe(linkedBookId);
    const ledger = await data(await request.get(api + '/api/purchases?kind=GOSHUIN&keyword=' + encodeURIComponent(prefix), { headers }));
    expect(ledger.content).toHaveLength(3);
    await page.getByLabel('첩 관리').click(); await page.getByRole('button', { name: '첩 삭제', exact: true }).click();
    dialog = page.getByRole('region', { name: '고슈인첩 삭제', exact: true }); await dialog.getByLabel('등록된 고슈인도 함께 삭제').check();
    await expect(dialog).toContainText('기념품 장부에서도 사라집니다.');
    await dialog.getByRole('button', { name: '첩과 고슈인 삭제', exact: true }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0); bookIds.delete(linkedBookId); recordIds.delete(first.id);
    expect((await request.get(api + '/api/goshuin/records/' + first.id, { headers })).status()).toBe(404);
    expect((await getEntry(second.id)).bookId).toBeNull(); expect((await getEntry(inserted.id)).photoId).toBeTruthy();
    expect((await data(await request.get(api + '/api/purchases?kind=GOSHUINCHO&keyword=' + encodeURIComponent(prefix), { headers }))).content).toHaveLength(1);
    // A directly named record must also remain editable in the existing ledger.
    await page.goto('/spots?mode=PURCHASE');
    await page.getByLabel('기념품·메모 검색').fill(prefix);
    await page.getByRole('button', { name: '검색', exact: true }).click();
    await page.getByRole('button', { name: prefix + ' 기요미즈데라 수정', exact: true }).click();
    await page.getByLabel('고슈인 이름 (선택)', { exact: true }).fill('');
    await page.getByLabel('메모 (선택)', { exact: true }).fill('장부에서 수정한 메모');
    await page.getByRole('button', { name: '수정 완료', exact: true }).click();
    await expect.poll(async () => (await getEntry(second.id)).note).toBe('장부에서 수정한 메모');
    await page.goto('/goshuin-books');
    await page.goto('/spots?mode=PURCHASE');
    await expect(page.getByLabel('기념품·메모 검색')).toHaveValue(prefix);
    await expect(page.getByRole('link', { name: '내 고슈인첩 →' })).toHaveCount(0);
    await expect(page.getByText('첩 없는 받은 고슈인만 보기', { exact: true })).toHaveCount(0);

    // Changing or deleting the place library entry must preserve received-place text.
    const spot = await data(await request.post(api + '/api/spots', { headers, data: { placeId: prefix + '_spot', spotName: prefix + ' 보관 장소', spotType: 'OTHER', address: '교토', lat: 34.98, lng: 135.75, metadata: {}, isVisit: false } })); spotIds.add(spot.id);
    const snapshot = await data(await request.post(api + '/api/goshuin/records', { headers, data: { placeName: prefix + ' 받은 장소', spotUserId: spot.id } })); recordIds.add(snapshot.id);
    await data(await request.patch(api + '/api/spots/' + spot.id, { headers, data: { spotName: prefix + ' 바뀐 보관 이름' } }));
    await data(await request.patch(api + '/api/purchases/' + snapshot.id, { headers, data: { spotUserId: spot.id, note: '이름 보존 확인', recordVersion: snapshot.version } }));
    expect((await getEntry(snapshot.id)).placeName).toBe(prefix + ' 받은 장소');
    await data(await request.delete(api + '/api/spots/' + spot.id, { headers })); spotIds.delete(spot.id);
    const afterSpotDelete = await getEntry(snapshot.id); expect(afterSpotDelete.spotUserId).toBeNull(); expect(afterSpotDelete.placeName).toBe(prefix + ' 받은 장소');
    // Groups filter the paginated place list together with search and visit state.
    const groupedSpot = await data(await request.post(api + '/api/spots', { headers, data: { placeId: prefix + '_grouped', spotName: prefix + ' 그룹 장소', spotType: 'OTHER', address: '교토', lat: 34.99, lng: 135.75, metadata: {}, isVisit: false } })); spotIds.add(groupedSpot.id);
    const looseSpot = await data(await request.post(api + '/api/spots', { headers, data: { placeId: prefix + '_loose', spotName: prefix + ' 독립 장소', spotType: 'OTHER', address: '교토', lat: 34.99, lng: 135.76, metadata: {}, isVisit: false } })); spotIds.add(looseSpot.id);
    await page.setViewportSize({ width: 320, height: 740 }); await page.goto('/spots');
    await expect(page.getByRole('navigation', { name: '내 기록 탭' }).getByRole('link')).toHaveCount(3);
    await page.getByRole('button', { name: '그룹 관리', exact: true }).click(); dialog = page.getByRole('dialog');
    await dialog.getByLabel('새 그룹 이름').fill(prefix + ' 그룹'); await dialog.getByRole('button', { name: '그룹 만들기', exact: true }).click();
    await expect(dialog.getByLabel('그룹 이름', { exact: true })).toHaveValue(prefix + ' 그룹');
    const groupId = Number(await dialog.getByLabel('관리할 그룹').inputValue()); groupIds.add(groupId);
    await dialog.getByLabel('그룹에 추가할 장소 검색').fill(prefix); await dialog.getByRole('button', { name: '검색', exact: true }).click();
    await dialog.getByRole('button', { name: prefix + ' 그룹 장소 그룹에 추가', exact: true }).click();
    await expect(dialog.getByRole('region', { name: '그룹에 포함된 장소' })).toContainText(prefix + ' 그룹 장소');
    await page.screenshot({ path: '../artifacts/goshuin-test/group-manager-320.png' });
    await dialog.getByRole('button', { name: '닫기', exact: true }).click();
    await page.getByLabel('장소 그룹 필터').selectOption(String(groupId));
    await expect(page.getByRole('status', { name: '내 장소 불러오는 중' })).toHaveCount(0);
    await page.getByLabel('장소명 또는 주소 검색').fill(prefix); await page.getByRole('button', { name: '조회', exact: true }).click();
    await expect(page.getByLabel('장소명 또는 주소 검색')).toHaveValue(prefix);
    await expect(page.getByText(prefix + ' 그룹 장소', { exact: true }).filter({ visible: true })).toBeVisible(); await expect(page.getByText(prefix + ' 독립 장소', { exact: true })).toHaveCount(0);
    await page.screenshot({ path: '../artifacts/goshuin-test/records-320.png' });
    const groupResult = await data(await request.get(api + `/api/spots?groupId=${groupId}&keyword=${encodeURIComponent(prefix)}&isVisit=false`, { headers })); expect(groupResult.totalElements).toBe(1);
    expect((await data(await request.get(api + `/api/spots?groupId=${groupId}&isVisit=true`, { headers }))).totalElements).toBe(0);
    const otherGroup = await data(await request.post(api + '/api/groups', { headers, data: { groupName: prefix + ' 두번째' } })); groupIds.add(otherGroup.id);
    await data(await request.post(api + `/api/groups/${otherGroup.id}/spot/${groupedSpot.id}`, { headers }));
    expect((await data(await request.get(api + `/api/spots?groupId=${groupId}`, { headers }))).totalElements).toBe(1);
    await page.getByRole('navigation', { name: '내 기록 탭' }).getByRole('link', { name: '기념품', exact: true }).click();
    await expect(page.getByLabel('기념품·메모 검색')).toHaveValue(prefix);
    await page.getByRole('navigation', { name: '내 기록 탭' }).getByRole('link', { name: '장소', exact: true }).click();
    await expect(page.getByLabel('장소 그룹 필터')).toHaveValue(String(groupId)); await expect(page.getByLabel('장소명 또는 주소 검색')).toHaveValue(prefix);
    await page.getByLabel('장소 그룹 필터').selectOption('NONE'); await expect(page.getByText(prefix + ' 독립 장소', { exact: true }).filter({ visible: true })).toBeVisible(); await expect(page.getByText(prefix + ' 그룹 장소', { exact: true })).toHaveCount(0);
    await page.goto(`/spots?mode=GROUP&groupId=${groupId}`); await expect(page.getByLabel('장소 그룹 필터')).toHaveValue(String(groupId));
    await page.getByRole('button', { name: '그룹 관리', exact: true }).click(); dialog = page.getByRole('dialog');
    await dialog.getByLabel('그룹 이름', { exact: true }).fill(prefix + ' 변경 그룹'); await dialog.getByRole('button', { name: '이름 변경', exact: true }).click();
    await expect(dialog.getByLabel('관리할 그룹').locator('option:checked')).toContainText('변경 그룹');
    await dialog.getByRole('button', { name: '그룹 삭제', exact: true }).click(); await page.getByRole('dialog', { name: '그룹 삭제', exact: true }).getByRole('button', { name: '그룹 삭제', exact: true }).click();
    await expect(dialog.getByLabel('관리할 그룹')).toHaveValue('0'); groupIds.delete(groupId);
    expect((await request.get(api + '/api/spots/' + groupedSpot.id, { headers })).ok()).toBeTruthy();
    await dialog.getByRole('button', { name: '닫기', exact: true }).click();
    expect(failures).toEqual([]);
  } finally {
    for (const id of recordIds) { const r = await request.get(api + '/api/goshuin/records/' + id, { headers }); if (r.ok()) { const e = await r.json(); await request.delete(api + `/api/goshuin/records/${id}?version=${e.data.version}`, { headers }); } }
    for (const id of bookIds) { const r = await request.get(api + '/api/goshuin/books/' + id, { headers }); if (r.ok()) { const b = await r.json(); await request.delete(api + `/api/goshuin/books/${id}?version=${b.data.version}&deleteEntries=false`, { headers }); } }
    for (const id of purchaseIds) await request.delete(api + '/api/purchases/' + id, { headers });
    for (const id of groupIds) await request.delete(api + '/api/groups/' + id, { headers });
    for (const id of spotIds) await request.delete(api + '/api/spots/' + id, { headers });
    if (temporary) await request.delete(api + '/api/account', { headers, data: { password } });
    await page.evaluate(() => localStorage.clear()).catch(() => {});
  }
});

