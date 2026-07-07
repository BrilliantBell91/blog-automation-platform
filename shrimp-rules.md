# Development Guidelines

AI Agent(Coding Agent) 전용 운영 규칙 문서입니다. 일반적인 Next.js/TypeScript/Tailwind 지식은 다루지 않으며, 이 저장소에서만 유효한 규칙만 기술합니다.

## 프로젝트 개요

- **제품**: Notion을 CMS로 사용하는 블로그 자동화 플랫폼. 공개 웹사이트(홈/상세/카테고리/검색) + 네이버 블로그 포스팅 초안 반자동 생성 관리자 대시보드.
- **기술 스택**: Next.js 16.2.9(App Router), TypeScript(strict), Tailwind CSS v4, shadcn/ui, Prisma 7 + SQLite, NextAuth v5(beta), `@notionhq/client`(미설치, Task 006에서 도입).
- **진행 상태**: Phase 1(Task 001~003, 라우팅/타입/스켈레톤 컴포넌트) 완료. Phase 2(Task 004~005, 더미 데이터로 UI 완성)가 다음 단계. 상세 계획은 `docs/ROADMAP.md`, 요구사항은 `docs/PRD.md` 참조 (둘 다 `CLAUDE.md`가 자동 임포트).

## 최우선 규칙: 이 저장소의 Next.js는 표준과 다르다

- **모든 코드 작성 전에 `node_modules/next/dist/docs/`의 관련 가이드를 확인해야 한다.** `AGENTS.md`에 명시된 프로젝트 최상위 규칙이며 생략 불가.
- 이미 반영된 Next.js 16 Breaking Change를 되돌리지 말 것:
  - `page.tsx`/`layout.tsx`의 `params`, `searchParams`는 `Promise<...>` 타입이며 반드시 `await`. 예: `src/app/(public)/posts/[id]/page.tsx`가 정석 패턴 — 새 동적 라우트를 추가할 때 동일 패턴을 따를 것.
  - Route Handler(`app/api/**/route.ts`)를 추가할 때도 `segmentData.params`는 Promise로 취급.
  - 미들웨어가 필요하면 파일명은 `middleware.ts`가 아니라 `proxy.ts`, export 함수명은 `proxy` (Edge 런타임이 필요한 경우에만 예외적으로 `middleware.ts` 유지 — 이 프로젝트는 해당 없음).
  - `next/legacy/image` 사용 금지, `next/image` + `images.remotePatterns`만 사용(`images.domains` 금지). Notion 이미지 도메인을 다룰 때 `next.config.ts`의 `images.remotePatterns`에 추가.
  - `revalidateTag()`는 반드시 두 번째 인자(`cacheLife` 프로필, 예: `'max'`)를 전달. 단일 인자 호출은 타입 에러 발생.
  - `next lint`는 제거됨 — 린트는 `npm run lint`(ESLint CLI, flat config) 사용.
  - `next dev`/`next build`는 Turbopack이 기본이므로 `package.json` scripts에 `--turbopack` 플래그를 추가하지 말 것.

## 프로젝트 아키텍처

```
src/app/(public)/...        공개 라우트 (홈/상세/카테고리/검색)
src/app/(admin)/admin/...   관리자 라우트 (인증 보호 대상, 아직 가드 미구현)
src/app/login/              관리자 로그인
src/app/api/auth/[...nextauth]/route.ts   NextAuth v5 핸들러
src/auth.ts                 NextAuth 설정 (Credentials provider — 현재 더미 계정 하드코딩)
src/components/             공용 UI 컴포넌트 (Task 003/005에서 골격만 존재)
src/components/ui/          shadcn/ui 컴포넌트 (자동 생성물, registry 명령으로만 추가/갱신)
src/lib/notion.ts           Notion API 클라이언트 — 모든 함수가 의도적으로 throw (Task 006 이전)
src/lib/llm.ts              LLM 초안 생성 클라이언트 — 의도적으로 throw (Task 009 이전)
src/lib/cache.ts            캐싱 유틸 — 의도적으로 throw (Task 012 이전)
src/lib/mockData.ts         Phase 2 UI 개발에 사용할 더미 데이터 생성 함수
src/lib/db.ts               Prisma 클라이언트 싱글턴
src/types/index.ts          도메인 타입 (Post, Draft, User, NotionBlock 등)
src/types/api.ts            API 요청/응답 타입
src/constants/index.ts      상태값 상수(POST_STATUS, DRAFT_STATUS), Notion Rate Limit 등
prisma/schema.prisma        DB 스키마 (SQLite, Prisma 7)
src/generated/prisma/       `prisma generate`가 생성하는 클라이언트 코드
```

## 코드 표준 (프로젝트 한정 사항만)

- **한국어 상태값 리터럴을 그대로 사용한다.** `PostStatus = '초안' | '발행됨' | '보관됨'`, `DraftStatus = '미생성' | '생성됨' | '게시완료'`. 영어 enum(`DRAFT`, `PUBLISHED` 등)으로 바꾸지 말 것 — Notion Select 필드 값과 DB 문자열이 한국어 그대로 저장된다.
- 새 상태값이나 필드를 추가할 때는 아래 3개 파일을 **동시에** 갱신한다 (하나만 고치면 타입/런타임 불일치 발생):
  1. `prisma/schema.prisma`
  2. `src/types/index.ts`
  3. `src/constants/index.ts` (`POST_STATUS`/`DRAFT_STATUS`/관련 Record)
- Prisma 스키마를 변경한 뒤에는 `npx prisma migrate dev`(또는 동등 명령)로 마이그레이션을 생성하고 클라이언트를 재생성한다. **`src/generated/prisma/` 아래 파일을 직접 편집하지 않는다** — 재생성 시 덮어써진다.
- shadcn/ui 컴포넌트를 추가/변경할 때는 `mcp__shadcn__*` 도구(또는 `npx shadcn add`)로 공식 registry에서 받는다. `src/components/ui/*`에 손으로 컴포넌트를 새로 작성하지 않는다.
- 주석은 한국어로 작성한다(사용자 전역 규칙). 변수/함수명은 영어를 유지한다.

## 기능 구현 순서 규칙 (로드맵 의존성)

- **Task 006(Notion 연동)이 완료되기 전까지 `src/lib/notion.ts`의 스텁 함수를 구현하지 않는다.** Phase 2(UI, Task 004~005) 작업 중에는 페이지 컴포넌트가 `src/lib/mockData.ts`의 `generateMockPosts()`/`generateMockDraft()`만 사용하도록 연결한다.
- **Task 009(LLM 초안 생성)가 시작되기 전까지 `src/lib/llm.ts`의 `generateNaverDraft()`를 구현하지 않는다.** 이 함수의 시그니처(현재 인자 없음)는 ROADMAP Task 009 스펙(Post 객체를 받아 프롬프트 구성)에 맞춰 재정의될 예정이므로, 조기에 구현·호출부를 만들지 말 것.
- **Task 008(NextAuth 완성)이 시작되기 전까지:**
  - `src/auth.ts`의 하드코딩된 자격증명(`admin@example.com`/`password`)을 실제 DB 조회 로직으로 교체하지 않는다.
  - `src/app/(admin)/layout.tsx`의 `// TODO Task 008: auth() 세션 체크` 주석을 실제 인증 가드 코드로 바꾸지 않는다. Phase 2 단계에서는 UI만 완성한다.
- `src/lib/cache.ts`, ISR/On-Demand Revalidation 관련 코드는 Task 012 이전에 구현하지 않는다.
- 각 파일의 "Not implemented — Task N" `throw Error` 문구는 해당 Task를 실제로 수행할 때만 제거한다. 임의로 조기에 목업 반환값으로 바꾸지 말 것 — 미구현 상태임을 명시적으로 드러내는 것이 이 프로젝트의 의도된 설계다.

## 문서/로드맵 동기화 규칙

- `docs/ROADMAP.md`, `docs/PRD.md`는 `CLAUDE.md`가 자동 로드하는 프로젝트 컨텍스트다. Task 상태나 범위를 변경하는 작업을 하면 `docs/ROADMAP.md`의 해당 Task 항목도 함께 갱신한다(체크박스/설명 수준). 로드맵 구조를 크게 바꿔야 할 때는 `development-planner` 에이전트 컨벤션(한국어, 기존 Phase/Task 번호 체계 유지)을 따른다.
- PRD와 ROADMAP의 내용이 충돌하면(예: LLM 제공자 미정 등 `PRD.md` 12장의 Open Issues), 코드에 특정 선택을 강제로 확정하지 말고 미정 상태를 유지하거나 사용자에게 확인한다.

## AI 의사결정 기준 (모호한 상황 처리)

- 새 페이지/컴포넌트가 필요한데 어느 라우트 그룹에 넣을지 애매하면: 인증이 필요 없는 콘텐츠는 `(public)`, 관리자 전용 기능은 `(admin)`에 배치한다.
- 새로운 Notion 필드나 상태값을 다뤄야 하는데 PRD/ROADMAP에 명시가 없으면: 임의로 새 값을 만들지 말고 `PRD.md` 6장(Notion 데이터베이스 구조)과 대조해 결정하고, 불명확하면 사용자에게 확인한다.
- 라이브러리 사용법(Prisma 7 API, NextAuth v5 beta API, Next.js 16 API)이 학습 데이터와 다를 수 있다고 판단되면 `node_modules/next/dist/docs/`(Next.js) 또는 Context7 MCP(그 외 라이브러리)로 먼저 확인한 뒤 작성한다.

## 금지 사항

- **금지**: `src/generated/prisma/` 내부 파일을 직접 수정.
- **금지**: Task 006/009/012 완료 전 해당 스텁 함수를 조기 구현하거나 호출부를 실제 로직처럼 연결.
- **금지**: `middleware.ts` 파일명 사용(이 프로젝트에서 Edge 런타임이 필요한 근거 없음) — 필요 시 `proxy.ts`/`proxy()` 사용.
- **금지**: `params`/`searchParams`를 동기적으로 접근(구조 분해 시 `await` 누락).
- **금지**: 상태값을 한국어 리터럴에서 영어 enum으로 임의 변경.
- **금지**: `next.config.ts`에 `--turbopack` 플래그나 `images.domains`(deprecated) 사용.
- **금지**: shadcn/ui 컴포넌트를 registry 명령 없이 수동으로 `src/components/ui/`에 작성.
