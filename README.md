# Team Yez1 Landing Service

피그마의 `main / about / work / work_detail / contact` 구조를 기준으로 재구성한 포트폴리오 사이트입니다. 현재는 `Vercel + MongoDB Atlas` 기반으로 동작하고, 미디어 저장도 Mongo/GridFS로 통일되어 있습니다.

## 실행

서버가 포함되어 있어서 아래처럼 실행합니다.

```bash
npm install
npm start
```

브라우저에서 `http://localhost:8080`을 열면 됩니다.

## 현재 운영 구성

- 앱 배포: `Vercel`
- 상태 저장: `MongoDB Atlas`
- 미디어 저장: `Mongo/GridFS`
- `404.html` 포함: 잘못된 경로 접근 시 기본 안내 제공
- `site.webmanifest` 포함: 기본 PWA 메타 구성

## 관리자 페이지

- 경로: `./admin.html`
- 기본 로그인: `admin@ty`
- 기본 비밀번호: `fitpick123!`
- 저장 방식: 서버 API + MongoDB

관리자 페이지는 `대문 관리 / 회사 소개 관리 / 상품 관리 / 문의 관리` 구조로 다시 정의되어 있고,
공개 페이지는 `index / about / work / work-detail / contact`로 나뉘어 같은 저장소 데이터를 읽습니다.

## 환경 변수

```bash
MONGODB_URI=...
MONGODB_DB_NAME=ty_portfolio
PORT=8080
```

헬스 체크 경로:

```bash
/health
```

## 포함 내용

- 싱글 페이지 랜딩 구조
- 작업 카테고리 필터
- 프로젝트 클릭 시 상세 섹션 갱신
- 모바일 메뉴
- 문의 폼 기본 검증
- 메일 클라이언트로 연결되는 문의 전송
- 문의 내용 클립보드 복사

## 참고

피그마 MCP 호출 제한으로 세부 스타일 토큰과 실제 이미지 자산은 전부 가져오지 못해, 동일한 정보 구조를 유지하면서 아트 디렉션 톤의 플레이스홀더 비주얼로 구현했습니다.
