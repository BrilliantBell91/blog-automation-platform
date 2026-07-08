# Notion CMS 블로그 자동화 플랫폼 개발 로드맵

Notion을 단일 정보원으로 활용하여 자체 블로그 웹사이트를 자동 생성하고, 네이버 블로그 포스팅 초안을 반자동으로 생성하는 플랫폼입니다.

## 개요

Notion CMS 블로그 자동화 플랫폼은 블로거를 위한 콘텐츠 관리 및 자동 배포 시스템으로 다음 기능을 제공합니다:

- **Notion 데이터 자동 동기화**: Notion에서 작성한 글을 실시간으로 공개 웹사이트에 반영
- **공개 블로그 웹사이트**: 반응형 디자인의 블로그 사이트(홈, 상세, 카테고리, 검색)
- **네이버 포스팅 초안 자동 생성**: LLM을 활용한 스타일 변환 및 관리자 검수 시스템
- **관리자 대시보드**: 초안 상태 관리 및 미리보기 기능

## 기술 스택

- **Frontend**: Next.js 16 (App Router), TypeScript, Tailwind CSS v4, shadcn/ui
- **Backend**: Node.js, Notion API (@notionhq/client), LLM API (Claude/OpenAI), Prisma ORM
- **Database**: SQLite (Prisma)
- **Authentication**: NextAuth v5
- **Deployment**: Vercel (ISR/On-Demand Revalidation)
- **Testing**: Playwright MCP

## 개발 워크플로우

1. **작업 계획**: PRD 분석 및 기술적 의존성 파악
2. **작업 생성**: Task 단위로 개발 가능한 크기로 분해
3. **작업 구현**: 각 Task의 구체적 구현 사항 수행 및 테스트
4. **로드맵 업데이트**: Phase별 진행 상황 추적

---

## Phase 1: 애플리케이션 골격 구축

### Task 001: Notion CMS 라우팅 및 레이아웃 구조 설계 - 우선순위

**목표**: 전체 애플리케이션의 라우팅 구조와 공통 레이아웃 골격을 구성

**구현 사항**:
- Next.js App Router 기반 전체 라우트 구조 생성
  - `src/app/(public)/page.tsx` - 홈페이지 (스켈레톤)
  - `src/app/(public)/posts/[id]/page.tsx` - 포스트 상세 페이지
  - `src/app/(public)/category/[name]/page.tsx` - 카테고리 필터링 페이지
  - `src/app/(public)/search/page.tsx` - 검색 페이지
  - `src/app/login/page.tsx` - 관리자 로그인 (기존 유지)
  - `src/app/(admin)/admin/drafts/page.tsx` - 초안 대시보드
- 공통 레이아웃 컴포넌트 구조
  - `src/app/(public)/layout.tsx` - 공개 영역 레이아웃 (헤더, 풋터, 사이드바)
  - `src/app/(admin)/layout.tsx` - 관리자 영역 레이아웃 (보호된 라우트)
- shadcn/ui 기반 네비게이션 컴포넌트 골격
  - `src/components/Navigation.tsx` - 주 네비게이션
  - `src/components/AdminNav.tsx` - 관리자 네비게이션
- Tailwind CSS v4를 활용한 기본 스타일 구조 설정

---

### Task 002: 데이터 타입 정의 및 Prisma 스키마 설계

**목표**: 데이터베이스 스키마와 TypeScript 타입 정의로 전체 애플리케이션의 데이터 구조 확립

**구현 사항**:
- TypeScript 타입 정의 파일 생성 (`src/types/index.ts`)
  - `Post` 타입: id, title, content, excerpt, category, tags, imageUrl, notionId, publishedAt, createdAt, updatedAt
  - `Draft` 타입: id, postId, generatedContent, status('미생성'|'생성됨'|'게시완료'), createdAt, updatedAt
  - `User` 타입: id, email, passwordHash, neverStyleGuide, createdAt, updatedAt
  - `SearchQuery` 타입: query, limit, offset
  - `NotionBlock` 타입: id, type, content, imageUrl (Notion API 응답 매핑)
- Prisma 스키마 설계 (`prisma/schema.prisma`)
  - Post 모델: Notion 글 데이터 저장소
  - Draft 모델: 네이버 초안 및 상태 관리
  - User 모델: 관리자 정보 및 스타일 가이드 저장소
  - Account/Session 모델: NextAuth v5 통합
  - 관계 설정: Post-Draft (1:1), User-Draft (1:N), User-Post (1:N)
- API 응답 타입 정의 (`src/types/api.ts`)
  - `GetPostsResponse`, `GetPostResponse`, `SearchResponse`, `GenerateDraftResponse`
- 상수 정의 파일 생성 (`src/constants/index.ts`)
  - Notion 데이터베이스 ID, 필터 쿼리, API Rate Limit 설정

---

### Task 003: 공통 컴포넌트 및 유틸리티 함수 구조 설계

**목표**: 전체 애플리케이션에서 사용할 기본 컴포넌트와 유틸리티 함수 골격 구성

**구현 사항**:
- 기본 컴포넌트 구조 (`src/components/`)
  - `PostCard.tsx` - 포스트 카드 컴포넌트 (스켈레톤)
  - `PostList.tsx` - 포스트 목록 컴포넌트
  - `Pagination.tsx` - 페이지네이션 컴포넌트
  - `CategoryFilter.tsx` - 카테고리 필터 컴포넌트
  - `SearchBar.tsx` - 검색바 컴포넌트
  - `DraftPreview.tsx` - 초안 미리보기 컴포넌트
  - `AdminHeader.tsx` - 관리자 헤더
- 유틸리티 함수 파일 생성 (`src/lib/`)
  - `notion.ts` - Notion API 클라이언트 구조 (구현 제외)
  - `llm.ts` - LLM API 클라이언트 구조 (구현 제외)
  - `cache.ts` - 캐싱 유틸리티 구조 (구현 제외)
  - `validators.ts` - 데이터 검증 함수 (타입 정의만)
  - `formatters.ts` - 데이터 포맷팅 함수 (타입 정의만)
- 더미 데이터 생성 함수 (`src/lib/mockData.ts`)
  - `generateMockPosts()` - 더미 포스트 데이터 생성
  - `generateMockDraft()` - 더미 초안 데이터 생성

---

## Phase 2: UI/UX 완성 (더미 데이터 활용)

### Task 004: 공개 블로그 UI 컴포넌트 완성 - 우선순위

**목표**: 모든 공개 페이지의 UI를 더미 데이터로 완성하고 반응형 디자인 적용

**구현 사항**:
- 홈페이지 UI 완성 (`src/app/(public)/page.tsx`)
  - 최신 포스트 10개를 PostCard 컴포넌트로 표시
  - 무한 스크롤 또는 페이지네이션 UI 구현 (더미 데이터 활용)
  - 카테고리 필터 버튼 배치
  - 검색 기능으로 이동하는 배너/버튼
  - 모바일/태블릿/데스크톱 반응형 레이아웃
- PostCard 컴포넌트 완성 (`src/components/PostCard.tsx`)
  - 썸네일 이미지 표시 (더미 이미지)
  - 제목, 요약, 카테고리, 태그, 발행일 표시
  - 호버 효과 및 클릭 가능한 링크
  - Tailwind CSS 스타일링 (shadcn/ui 기반)
- 포스트 상세 페이지 UI 완성 (`src/app/(public)/posts/[id]/page.tsx`)
  - 포스트 제목, 메타데이터(작성자, 발행일, 수정일) 표시
  - 본문 콘텐츠 렌더링 영역
  - 썸네일 이미지 (최적화 준비)
  - 이전/다음 포스트 네비게이션 버튼
  - 공유 기능 버튼 (소셜 미디어)
  - 반응형 텍스트 크기 및 라인 높이
- 카테고리 필터링 페이지 UI (`src/app/(public)/category/[name]/page.tsx`)
  - 선택된 카테고리 표시
  - 해당 카테고리의 포스트 목록 (더미 데이터)
  - 다른 카테고리로 이동할 수 있는 필터 버튼
  - 포스트 수 표시
- 검색 페이지 UI (`src/app/(public)/search/page.tsx`)
  - 검색 쿼리 입력 필드
  - 검색 결과 목록 (더미 데이터)
  - 검색 결과 개수 표시
  - "검색 결과 없음" UI
  - 타입별(제목/태그/본문) 필터 버튼
- 반응형 디자인 및 접근성
  - 모든 페이지에서 Desktop(1200px), Tablet(768px), Mobile(375px) 최적화
  - 터치 친화적 버튼 크기 (최소 44x44px)
  - 색상 대비 WCAG AA 기준 준수
  - 의미 있는 alt 텍스트 및 ARIA 라벨

---

### Task 005: 관리자 인터페이스 UI 완성 ✅

**목표**: 관리자 영역의 모든 UI를 완성하고 더미 데이터로 검증

**구현 사항** (완료):
- ✅ 초안 대시보드 페이지 UI (`src/app/(admin)/admin/drafts/page.tsx`)
  - ✅ 포스트 목록 테이블: 포스트명, 작성일, 초안 상태(미생성/생성됨/게시완료), 수정일
  - ✅ 상태별 필터링 탭 (Tabs 컴포넌트, 개수 표시)
  - ✅ "초안 생성" 버튼 (목업: 900ms 지연 + toast 메시지)
  - ✅ 초안 미리보기 Sheet (기존 DraftPreview 재사용)
  - ✅ 초안 상태 변경 드롭다운 (DropdownMenu)
  - ✅ 클립보드 복사 버튼 (문단별/전체 복사, toast)
- ✅ DraftDashboard 클라이언트 컴포넌트 (`src/components/DraftDashboard.tsx`) - 신규 생성
  - ✅ 상태 관리 (필터, 항목, 미리보기, 생성 중)
  - ✅ 실시간 필터링 및 탭 개수 동기화
  - ✅ 목업 생성/상태 변경 로직
  - ✅ DraftPreview 통합
- ✅ 관리자 레이아웃 재배치 (`src/app/(admin)/layout.tsx`)
  - ✅ AdminHeader 최상단 마운트
  - ✅ AdminNav + main flex 행 구성
  - ✅ Toaster 마운트 (admin 영역 전용)
- ✅ 더미 데이터 활용 (generateMockDraftList 12개)
  - ✅ 상태별 고르게 분포 (미생성/생성됨/게시완료 각 4개)
  - ✅ 다양한 길이의 초안 샘플
  - ✅ 모든 기능 통합 테스트 완료

---

## Phase 3: 핵심 기능 구현

### Task 006: Notion 클라이언트 및 데이터 조회 함수 구현

**목표**: Notion API를 통해 실시간으로 포스트 데이터를 조회하는 시스템 구축

**구현 사항**:
- Notion API 클라이언트 초기화 (`src/lib/notion.ts`)
  - `@notionhq/client` 라이브러리 설치 및 초기화
  - 환경 변수에서 Notion Integration Token 및 Database ID 로드
  - 에러 처리 및 로깅 설정
- 포스트 데이터 조회 함수
  - `getPublishedPosts()`: 발행된 포스트 필터링 (published = true)
  - `getPostById(id)`: 특정 포스트 조회
  - `getPostsByCategory(category)`: 카테고리별 포스트 조회
  - `searchPosts(query)`: 제목, 태그, 본문에서 검색
  - `getCategories()`: 모든 카테고리 목록 조회
- 이미지 URL 만료 대응 전략
  - 이미지 렌더링 시점에 Notion API를 통한 재조회 (`refreshImageUrl()`)
  - 또는 S3/Blob Storage에 이미지 캐싱 (Phase 4에서 구현)
  - 캐싱된 이미지 URL 관리
- Notion API Rate Limit 대응
  - 재시도 로직 (exponential backoff): 최대 3회 재시도
  - 요청 큐잉 시스템 (분당 30회 제한 준수)
  - Rate Limit 초과 시 ISR 재검증 지연 처리
- TypeScript 타입 안전성
  - Notion 블록 타입에 맞게 응답 매핑 (`NotionBlock`, `NotionPage`)
  - 예외 처리: 잘못된 데이터 형식, 403/404 에러
- 테스트 체크리스트 (Playwright MCP)
  - 발행된 포스트 조회 테스트 (필터 정확성)
  - 미발행 포스트 제외 확인
  - 이미지 URL 재조회 시 유효성 검증
  - Rate Limit 도달 시 재시도 로직 동작 확인
  - 검색 기능 정확성 테스트 (제목, 태그, 본문)

---

### Task 007: 블로그 API 엔드포인트 구현

**목표**: 프론트엔드에서 필요한 데이터를 제공하는 REST API 엔드포인트 구축

**구현 사항**:
- GET `/api/posts` - 포스트 목록 조회
  - 쿼리 파라미터: page, limit (기본 10), sort (latest/popular)
  - 응답: { posts: Post[], total: number, hasMore: boolean }
  - Notion에서 데이터 조회 후 정렬/페이지네이션 처리
- GET `/api/posts/[id]` - 포스트 상세 조회
  - 경로 파라미터: id (포스트 ID)
  - 응답: { post: Post, previousPost?: Post, nextPost?: Post }
  - 이전/다음 포스트 자동 조회
- GET `/api/search` - 검색 기능
  - 쿼리 파라미터: q (검색어), type (title|tag|content|all), limit, offset
  - 응답: { results: Post[], total: number, query: string }
  - debounce 처리는 프론트엔드에서, 백엔드는 전체 검색 수행
- GET `/api/categories` - 카테고리 목록
  - 응답: { categories: string[] }
  - 모든 포스트에서 사용된 카테고리 집계
- 에러 처리
  - 400: 잘못된 쿼리 파라미터
  - 404: 포스트를 찾을 수 없음
  - 500: Notion API 에러 (사용자 친화적 메시지)
  - 429: Rate Limit 초과 (재시도 후 응답)
- 응답 캐싱 전략 (Phase 4에서 구체화)
  - 응답 헤더에 Cache-Control 설정
  - Notion API 호출 결과 메모리 캐싱
- 테스트 체크리스트 (Playwright MCP)
  - 모든 엔드포인트 정상 응답 확인
  - 페이지네이션 정확성 (limit, offset)
  - 검색 쿼리별 결과 정확성 (제목, 태그, 본문 포함)
  - 카테고리 필터 동작 확인
  - 에러 상황별 적절한 상태 코드 반환

---

### Task 008: NextAuth v5 관리자 인증 시스템 완성 - 우선순위

**목표**: NextAuth v5를 활용하여 관리자 로그인 및 세션 관리 구현

**구현 사항**:
- NextAuth v5 설정 강화 (`src/app/api/auth/[...nextauth]/route.ts`)
  - CredentialsProvider 설정: 이메일/비밀번호 검증
  - 데이터베이스 세션 관리 (Prisma adapter)
  - JWT 설정: 토큰 만료 시간, 갱신 전략
  - 콜백 함수: `authorized()`, `jwt()`, `session()`
  - 로그아웃 후 리다이렉트 경로 설정
- 관리자 라우트 보호 (`src/app/(admin)/layout.tsx`)
  - 미들웨어를 통한 세션 검증
  - 미인증 사용자 → `/login` 리다이렉트
  - 세션 만료 시 재로그인 처리
- 사용자 저장소 구축 (`src/lib/auth.ts`)
  - `hashPassword()`: bcrypt를 사용한 비밀번호 해싱
  - `verifyPassword()`: 비밀번호 검증
  - `getUserByEmail()`: 이메일로 사용자 조회
  - `createUser()`: 새 관리자 사용자 생성 (마이그레이션용)
- Prisma 통합
  - `PrismaAdapter` 사용으로 세션/계정 자동 관리
  - User, Account, Session, VerificationToken 모델 생성
- 보안 설정
  - CSRF 토큰 자동 생성
  - Secure 쿠키 (프로덕션)
  - SameSite=Strict 설정
- 테스트 체크리스트 (Playwright MCP)
  - 로그인 성공/실패 시나리오
  - 세션 유지 확인 (페이지 새로고침)
  - 세션 만료 후 자동 로그아웃
  - 미인증 사용자의 `/admin` 접근 차단 확인
  - 로그아웃 후 세션 삭제 확인

---

### Task 009: LLM 기반 네이버 포스팅 초안 생성 파이프라인 구축

**목표**: Claude 또는 OpenAI API를 활용한 스타일 변환 기능 구현

**구현 사항**:
- LLM 클라이언트 초기화 (`src/lib/llm.ts`)
  - Claude API (`@anthropic-ai/sdk`) 또는 OpenAI API 선택
  - 환경 변수에서 API 키 로드
  - 에러 처리 및 타임아웃 설정
- 네이버 스타일 가이드 프롬프트 엔지니어링
  - 기본 시스템 프롬프트: "당신은 네이버 블로그의 인기 있는 블로거입니다..."
  - 사용자 커스텀 스타일 가이드: User.neverStyleGuide 필드에서 로드
  - 예제 포함: 어투, 문단 길이, 해시태그 패턴, 이모지 사용 여부
- 초안 생성 함수 (`generateDraft()`)
  - 입력: Post 객체 (title, content, category, tags)
  - 프롬프트: 스타일 가이드 + 원본 콘텐츠
  - 출력: 변환된 초안 텍스트
  - 타임아웃: 30초 (길이 제한)
- 초안 생성 API 엔드포인트 (`POST /api/drafts/generate`)
  - 경로 파라미터: postId
  - 본문: { postId: string }
  - 응답: { draftId: string, content: string, status: "생성됨", createdAt: timestamp }
  - 동일 포스트에 대한 중복 요청 방지 (기존 초안 재생성)
- 초안 저장 및 상태 관리
  - Prisma를 통해 Draft 모델에 저장
  - 상태: 미생성 → 생성됨 (완료 시)
  - Draft 수정 불가 (재생성만 가능)
- 테스트 체크리스트 (Playwright MCP)
  - 정상적인 초안 생성 확인 (응답 시간, 텍스트 품질)
  - 스타일 가이드 반영 확인 (어투, 해시태그)
  - 타임아웃 처리 (30초 이상 소요)
  - 중복 요청 시 기존 초안 재사용 확인
  - API 에러 상황별 적절한 에러 메시지 반환

---

### Task 010: 초안 대시보드 기능 구현

**목표**: 관리자가 초안을 관리하고 네이버 블로그에 게시할 수 있는 기능 완성

**구현 사항**:
- 초안 목록 조회 API (`GET /api/admin/drafts`)
  - 쿼리 파라미터: status (all|미생성|생성됨|게시완료), limit, offset
  - 응답: { drafts: Draft[], total: number }
  - Prisma를 통해 Draft + Post 조인 쿼리
- 초안 상태 변경 API (`PATCH /api/admin/drafts/[id]/status`)
  - 경로 파라미터: draftId
  - 본문: { status: "미생성" | "생성됨" | "게시완료" }
  - 응답: { draftId: string, status: string, updatedAt: timestamp }
- 초안 미리보기 API (`GET /api/admin/drafts/[id]`)
  - 상세 초안 정보: content, generatedAt, status, postTitle, category
- 클립보드 복사 기능 (프론트엔드)
  - 초안 전체 복사
  - 문단별 복사 (여러 단락 지원)
  - 복사 성공/실패 토스트 메시지
- 초안 재생성 기능
  - "다시 생성" 버튼 → `/api/drafts/generate` 호출
  - 기존 초안 업데이트 또는 새로 생성 선택
- UI 상태 관리
  - 초안 생성 중 로딩 스피너
  - 생성 완료 후 자동 새로고침
  - 에러 발생 시 사용자 친화적 메시지
- 테스트 체크리스트 (Playwright MCP)
  - 초안 목록 필터링 정확성 (상태별)
  - 상태 변경 반영 확인
  - 클립보드 복사 정상 동작 (복사 가능한 텍스트 확인)
  - 초안 재생성 시 새로운 콘텐츠 생성 확인
  - 여러 포스트의 초안 동시 조회/편집 가능 여부

---

## Phase 4: 고급 기능 및 최적화

### Task 011: 이미지 최적화 및 성능 개선

**목표**: Next.js Image 컴포넌트를 활용한 이미지 최적화 및 성능 향상

**구현 사항**:
- Next.js Image 컴포넌트 적용 (`src/components/OptimizedImage.tsx`)
  - PostCard, 상세 페이지의 썸네일 이미지에 적용
  - `fill` prop을 사용한 반응형 이미지 크기 조정
  - WebP, AVIF 등 최신 이미지 포맷 자동 지원
  - Placeholder (blur 또는 empty)
- Lazy Loading 구현
  - 이미지 로드 지연 (loading="lazy")
  - Intersection Observer API를 통한 실제 보이는 영역만 로드
  - 무한 스크롤에서의 동적 이미지 로드
- Notion 이미지 URL 캐싱 전략
  - 만료된 이미지 URL을 Next.js의 이미지 최적화 API로 리프록시
  - S3/Blob Storage에 이미지 캐싱 (선택사항, 장기 보관 위해)
  - CDN 캐싱: 이미지 만료 시간(1시간) 내에만 캐시 유효
- 이미지 리사이징 및 품질 조정
  - 썸네일: 400x300px, quality 75
  - 본문 이미지: 800x600px, quality 85
  - 모바일: 376x300px (반응형)
- 성능 메트릭 추적 (선택사항)
  - LCP (Largest Contentful Paint), CLS (Cumulative Layout Shift) 모니터링
- 테스트 체크리스트
  - 이미지 로드 성공 확인
  - Lazy loading 동작 확인 (스크롤 시 이미지 로드)
  - 반응형 이미지 크기 확인 (Desktop/Mobile)
  - 만료된 Notion 이미지 URL의 캐싱 재조회

---

### Task 012: ISR 및 캐싱 전략 구현

**목표**: Vercel ISR과 On-Demand Revalidation을 활용한 성능 최적화

**구현 사항**:
- ISR (Incremental Static Regeneration) 설정
  - 홈페이지: `revalidate = 3600` (1시간마다 재생성)
  - 카테고리 페이지: `revalidate = 3600`
  - 포스트 상세 페이지: `revalidate = 600` (10분마다 재생성)
  - 검색 페이지: 동적 렌더링 (캐싱 불가)
- On-Demand Revalidation API
  - `POST /api/revalidate` - 특정 경로 즉시 재검증
  - 경로 파라미터: path (예: "/", "/posts/[id]", "/category/[name]")
  - 인증: 관리자 전용 (NextAuth 세션 검증)
  - Notion 데이터 변경 시 webhook에서 호출
- 관리자 대시보드의 캐시 무효화
  - 초안 생성 후 해당 포스트의 상세 페이지 재검증
  - 포스트 공개/비공개 변경 시 홈페이지 재검증
- Notion API 응답 캐싱
  - Redis 또는 메모리 기반 캐싱 (선택사항)
  - TTL: 10-30분
  - 캐시 키: `notion:post:{id}`, `notion:posts:page:{num}`
- 동적 경로의 정적 생성 최적화
  - `generateStaticParams()` 함수로 미리 생성할 경로 지정
  - 상위 N개 카테고리와 인기 포스트의 정적 생성
- 테스트 체크리스트
  - ISR 설정 확인 (빌드 후 페이지 생성 시간)
  - On-Demand Revalidation 호출 시 페이지 재생성 확인
  - 캐시 무효화 후 새로운 콘텐츠 반영 확인
  - 성능 메트릭 개선 확인 (빌드 시간, TTFB)

---

### Task 013: 테스트 및 배포 준비

**목표**: 전체 시스템의 품질 보증 및 Vercel 배포 준비

**구현 사항**:
- E2E 테스트 작성 (Playwright)
  - 사용자 플로우: 홈 → 포스트 상세 → 카테고리 필터 → 검색
  - 관리자 플로우: 로그인 → 초안 생성 → 상태 변경 → 복사
  - 에러 시나리오: 404, 타임아웃, API 실패
  - 반응형 테스트: Desktop, Tablet, Mobile에서의 플로우 확인
- 단위 테스트
  - Notion 클라이언트 함수 테스트
  - LLM 초안 생성 함수 테스트 (Mock API)
  - 유틸리티 함수 테스트 (formatters, validators)
- API 통합 테스트
  - 모든 엔드포인트의 정상/에러 응답 확인
  - Rate Limit 처리 확인
  - 데이터베이스 상태 검증
- 배포 설정 (Vercel)
  - `vercel.json` 설정 (환경 변수, 빌드 명령어)
  - 환경 변수 설정: Notion Token, LLM API 키, 데이터베이스 URL
  - 동적 라우트 설정 (ISR revalidate)
  - 에러 페이지 커스터마이징 (404, 500)
- 성능 검사
  - Lighthouse 점수 확인 (Performance, Accessibility, Best Practices)
  - Core Web Vitals 최적화 (LCP, FID, CLS)
- 보안 검사
  - 민감한 정보(API 키) 노출 확인
  - CORS 설정 검증
  - XSS/CSRF 취약점 점검
- 모니터링 및 로깅 설정
  - Vercel Analytics 활성화
  - 에러 로깅 (Sentry 또는 Vercel Functions logs)
  - 성능 모니터링
- 테스트 체크리스트
  - 모든 E2E 테스트 통과
  - API 통합 테스트 통과
  - Lighthouse 점수 90 이상 (Performance)
  - Core Web Vitals 우수 (LCP < 2.5s, CLS < 0.1)
  - 환경별 배포 검증 (staging → production)

---

## 주요 기술적 고려사항

### Notion API Rate Limit 대응
- 분당 3회 (IP당), 30회 (사용자당) 제한
- 재시도 로직: exponential backoff (1s → 2s → 4s)
- ISR/On-Demand Revalidation을 통한 불필요한 요청 최소화

### Notion 이미지 URL 만료 문제
- URL 만료: 약 1시간
- 대응 방안: 렌더링 시점에 재조회 또는 S3/Blob에 캐싱
- 구현: Task 006에서 정의된 `refreshImageUrl()` 함수 활용

### 검색 기능 최적화
- Debounce 적용 (250ms): 프론트엔드에서 구현
- 백엔드: 전문(title, content, tags) 검색 지원
- 대소문자 구분 안 함, 부분 검색 지원

### 네이버 스타일 초안의 품질 보증
- 사용자가 정의한 스타일 가이드 반영
- 프롬프트 엔지니어링: 명확한 지시사항 + 예제 포함
- 관리자 검수 및 수정 가능 (선택)

### NextAuth v5 세션 관리
- JWT 토큰 기반 세션 (Prisma adapter)
- 토큰 만료: 30일
- Refresh Token 자동 갱신

---

## 예상 일정

| Phase | 기간 | 주요 산출물 |
|-------|------|-----------|
| Phase 1 | 1-2주 | 라우트 구조, 타입 정의, 데이터베이스 스키마 |
| Phase 2 | 2-3주 | 모든 공개/관리자 페이지 UI (더미 데이터) |
| Phase 3 | 3-4주 | Notion 연동, LLM 초안, API, 인증 시스템 |
| Phase 4 | 2주 | 성능 최적화, 테스트, 배포 |
| **전체** | **8-12주** | **완성된 Notion CMS 블로그 플랫폼** |

---

## 성공 기준

✅ **기능 완성도**
- 모든 공개 페이지(홈, 상세, 카테고리, 검색) 정상 작동
- 관리자 초안 생성 및 관리 기능 완성
- Notion 데이터 실시간 동기화

✅ **성능**
- Lighthouse 점수 90 이상
- Core Web Vitals: LCP < 2.5s, CLS < 0.1
- API 응답 시간 < 500ms

✅ **보안**
- NextAuth 인증 구현 (관리자 보호)
- 민감 정보 보호 (API 키 안전 관리)
- CORS, CSRF, XSS 보안 검사 통과

✅ **테스트**
- E2E 테스트 100% 통과
- API 통합 테스트 통과
- 반응형 디자인 검증 (Desktop/Tablet/Mobile)

✅ **배포**
- Vercel 배포 성공
- ISR 설정 확인
- 모니터링 대시보드 활성화

---

**마지막 업데이트**: 2025-07-03
