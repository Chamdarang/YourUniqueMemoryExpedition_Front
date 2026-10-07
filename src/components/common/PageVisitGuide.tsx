import { useEffect, useState } from 'react';
import FirstVisitGuide, { type GuideStep } from './FirstVisitGuide';

const pageGuides: Record<string, GuideStep[]> = {
  explore: [
    { target: 'explore-mode', title: '검색할 장소 목록을 선택해요', description: '구글 장소를 찾거나 내 장소 보관함에 저장한 항목을 검색할 수 있어요.' },
    { target: 'explore-query', title: '장소명이나 주소를 검색해요', description: '검색 결과를 선택하면 지도에서 위치와 장소 정보를 확인할 수 있어요.' },
    { target: 'explore-map', title: '지도에서 주변을 살펴봐요', description: '지도를 움직여 주변 장소를 살펴보고, 장소 표시를 눌러 정보와 저장 상태를 확인해요.' },
  ],
  plans: [
    { target: 'plans-create', title: '새 여행을 만들어요', description: '이 화면에서 새 여행 입력 상자를 열어요.' },
    { target: 'plans-filter', title: '여행을 검색하고 상태별로 걸러봐요', description: '여행 이름을 검색하거나 예정·진행·완료 상태를 선택해 목록을 좁힐 수 있어요.' },
    { target: 'plans-list', title: '여행을 열어 일정을 관리해요', description: '여행을 선택하면 날짜별 일정과 장소를 확인하고 수정할 수 있어요.' },
  ],
  'plan-detail': [
    { target: 'plan-detail-header', title: '여행 정보를 확인해요', description: '여행 이름과 기간을 관리하고, 함께 편집할 사람이나 공유 링크를 확인할 수 있어요.' },
    { target: 'plan-detail-schedules', title: '날짜별 일정을 편집해요', description: '장소와 이동 순서를 바꾸고, 날짜마다 일정을 추가할 수 있어요.' },
  ],
  days: [
    { target: 'days-create', title: '하루 코스를 만들어요', description: '여행에 연결하기 전 날짜별 후보 일정을 간편 일정이나 상세 일정으로 따로 정리할 수 있어요.' },
    { target: 'days-list', title: '저장한 하루 코스를 확인해요', description: '하루 코스를 열어 내용을 다듬거나 여행에 가져올 수 있어요.' },
  ],
  'day-detail': [
    { target: 'day-detail-toolbar', title: '하루 일정의 기본 정보를 편집해요', description: '제목과 메모를 바꾸고, 경로를 점검하거나 일정 이미지를 저장할 수 있어요.' },
    { target: 'day-detail-schedules', title: '일정 순서와 방문 상태를 관리해요', description: '장소를 추가하고 순서를 바꾸거나 각 일정의 방문 완료를 표시해요.' },
  ],
  spots: [
    { target: 'spots-tabs', title: '장소·그룹·기념품 탭을 살펴봐요', description: '세 탭에서 장소 보관함, 그룹, 수집 기록을 각각 확인할 수 있어요.' },
    { target: 'spots-content', title: '선택한 탭의 항목을 관리해요', description: '검색과 필터로 원하는 장소나 수집 기록을 찾아 편집할 수 있어요.' },
  ],
  'spot-detail': [
    { target: 'spot-detail-main', title: '장소 정보를 관리해요', description: '방문 여부를 표시하고 장소 이름, 분류, 설명을 수정할 수 있어요.' },
    { target: 'spot-detail-history', title: '방문과 수집 기록을 확인해요', description: '방문 이력과 장소별 그룹, 기념품 기록을 아래에서 확인하고 관리해요.' },
  ],
  'plan-create': [
    { target: 'plan-create-name', title: '여행 제목을 입력해요', description: '목록에서 구분할 수 있도록 여행 이름을 적어요.' },
    { target: 'plan-create-dates', title: '여행 날짜를 정해요', description: '가는 날을 고르면 설정한 기간에 맞춰 오는 날이 계산돼요.' },
    { target: 'plan-create-submit', title: '입력한 정보로 여행을 만들어요', description: '여행 생성하기를 누르면 새 여행이 저장되고 여행 목록으로 돌아갑니다.' },
  ],
};

export type PageGuideId = keyof typeof pageGuides;

export default function PageVisitGuide({ pageId }: { pageId: PageGuideId }) {
  const username = localStorage.getItem('username') || '여행자';
  const storageKey = `yume:page-guide:${username}:${pageId}`;
  const [open, setOpen] = useState(() => {
    try { return !localStorage.getItem(storageKey); }
    catch { return true; }
  });

  useEffect(() => {
    const openGuide = () => setOpen(true);
    window.addEventListener('yume:open-page-guide', openGuide);
    return () => window.removeEventListener('yume:open-page-guide', openGuide);
  }, []);

  const close = () => {
    try { localStorage.setItem(storageKey, 'done'); } catch { /* The current visit can still be dismissed. */ }
    setOpen(false);
  };

  return (
    <>
      {open && <FirstVisitGuide steps={pageGuides[pageId]} label="화면 안내" onClose={close} />}
    </>
  );
}
