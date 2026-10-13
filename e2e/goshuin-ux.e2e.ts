import { expect, test, type Page } from '@playwright/test';
import type { GoshuinBook, GoshuinEntry } from '../src/types/goshuin';

async function collection(page: Page, targetEntries = 0) {
  const books: GoshuinBook[] = [1, 2].map(id => ({ id, name: id === 1 ? '교토 여행첩' : '나라 여행첩', memo: null, photoId: null, sourcePurchaseId: null, version: 0, count: 0 }));
  let rows: GoshuinEntry[] = ['후시미이나리 신사', '기요미즈데라', '도다이지'].map((placeName, index) => ({
    id: index + 1, placeName, itemName: null, acquiredDate: null, note: null, spotUserId: null,
    bookId: index === 2 ? null : 1, bookName: index === 2 ? null : '교토 여행첩', position: index === 2 ? null : index + 1, photoId: null, version: 0, quantity: 1,
  }));
  rows.push(...Array.from({ length: targetEntries }, (_, index): GoshuinEntry => ({
    id: index + 10, placeName: `나라 기존 기록 ${index + 1}`, itemName: null, acquiredDate: null, note: null,
    spotUserId: null, bookId: 2, bookName: '나라 여행첩', position: index + 1, photoId: null, version: 0, quantity: 1,
  })));
  let failSave = false; let saveCount = 0;
  let heldSave: Promise<void> | null = null;
  const reorder = (bookId: number | null) => rows.filter(r => r.bookId === bookId).sort((a, b) => (a.position || 0) - (b.position || 0)).forEach((r, i) => { r.position = bookId ? i + 1 : null; });
  await page.addInitScript(() => { localStorage.setItem('accessToken', 'test-token'); localStorage.setItem('username', 'test'); });
  await page.route('**/api/**', async route => {
    const request = route.request(); const url = new URL(request.url());
    if (!url.pathname.startsWith('/api/')) { await route.continue(); return; }
    const path = url.pathname.replace('/api/goshuin', '');
    const method = request.method(); const input = request.postDataJSON();
    const book = path.startsWith('/books/') ? books.find(b => b.id === Number(path.split('/')[2])) : undefined;
    const entry = path.startsWith('/records/') ? rows.find(r => r.id === Number(path.split('/')[2])) : undefined;
    let result: unknown = null;
    if (method === 'GET' && path === '/books') result = books.map(b => ({ ...b, count: rows.filter(r => r.bookId === b.id).length }));
    else if (method === 'GET' && path === '/stats') result = { unboundCount: rows.filter(r => !r.bookId).length };
    else if (method === 'GET' && path === '/books/from-purchase/9') result = { id: 9, name: '購入した旅の御朱印帳', bookId: null };
    else if (method === 'GET' && path === '/records') {
      const keyword = url.searchParams.get('keyword') || '';
      const content = rows.filter(r => url.searchParams.get('unbound') === 'true' ? !r.bookId : url.searchParams.has('bookId') ? r.bookId === Number(url.searchParams.get('bookId')) : true)
        .filter(r => (r.itemName || r.placeName).includes(keyword)).sort((a, b) => (a.position || 0) - (b.position || 0));
      const number = Number(url.searchParams.get('page') || 0);
      result = { content: content.slice(number * 20, (number + 1) * 20), totalElements: content.length, totalPages: Math.ceil(content.length / 20), number };
    } else if (method === 'GET' && /\/books\/\d+\/order$/.test(path)) result = rows.filter(r => r.bookId === book!.id).sort((a, b) => a.position! - b.position!);
    else if (method === 'GET' && book) result = { ...book, count: rows.filter(r => r.bookId === book.id).length };
    else if (method === 'GET' && entry) result = entry;
    else if (method === 'POST' && path === '/books') { result = { id: 10, ...input, photoId: null, sourcePurchaseId: input.sourcePurchaseId || null, version: 0, count: 0 }; books.push(result as GoshuinBook); }
    else if (method === 'PUT' && /\/books\/\d+\/order$/.test(path)) { input.ids.forEach((id: number, i: number) => { rows.find(r => r.id === id)!.position = i + 1; }); book!.version++; result = book; }
    else if (method === 'POST' && /\/books\/\d+\/records$/.test(path)) {
      let position = rows.filter(r => r.bookId === book!.id).length;
      input.ids.forEach((id: number) => { Object.assign(rows.find(r => r.id === id)!, { bookId: book!.id, bookName: book!.name, position: ++position }); }); result = book;
    } else if ((method === 'POST' || method === 'PUT') && path.startsWith('/records')) {
      saveCount++;
      if (heldSave) await heldSave;
      if (failSave) { await route.fulfill({ status: 500, json: { success: false, message: '저장 연결이 끊겼습니다.' } }); return; }
      const previousBook = entry?.bookId;
      const saved = { ...(entry || { id: rows.length + 1, photoId: null, quantity: 1 }), ...input, bookName: books.find(b => b.id === input.bookId)?.name || null, position: input.bookId ? (entry?.bookId === input.bookId ? entry.position : rows.filter(r => r.bookId === input.bookId).length + 1) : null, version: (entry?.version || 0) + 1 } as GoshuinEntry;
      if (entry) Object.assign(entry, saved); else rows.push(saved);
      if (previousBook != null) reorder(previousBook); reorder(input.bookId); result = saved;
    } else if (method === 'DELETE' && entry) { rows = rows.filter(r => r.id !== entry.id); reorder(entry.bookId); }
    else if (method === 'DELETE' && book) { rows.filter(r => r.bookId === book.id).forEach(r => { r.bookId = null; r.bookName = null; r.position = null; }); books.splice(books.indexOf(book), 1); }
    else { await route.fulfill({ status: 404, json: { success: false, message: '예상하지 않은 테스트 요청: ' + path } }); return; }
    await route.fulfill({ json: { success: true, data: result } });
  });
  return { rows: () => rows, fail: (value: boolean) => { failSave = value; }, saves: () => saveCount,
    hold: () => { let release!: () => void; heldSave = new Promise<void>(resolve => { release = resolve; }); return () => { release(); heldSave = null; }; },
  };
}

test('다른 첩의 21번째 기록으로 이동하면 해당 페이지와 저장한 상세를 표시한다', async ({ page }) => {
  await collection(page, 20);
  await page.goto('/goshuin-books/1');
  await page.getByRole('button', { name: /후시미이나리 신사/ }).click();
  await page.getByRole('button', { name: '수정·다른 첩으로 이동' }).click();
  const form = page.getByRole('region', { name: '고슈인 수정·이동', exact: true });
  await form.getByLabel('고슈인첩', { exact: true }).selectOption('2');
  await form.getByRole('button', { name: '저장', exact: true }).click();
  await expect(page).toHaveURL(/goshuin-books\/2$/);
  await expect(page.getByRole('navigation', { name: '고슈인 페이지' })).toContainText('2 / 2');
  await expect(page.getByRole('region', { name: '후시미이나리 신사', exact: true })).toContainText('21번째');
});

for (const width of [320, 1280]) {
  test(`고슈인 조회·수정·추가·정렬·가져오기를 페이지 안에서 이어간다 (${width}px)`, async ({ page }) => {
    const fixture = await collection(page);
    const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
    await page.setViewportSize({ width, height: 900 }); await page.goto('/goshuin-books/1');
    const list = page.getByRole('region', { name: '선택한 고슈인첩', exact: true });
    const row = list.getByRole('button', { name: /후시미이나리 신사/ });
    await row.click(); await expect(row).toHaveAttribute('aria-expanded', 'true');
    const detail = page.getByRole('region', { name: '후시미이나리 신사', exact: true });
    await expect(detail).toContainText('미입력'); await expect(page.getByRole('dialog')).toHaveCount(0);
    await page.screenshot({ path: `../artifacts/goshuin-detail-${width}.png` });
    await detail.getByRole('button', { name: '닫기', exact: true }).click(); await expect(row).toBeFocused();
    await row.click(); await detail.getByRole('button', { name: '수정·다른 첩으로 이동' }).click();
    const edit = page.getByRole('region', { name: '고슈인 수정·이동', exact: true });
    await edit.getByLabel('받은 장소 (필수)').fill('후시미이나리 대사');
    await edit.getByRole('button', { name: '저장', exact: true }).click();
    await expect(page.getByRole('region', { name: '후시미이나리 대사', exact: true })).toBeVisible();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await page.getByRole('button', { name: '고슈인 추가', exact: true }).click();
    const form = page.getByRole('region', { name: '고슈인 추가', exact: true });
    await expect(form.getByLabel('받은 장소 (필수)')).toBeFocused();
    await form.getByLabel('받은 장소 (필수)').fill('八坂神社の長い名前の限定御朱印');
    await expect(form.getByLabel('받은 날짜 (선택)')).toHaveValue('');
    while (await page.getByRole('button', { name: '알림 닫기', exact: true }).count()) await page.getByRole('button', { name: '알림 닫기', exact: true }).first().click();
    await page.screenshot({ path: `../artifacts/goshuin-form-${width}.png` });
    await form.getByRole('button', { name: '저장', exact: true }).click();
    await expect(list.locator(':scope > div > ol > li')).toHaveCount(3);
    await page.getByRole('button', { name: '순서 편집', exact: true }).click();
    const order = page.getByRole('region', { name: '고슈인 순서 편집', exact: true });
    await order.getByRole('button', { name: '기요미즈데라 위로', exact: true }).click();
    await order.getByRole('button', { name: '순서 저장', exact: true }).click();
    await expect(list.locator(':scope > div > ol > li').first()).toContainText('기요미즈데라');
    await page.getByRole('button', { name: '기존 기록 넣기', exact: true }).click();
    const importing = page.getByRole('region', { name: '기존 고슈인 넣기', exact: true });
    await importing.getByText('도다이지', { exact: true }).click();
    await importing.getByRole('button', { name: '1개 넣기', exact: true }).click();
    await expect(list.locator(':scope > div > ol > li')).toHaveCount(4);
    expect(fixture.rows().find(r => r.id === 3)?.bookId).toBe(1);
    await expect(page.getByRole('dialog')).toHaveCount(0);
    expect(await page.locator('main').evaluate(el => el.scrollWidth <= el.clientWidth)).toBeTruthy();
    while (await page.getByRole('button', { name: '알림 닫기', exact: true }).count()) await page.getByRole('button', { name: '알림 닫기', exact: true }).first().click();
    await page.screenshot({ path: `../artifacts/goshuin-ux-${width}.png` });
    // Deletion stays in the page workspace and preserves records by default.
    await page.getByLabel('첩 관리').click(); await page.getByRole('button', { name: '첩 삭제', exact: true }).click();
    const deletion = page.getByRole('region', { name: '고슈인첩 삭제', exact: true });
    await expect(deletion.getByLabel('등록된 고슈인도 함께 삭제')).not.toBeChecked();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await deletion.getByRole('button', { name: '취소', exact: true }).click();
    expect(errors).toEqual([]);
  });
}

test('취소·이탈 확인과 저장 실패 후 재시도가 작성 내용을 보존한다', async ({ page }) => {
  const fixture = await collection(page);
  await page.goto('/goshuin-books/1'); await page.getByRole('button', { name: '고슈인 추가', exact: true }).click();
  const form = page.getByRole('region', { name: '고슈인 추가', exact: true });
  await form.getByLabel('받은 장소 (필수)').fill('저장할 신사');
  await form.getByRole('button', { name: '취소', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: '취소', exact: true }).click();
  await expect(form.getByLabel('받은 장소 (필수)')).toHaveValue('저장할 신사');
  await page.getByRole('button', { name: /나라 여행첩/ }).click();
  await page.getByRole('dialog').getByRole('button', { name: '취소', exact: true }).click();
  await expect(page).toHaveURL(/goshuin-books\/1$/); await expect(form.getByLabel('받은 장소 (필수)')).toHaveValue('저장할 신사');
  await page.getByRole('button', { name: /^첩 없음/ }).click();
  await page.getByRole('dialog').getByRole('button', { name: '취소', exact: true }).click();
  await expect(form).toBeVisible();
  fixture.fail(true); await form.getByRole('button', { name: '저장', exact: true }).click();
  await expect(form.getByRole('alert')).toContainText('저장 연결이 끊겼습니다.');
  await expect(form.getByLabel('받은 장소 (필수)')).toHaveValue('저장할 신사');
  fixture.fail(false); await form.getByRole('button', { name: '저장', exact: true }).click();
  await expect(form).toHaveCount(0); expect(fixture.saves()).toBe(2);
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.getByRole('button', { name: '고슈인 추가', exact: true }).click();
  await form.getByLabel('받은 장소 (필수)').fill('버릴 신사');
  await page.getByRole('button', { name: /나라 여행첩/ }).click();
  await page.getByRole('dialog').getByRole('button', { name: '이동', exact: true }).click();
  await expect(page).toHaveURL(/goshuin-books\/2$/); await expect(form).toHaveCount(0);
});

test('첩 생성과 구매 기록에서 첩 만들기도 페이지 안에서 진행한다', async ({ page }) => {
  await collection(page); await page.setViewportSize({ width: 320, height: 900 }); await page.goto('/goshuin-books');
  await page.getByRole('button', { name: '새 첩', exact: true }).click();
  const form = page.getByRole('region', { name: '새 고슈인첩', exact: true });
  await form.getByLabel('첩 이름 (필수)').fill('새 여행첩');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await form.getByRole('button', { name: '저장', exact: true }).click();
  await expect(page).toHaveURL(/goshuin-books\/10$/);
  await page.goto('/goshuin-books?sourcePurchaseId=9');
  await expect(form.getByLabel('첩 이름 (필수)')).toHaveValue('購入した旅の御朱印帳');
  await form.getByRole('button', { name: '취소', exact: true }).click();
  await expect(form).toHaveCount(0); await expect(page).toHaveURL(/goshuin-books$/);
});

test('저장 중 이동을 막고 일반 작업 영역의 키보드 포커스를 가두지 않는다', async ({ page }) => {
  const fixture = await collection(page); await page.goto('/goshuin-books/1');
  await page.getByRole('button', { name: '고슈인 추가', exact: true }).click();
  const form = page.getByRole('region', { name: '고슈인 추가', exact: true });
  await form.getByRole('button', { name: '저장', exact: true }).focus(); await page.keyboard.press('Tab');
  await expect(form.locator(':focus')).toHaveCount(0);
  await form.getByLabel('받은 장소 (필수)').fill('저장 중인 신사');
  const release = fixture.hold();
  try {
    await form.getByRole('button', { name: '저장', exact: true }).click();
    await expect(form.getByRole('button', { name: '저장 중…', exact: true })).toBeDisabled();
    await page.getByRole('button', { name: /나라 여행첩/ }).click();
    await expect(page).toHaveURL(/goshuin-books\/1$/);
    await expect(form.getByRole('button', { name: '닫기', exact: true })).toBeDisabled();
    await expect(page.getByRole('dialog')).toHaveCount(0);
  } finally { release(); }
  await expect(form).toHaveCount(0);
  await expect(page.getByRole('region', { name: '저장 중인 신사', exact: true })).toBeVisible();
});
