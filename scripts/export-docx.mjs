import {
  Document, Packer, Paragraph, TextRun, HeadingLevel,
  Table, TableRow, TableCell, WidthType, BorderStyle,
  AlignmentType, ShadingType
} from "docx";
import fs from "fs";

const headerShading = {
  type: ShadingType.SOLID,
  color: "E8F0FE",
  fill: "E8F0FE",
};

function cellBorders() {
  const border = { style: BorderStyle.SINGLE, size: 1, color: "CCCCCC" };
  return { top: border, bottom: border, left: border, right: border };
}

function tableHeaderCell(text) {
  return new TableCell({
    borders: cellBorders(),
    shading: headerShading,
    children: [new Paragraph({ children: [new TextRun({ text, bold: true, size: 20, font: "맑은 고딕" })] })],
  });
}

function tableCell(text) {
  return new TableCell({
    borders: cellBorders(),
    children: [new Paragraph({ children: [new TextRun({ text, size: 20, font: "맑은 고딕" })] })],
  });
}

function makeTable(headers, rows) {
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [
      new TableRow({ children: headers.map(h => tableHeaderCell(h)) }),
      ...rows.map(row => new TableRow({ children: row.map(c => tableCell(c)) })),
    ],
  });
}

function heading(text, level) {
  return new Paragraph({
    heading: level,
    spacing: { before: 300, after: 100 },
    children: [new TextRun({ text, bold: true, font: "맑은 고딕" })],
  });
}

function body(text) {
  return new Paragraph({
    spacing: { after: 80 },
    children: [new TextRun({ text, size: 22, font: "맑은 고딕" })],
  });
}

function boldBody(label, text) {
  return new Paragraph({
    spacing: { after: 80 },
    children: [
      new TextRun({ text: label, bold: true, size: 22, font: "맑은 고딕" }),
      new TextRun({ text, size: 22, font: "맑은 고딕" }),
    ],
  });
}

function bullet(text) {
  return new Paragraph({
    bullet: { level: 0 },
    spacing: { after: 40 },
    children: [new TextRun({ text, size: 22, font: "맑은 고딕" })],
  });
}

function subBullet(text) {
  return new Paragraph({
    bullet: { level: 1 },
    spacing: { after: 40 },
    children: [new TextRun({ text, size: 20, font: "맑은 고딕" })],
  });
}

function spacer() {
  return new Paragraph({ spacing: { after: 100 }, children: [] });
}

const doc = new Document({
  styles: {
    default: {
      document: {
        run: { font: "맑은 고딕", size: 22 },
      },
    },
  },
  sections: [{
    properties: {},
    children: [
      // Title
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { after: 100 },
        children: [new TextRun({ text: "LogicCanvas", size: 48, bold: true, font: "맑은 고딕", color: "2563EB" })],
      }),
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { after: 40 },
        children: [new TextRun({ text: "서비스 상세 기획서", size: 32, bold: true, font: "맑은 고딕" })],
      }),
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { after: 400 },
        children: [
          new TextRun({ text: "버전 v1.0  |  최종 수정일: 2026년 2월 6일", size: 20, font: "맑은 고딕", color: "888888" }),
        ],
      }),

      // 1. 서비스 개요
      heading("1. 서비스 개요", HeadingLevel.HEADING_1),

      heading("1.1 서비스 정의", HeadingLevel.HEADING_2),
      body("LogicCanvas는 복잡한 문서들을 시각적 캔버스 위에 배치하고, AI를 활용하여 문서 간의 논리적 관계와 워크플로우를 자동으로 분석/시각화하는 인지 매핑(Cognitive Mapping) 서비스입니다."),
      spacer(),

      heading("1.2 핵심 가치", HeadingLevel.HEADING_2),
      bullet("프로젝트의 전체 흐름을 한눈에 파악할 수 있는 시각적 개요 제공"),
      bullet("AI가 문서 내용을 분석하여 자동으로 그룹핑 및 관계 연결 수행"),
      bullet("FigJam/Miro와 유사한 무한 캔버스 기반의 자유로운 문서 배치"),
      bullet("줌 인/아웃으로 프로젝트 전체 조감도부터 개별 문서 상세까지 탐색"),
      spacer(),

      heading("1.3 대상 사용자", HeadingLevel.HEADING_2),
      bullet("다수의 문서를 관리하며 프로젝트를 진행하는 기획자, 리서처, PM"),
      bullet("문서 간의 관계를 시각적으로 파악하고 싶은 팀"),
      bullet("리서치 → 기획 → 설계 → 실행 등 단계별 워크플로우가 있는 프로젝트 담당자"),
      spacer(),

      // 2. 정보 구조
      heading("2. 정보 구조", HeadingLevel.HEADING_1),

      heading("2.1 계층 구조", HeadingLevel.HEADING_2),
      body("LogicCanvas는 3단계 계층 구조로 문서를 조직합니다:"),
      body("대분류 (Major Group) → 중분류 (Medium Group) → 문서 (Document)"),
      spacer(),
      makeTable(
        ["계층", "명칭", "역할", "예시"],
        [
          ["1단계", "대분류 (대그룹)", "프로젝트 워크플로우 단계", "리서치, 기획, 설계, 실행, 분석, 보고"],
          ["2단계", "중분류 (중그룹)", "단계 내 세부 카테고리", "데스크 리서치, 현장 조사, 인터뷰"],
          ["3단계", "문서", "실제 콘텐츠 단위", "감각과 심리적 지형도 리서치"],
        ]
      ),
      spacer(),

      heading("2.2 데이터 모델", HeadingLevel.HEADING_2),

      boldBody("문서 (Documents)", ""),
      makeTable(
        ["필드", "타입", "설명"],
        [
          ["id", "serial (PK)", "고유 식별자"],
          ["title", "text", "문서 제목"],
          ["content", "text", "문서 원문 내용"],
          ["summary", "text (nullable)", "문서 요약"],
          ["groupId", "integer (nullable)", "소속 그룹 ID"],
          ["x, y", "integer", "캔버스 상 위치 좌표"],
          ["createdAt", "timestamp", "생성일시"],
          ["updatedAt", "timestamp", "수정일시"],
        ]
      ),
      spacer(),

      boldBody("문서 그룹 (Document Groups)", ""),
      makeTable(
        ["필드", "타입", "설명"],
        [
          ["id", "serial (PK)", "고유 식별자"],
          ["name", "text", "그룹명"],
          ["description", "text (nullable)", "그룹 설명"],
          ["parentId", "integer (nullable)", "상위 그룹 ID (계층 구조)"],
          ["x, y", "integer", "캔버스 상 위치 좌표"],
          ["color", "text", "그룹 색상 코드 (HEX)"],
          ["monthStart", "integer (nullable)", "타임라인 시작 월 (1-12)"],
          ["monthEnd", "integer (nullable)", "타임라인 종료 월 (1-12)"],
        ]
      ),
      spacer(),

      boldBody("문서 간 연결 (Document Edges)", ""),
      makeTable(
        ["필드", "타입", "설명"],
        [
          ["sourceDocId", "integer (FK)", "출발 문서 ID"],
          ["targetDocId", "integer (FK)", "도착 문서 ID"],
          ["label", "text (nullable)", "연결 설명"],
          ["edgeType", "text", "flow / depends / related / parent"],
        ]
      ),
      spacer(),

      boldBody("그룹 간 연결 (Group Edges)", ""),
      makeTable(
        ["필드", "타입", "설명"],
        [
          ["sourceGroupId", "integer (FK)", "출발 그룹 ID"],
          ["targetGroupId", "integer (FK)", "도착 그룹 ID"],
          ["label", "text (nullable)", "연결 설명"],
          ["edgeType", "text", "flow / depends / related"],
        ]
      ),
      spacer(),

      boldBody("노드 (Nodes) - 문서 내 개념 추출", ""),
      makeTable(
        ["필드", "타입", "설명"],
        [
          ["documentId", "integer (FK)", "소속 문서 ID"],
          ["label", "text", "개념 제목 (2-5단어)"],
          ["content", "text", "개념 상세 설명"],
          ["nodeType", "text", "concept / claim / evidence / question"],
          ["isTagged", "boolean", "태그 여부"],
          ["tagNote", "text (nullable)", "태그 메모"],
        ]
      ),
      spacer(),

      boldBody("태스크 (Tasks)", ""),
      makeTable(
        ["필드", "타입", "설명"],
        [
          ["documentId", "integer (FK)", "관련 문서 ID"],
          ["nodeId", "integer (FK, nullable)", "관련 노드 ID"],
          ["title", "text", "태스크 제목"],
          ["status", "text", "pending / in_progress / completed"],
          ["priority", "text", "low / medium / high"],
        ]
      ),
      spacer(),

      // 3. 화면 설계
      heading("3. 화면 설계", HeadingLevel.HEADING_1),

      heading("3.1 전체 레이아웃", HeadingLevel.HEADING_2),
      bullet("헤더 (56px): 로고 + 서비스명 + 문서/그룹 개수 + 다크모드 토글"),
      bullet("타임라인 헤더 (48px): 월별 시간축, 문서 열람 시 날짜 마커 표시"),
      bullet("무한 캔버스: 문서 박스, 그룹 박스, 연결선이 배치되는 주요 작업 영역"),
      bullet("좌측 하단: 줌 컨트롤 (줌 인/아웃/리셋)"),
      bullet("우측 하단: 재정렬, 자동 정렬, 추가(+) 버튼"),
      spacer(),

      heading("3.2 타임라인 헤더", HeadingLevel.HEADING_2),
      bullet("높이: 48px, 항상 캔버스 위에 고정 (z-index: 100)"),
      bullet("범위: 2025년 12월 ~ 2026년 12월 (13개월)"),
      bullet("문서 열람 시 해당 문서의 생성일에 파란색 날짜 마커 표시 ('N월 N일 | 문서제목')"),
      bullet("줌/팬에 따라 월 너비가 동적으로 변화"),
      bullet("각 월 경계에 세로 구분선, 주간 단위 점선 표시"),
      spacer(),

      heading("3.3 문서 박스", HeadingLevel.HEADING_2),
      bullet("크기: 260px x 130px"),
      bullet("구성: 아이콘 + 제목(최대 2줄) + 생성일 + 요약(최대 2줄, 150자)"),
      bullet("상태: 기본 / 선택됨(파란 테두리+그림자) / 드래그 중(큰 그림자) / 호버"),
      spacer(),

      heading("3.4 그룹 박스", HeadingLevel.HEADING_2),
      bullet("크기: 내부 문서/하위 그룹의 바운딩 박스에 맞게 자동 계산"),
      bullet("구성: 폴더 아이콘 + 그룹명 + 항목 수 + 더보기 메뉴(수정/삭제)"),
      bullet("대그룹: 투명 배경, 30% 불투명도 테두리"),
      bullet("중그룹: 반투명 배경, 80% 불투명도 테두리"),
      bullet("10가지 색상 프리셋: Indigo, Violet, Pink, Red, Orange, Yellow, Green, Teal, Sky, Gray"),
      spacer(),

      heading("3.5 연결선 (FigJam 스타일)", HeadingLevel.HEADING_2),
      bullet("부드러운 베지어 곡선, 배경 할로(4px) + 전경 선(1.5px)"),
      bullet("오픈 셰브론 화살표 마커 (둥근 모서리)"),
      spacer(),
      makeTable(
        ["연결 유형", "색상", "의미"],
        [
          ["flow", "파란색 (primary)", "순차적 워크플로우"],
          ["depends", "빨간색 (destructive)", "의존 관계"],
          ["parent", "녹색", "상위-하위 관계"],
          ["related", "회색 (점선)", "일반 연관 관계"],
        ]
      ),
      spacer(),

      heading("3.6 문서 상세 패널", HeadingLevel.HEADING_2),
      bullet("유형: 우측 고정 사이드 패널"),
      bullet("너비: 520px, 헤더+타임라인 아래에서 시작 (상단 약 116px)"),
      bullet("구성: 문서 아이콘 + 제목 + 생성일 + 삭제/닫기 버튼 + '원문' 레이블 + 전체 내용(스크롤)"),
      bullet("닫기 방법: X 버튼 / 배경 클릭 / ESC 키"),
      bullet("애니메이션: 우측에서 슬라이드인 + 페이드인"),
      spacer(),

      // 4. 기능 상세
      heading("4. 기능 상세", HeadingLevel.HEADING_1),

      heading("4.1 문서 추가", HeadingLevel.HEADING_2),
      body("1. '+' 버튼 → '새 문서' 선택"),
      body("2. 제목 입력 + 내용 입력 (텍스트 붙여넣기 또는 파일 업로드)"),
      body("3. '분석 시작' 클릭"),
      body("4. AI(GPT-5.2)가 문서 분석: 개념/주장/근거/질문 5~15개 추출, 관계 5~20개 매핑"),
      body("5. 캔버스에 문서 박스 추가"),
      spacer(),
      boldBody("AI 추출 노드 유형: ", "concept(핵심 아이디어), claim(주장), evidence(근거), question(질문)"),
      boldBody("AI 추출 관계 유형: ", "related(일반 연결), supports(뒷받침), contradicts(반대), implies(논리적 귀결)"),
      spacer(),

      heading("4.2 문서 열람", HeadingLevel.HEADING_2),
      body("1. 캔버스의 문서 박스 클릭 → 우측 사이드 패널 슬라이드인"),
      body("2. 타임라인에 해당 문서의 생성일 마커 표시"),
      body("3. 패널 내에서 원문 전체 스크롤 열람"),
      body("4. 삭제 버튼으로 문서 삭제 가능"),
      body("5. 닫기: X 버튼, 배경 클릭, ESC 키"),
      spacer(),

      heading("4.3 그룹 관리", HeadingLevel.HEADING_2),
      boldBody("생성: ", "'+' → '새 그룹' → 이름/설명/상위그룹/색상 설정"),
      boldBody("수정: ", "그룹 '...' 메뉴 → '수정'"),
      boldBody("삭제: ", "그룹 '...' 메뉴 → '삭제' (소속 문서는 미분류로 이동)"),
      spacer(),

      heading("4.4 AI 자동 정렬 (워크플로우 분석)", HeadingLevel.HEADING_2),
      body("2개 이상의 문서가 있을 때 AI가 전체 문서를 분석하여:"),
      bullet("워크플로우 단계별 대그룹 자동 생성 (리서치, 기획, 설계 등)"),
      bullet("각 단계 내 세부 중그룹 자동 생성"),
      bullet("문서를 적절한 그룹에 자동 배정"),
      bullet("문서 간 관계(flow, depends, related) 자동 생성"),
      bullet("그룹 간 워크플로우 연결선 자동 생성"),
      bullet("캔버스 상 위치 자동 배치"),
      spacer(),
      boldBody("X축: ", "워크플로우 단계 순서 (리서치 좌측 → 보고 우측)"),
      boldBody("Y축: ", "시간적 유사성 (같은 시기의 그룹은 비슷한 높이)"),
      spacer(),

      heading("4.5 재정렬", HeadingLevel.HEADING_2),
      body("기존 그룹 구조를 유지한 채 위치만 컴팩트하게 재배치하는 기능입니다."),
      body("AI가 아닌 알고리즘 기반으로 정렬합니다."),
      spacer(),

      heading("4.6 캔버스 조작", HeadingLevel.HEADING_2),
      makeTable(
        ["조작", "방법"],
        [
          ["팬 (이동)", "스페이스바+드래그 또는 휠 클릭 드래그"],
          ["줌", "마우스 휠 스크롤 (5%~200%)"],
          ["단일 선택", "요소 클릭"],
          ["다중 선택", "Shift+클릭 또는 빈 영역 드래그 범위 선택"],
          ["다중 이동", "선택 후 하나 드래그 → 모두 함께 이동"],
          ["문서 열기", "문서 박스 클릭"],
          ["실행 취소", "Ctrl+Z (최대 50개 이력)"],
        ]
      ),
      spacer(),

      heading("4.7 다크 모드", HeadingLevel.HEADING_2),
      body("헤더 우측의 토글 버튼으로 전환하며, localStorage에 설정이 저장됩니다."),
      spacer(),

      // 5. API 설계
      heading("5. API 설계", HeadingLevel.HEADING_1),

      heading("5.1 문서 API", HeadingLevel.HEADING_2),
      makeTable(
        ["메서드", "엔드포인트", "기능"],
        [
          ["GET", "/api/documents", "전체 문서 목록 조회"],
          ["GET", "/api/documents/:id", "단일 문서 상세 조회"],
          ["POST", "/api/documents/parse", "문서 생성 + AI 분석"],
          ["PATCH", "/api/documents/:id", "문서 수정"],
          ["DELETE", "/api/documents/:id", "문서 삭제"],
        ]
      ),
      spacer(),

      heading("5.2 그룹 API", HeadingLevel.HEADING_2),
      makeTable(
        ["메서드", "엔드포인트", "기능"],
        [
          ["GET", "/api/groups", "전체 그룹 목록"],
          ["POST", "/api/groups", "그룹 생성"],
          ["PATCH", "/api/groups/:id", "그룹 수정"],
          ["DELETE", "/api/groups/:id", "그룹 삭제"],
        ]
      ),
      spacer(),

      heading("5.3 워크플로우/정렬 API", HeadingLevel.HEADING_2),
      makeTable(
        ["메서드", "엔드포인트", "기능"],
        [
          ["GET", "/api/document-edges", "문서 간 연결선 조회"],
          ["GET", "/api/group-edges", "그룹 간 연결선 조회"],
          ["POST", "/api/analyze-workflow", "AI 워크플로우 분석 + 자동 그룹핑"],
          ["POST", "/api/relayout", "알고리즘 기반 재정렬"],
        ]
      ),
      spacer(),

      heading("5.4 노드/태스크 API", HeadingLevel.HEADING_2),
      makeTable(
        ["메서드", "엔드포인트", "기능"],
        [
          ["GET", "/api/documents/:id/graph", "문서별 노드+엣지 조회"],
          ["POST", "/api/documents/:id/nodes", "노드 생성"],
          ["PATCH", "/api/nodes/:id", "노드 수정"],
          ["PATCH", "/api/nodes/:id/toggle-tag", "노드 태그 토글"],
          ["DELETE", "/api/nodes/:id", "노드 삭제"],
          ["GET", "/api/documents/:id/tasks", "태스크 목록"],
          ["POST", "/api/documents/:id/tasks", "태스크 생성"],
          ["PATCH", "/api/tasks/:id", "태스크 수정"],
          ["DELETE", "/api/tasks/:id", "태스크 삭제"],
        ]
      ),
      spacer(),

      // 6. 기술 스택
      heading("6. 기술 스택", HeadingLevel.HEADING_1),
      makeTable(
        ["영역", "기술"],
        [
          ["프론트엔드", "React 18 + TypeScript, Vite, Tailwind CSS, shadcn/ui, TanStack Query v5, Wouter"],
          ["백엔드", "Express 5 (ESM), TypeScript, PostgreSQL, Drizzle ORM, Zod"],
          ["AI", "OpenAI API (GPT-5.2)"],
          ["공유 모듈", "shared/schema.ts (프론트엔드/백엔드 타입 일관성 보장)"],
        ]
      ),
      spacer(),

      // 7. 사용자 시나리오
      heading("7. 사용자 시나리오", HeadingLevel.HEADING_1),

      heading("시나리오 1: 프로젝트 문서 일괄 등록 및 자동 정리", HeadingLevel.HEADING_2),
      body("1. '+' → '새 문서'로 문서 10개 순차 등록"),
      body("2. 각 문서마다 AI가 개념 추출"),
      body("3. '자동 정렬' 클릭"),
      body("4. AI가 '리서치/기획/설계' 대그룹 + 중그룹 자동 생성, 문서 배정, 연결선 생성"),
      body("5. 줌 아웃하여 전체 프로젝트 조감도 확인"),
      body("6. 필요시 드래그로 위치 미세 조정"),
      spacer(),

      heading("시나리오 2: 특정 문서 상세 확인", HeadingLevel.HEADING_2),
      body("1. 캔버스에서 문서 박스 클릭"),
      body("2. 우측 사이드 패널에서 원문 확인"),
      body("3. 타임라인에 생성일 마커 표시 ('2월 5일 | 독특한 방향성의...')"),
      body("4. ESC로 닫고 다른 문서 클릭 시 즉시 전환"),
      spacer(),

      heading("시나리오 3: 수동 그룹 재구성", HeadingLevel.HEADING_2),
      body("1. '새 그룹'으로 원하는 그룹 수동 생성"),
      body("2. 문서를 드래그하여 이동"),
      body("3. Ctrl+Z로 실수 되돌리기"),
      body("4. '재정렬'로 깔끔하게 재배치"),
      spacer(),

      // 8. 현재 구현 상태
      heading("8. 현재 구현 상태", HeadingLevel.HEADING_1),

      heading("8.1 완료된 기능", HeadingLevel.HEADING_2),
      bullet("문서 CRUD + AI 문서 분석"),
      bullet("무한 캔버스 (팬/줌/그리드)"),
      bullet("문서/그룹 박스 렌더링 및 드래그 앤 드롭"),
      bullet("계층 그룹 구조 (대그룹 → 중그룹)"),
      bullet("FigJam 스타일 연결선 (베지어 곡선, 할로, 셰브론 화살표)"),
      bullet("AI 자동 정렬 + 알고리즘 재정렬"),
      bullet("타임라인 헤더 + 날짜 마커"),
      bullet("문서 상세 사이드 패널"),
      bullet("다중 선택 + 다중 이동 + Ctrl+Z 실행 취소"),
      bullet("다크/라이트 모드, 한국어 UI"),
      spacer(),

      heading("8.2 준비된 기능 (미활성)", HeadingLevel.HEADING_2),
      bullet("사용자 인증 (DB 준비됨)"),
      bullet("노드 상세 패널 / 태스크 관리 패널 / 노드 그래프 캔버스"),
      bullet("음성 채팅 / 이미지 생성 모듈"),
      spacer(),

      heading("8.3 향후 확장 가능 영역", HeadingLevel.HEADING_2),
      bullet("사용자별 캔버스 저장/공유"),
      bullet("실시간 협업 (멀티 유저 동시 편집)"),
      bullet("문서 내 노드 그래프 시각화"),
      bullet("태스크 보드 (칸반 형태)"),
      bullet("문서 검색/필터링"),
      bullet("문서 버전 관리"),
      bullet("문서 내보내기 (PDF, 이미지)"),
      spacer(),

      // 9. 성능 고려사항
      heading("9. 성능 고려사항", HeadingLevel.HEADING_1),
      makeTable(
        ["항목", "현재 접근", "비고"],
        [
          ["캔버스 렌더링", "CSS transform 기반 팬/줌", "DOM 요소로 렌더링"],
          ["연결선", "SVG 베지어 곡선", "캔버스 크기에 맞게 동적 계산"],
          ["데이터 페칭", "TanStack Query 캐싱", "자동 캐시 무효화"],
          ["위치 업데이트", "드래그 종료 시 서버 저장", "드래그 중에는 로컬 상태만 변경"],
          ["AI 분석", "서버 사이드 OpenAI 호출", "긴 문서는 500자 미리보기로 전송"],
          ["초기 로딩", "전체 문서/그룹/엣지 일괄 로드", "데이터량 증가 시 페이지네이션 필요"],
        ]
      ),
      spacer(),

      // Footer
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { before: 400 },
        children: [
          new TextRun({ text: "본 기획서는 LogicCanvas v1.0의 현재 구현 상태를 기반으로 작성되었습니다.", size: 18, font: "맑은 고딕", color: "999999", italics: true }),
        ],
      }),
    ],
  }],
});

const buffer = await Packer.toBuffer(doc);
fs.writeFileSync("LogicCanvas_기획서.docx", buffer);
console.log("워드 파일이 생성되었습니다: LogicCanvas_기획서.docx");
