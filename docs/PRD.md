# Notion CMS 블로그 자동화 플랫폼 — Product Requirements Document (PRD)

**Project:** Notion CMS 기반 블로그 콘텐츠 관리 및 네이버 블로그 반자동 포스팅  
**Version:** 1.0  
**Date:** 2026-07-01  
**Status:** MVP 개발 계획

---

## 1. 개요 및 배경

### 1.1 문제 정의

사용자는 현재 네이버 블로그(https://blog.naver.com/zmfflsp)에서 맛집, 육아, 결혼 관련 글을 직접 작성하고 있다. 매 글마다 다음 프로세스를 반복한다:

1. 로컬에서 사진 정리 및 텍스트 작성
2. 네이버 블로그 에디터를 열어 수동으로 포맷팅 및 게시
3. 별도로 웹사이트나 포트폴리오에서 글을 관리해야 함

이 과정은 **중복 작업**과 **일관성 관리의 어려움**을 야기한다.

### 1.2 제안 솔루션

**Notion CMS + 블로그 자동화 플랫폼**:

- **Notion을 단일 정보원(Single Source of Truth)으로**: 글 제목, 이미지, 본문, 카테고리, 태그, 발행일 등을 한 곳에서 관리
- **자체 블로그 웹사이트 자동 생성**: Notion 데이터베이스를 Next.js 기반 공개 웹사이트로 발행
- **네이버 블로그 초안 반자동 생성**: Notion 콘텐츠를 기존 블로그의 스타일(어투, 형식, 해시태그)에 맞춰 자동 변환 → 관리자가 검토 후 게시

### 1.3 핵심 목표

1. Notion을 통한 **중앙 집중식 콘텐츠 관리**
2. **자체 블로그 웹사이트**의 완전 자동 생성·업데이트
3. 네이버 블로그 포스팅 **반자동화**(수동 검수 기반으로 안전성 확보)
4. 반응형 디자인으로 **모바일 접근성** 확보

---

## 2. 목표 및 범위

### 2.1 MVP(Minimum Viable Product) 범위

**포함 사항:**

- Notion API 연동 및 데이터베이스 구조 설계
- Notion 글 목록 및 상세 페이지 표시 웹사이트
- 카테고리별 필터링, 검색 기능
- 반응형 디자인(Desktop/Mobile)
- **네이버 포스팅 초안 자동 생성**: LLM(Claude 또는 OpenAI)을 활용해 Notion 콘텐츠를 기존 블로그 스타일에 맞춰 변환
- 관리자 인증 기반 초안 미리보기/복사 화면

**제외 사항 (Phase 2 후보):**

- ❌ **네이버 블로그 완전 자동 게시**: 브라우저 자동화(Playwright/Puppeteer)를 통한 로그인·포스팅
  - **이유**: 네이버는 블로그 글쓰기용 공식 API를 제공하지 않으며, 자동 로그인·포스팅은 네이버 이용약관 위반 및 계정 정지 리스크 존재
  - **대신**: 생성된 초안 텍스트를 관리자가 복사해 수동으로 네이버 에디터에 붙여넣는 반자동 방식 채택
- 고급 SEO 최적화 (메타 태그, sitemap 동적 생성 등)
- 댓글/피드백 시스템
- 다중 관리자 권한 관리

---

## 3. 사용자 시나리오

### 3.1 Primary User Journey (단일 운영자 기준)

**목표**: Notion에서 글을 작성하면 자동으로 자체 웹사이트에 발행되고, 네이버용 초안도 생성되도록

**스텝**:

1. **Notion에 글 작성**
   - 제목, 카테고리(맛집/육아/결혼 등), 태그 입력
   - 이미지 업로드, 본문 작성
   - Status를 "초안"으로 설정

2. **검토 및 발행**
   - 글을 다시 읽고 필요시 수정
   - Status를 "발행됨"으로 변경

3. **자동 발행**
   - **자체 웹사이트**: Status "발행됨"인 글이 실시간으로 홈/카테고리 페이지에 표시
   - **네이버 초안 생성**: 같은 글에 대해 LLM이 기존 블로그 스타일 가이드(문단 구성, 어투, 해시태그)를 참고해 포스팅 초안 자동 생성
   - 관리자는 초안 미리보기 화면에서 초안 텍스트 복사

4. **네이버 게시**
   - 초안을 복사해 네이버 블로그 에디터에 붙여넣기
   - 필요시 손수 편집(레이아웃, 이미지 재배치 등)
   - 네이버에 게시

5. **상태 추적** (Optional)
   - Notion에 `NaverPostUrl` 필드를 입력해 네이버 포스팅 완료 기록

---

## 4. 주요 기능

### 4.1 공개 사이트 기능 (Notion 뷰어)

#### 1) 글 목록 페이지 (Home)
- 최신 발행된 글 10개 표시 (정렬: Published 내림차순)
- 글 카드: 제목, 썸네일 이미지, 요약, 발행일, 카테고리 배지
- 무한 스크롤 또는 페이지네이션

#### 2) 글 상세 페이지
- 제목, 발행일, 카테고리, 태그 메타데이터 표시
- 본문 콘텐츠 렌더링(마크다운/블록 형식)
- 이미지 최적화(lazy loading, 반응형 크기 조정)
- 이전/다음 글 네비게이션

#### 3) 카테고리 필터링
- 사이드바 또는 상단 탭: "맛집", "육아", "결혼" 등 선택 가능
- 선택한 카테고리 글만 필터링 표시
- URL 파라미터 기반 상태 유지 (e.g., `/?category=맛집`)

#### 4) 검색 기능
- 헤더 검색 바: 제목, 태그, 본문 내용 전체 검색
- 실시간 검색 결과 (debounce 적용)
- 검색 결과 페이지: 관련도 순 정렬

#### 5) 반응형 디자인
- **Desktop**: 넓은 레이아웃, 사이드바 필터
- **Tablet**: 2-3열 그리드, 접이식 메뉴
- **Mobile**: 단일 열, 하단 탭 네비게이션
- 터치 친화적 UI (버튼 크기, 간격 조정)

### 4.2 관리자 기능

#### 6) 네이버 포스팅 초안 생성 및 미리보기
- **생성 과정**:
  1. Notion 글 데이터(제목, 본문, 이미지)를 LLM(Claude/OpenAI) API로 전송
  2. 프롬프트에 "기존 네이버 블로그 스타일 가이드" 포함:
     - 어투: 친근하고 실용적 (예: "~예요", "~네요", "~더라고요")
     - 문단 구성: 장황하지 않은 짧은 문단
     - 해시태그: 맛집은 `#가성비 #분위기` 형식, 육아는 `#육아팁 #생활용품` 등
     - 이미지 설명: 간결한 캡션 추가
  3. LLM이 변환된 초안 텍스트 반환
  4. 관리자 전용 대시보드에서 미리보기 + 텍스트 복사 버튼 제공

- **미리보기 화면**:
  - 생성된 초안을 마크다운 또는 HTML 미리보기로 표시
  - "복사" 버튼: 초안 전체 텍스트 클립보드에 복사
  - 초안 생성 상태 표시 (미생성/생성됨/게시완료)

---

## 5. 기술 스택

### 5.1 Frontend & Framework

| 항목 | 기술 | 버전 | 비고 |
|------|------|------|------|
| **프레임워크** | Next.js (App Router) | 16.2.9 | 기존 프로젝트 템플릿 유지 |
| **언어** | TypeScript | ^5 | 타입 안정성 |
| **스타일링** | Tailwind CSS | ^4 | 유틸리티 우선 CSS |
| **UI 컴포넌트** | shadcn/ui | ^4.12.0 | Button, Card, Input, Label 등 |
| **아이콘** | Lucide React | - | UI 아이콘 |

### 5.2 Backend & Infrastructure

| 항목 | 기술 | 목적 |
|------|------|------|
| **CMS** | Notion API (@notionhq/client) | 콘텐츠 조회 및 관리 |
| **데이터베이스** | SQLite (Prisma ORM) | 초안 생성 상태, 관리자 인증 토큰 저장 |
| **인증** | NextAuth v5 | 관리자 전용 초안 미리보기 화면 보호 |
| **LLM 프롬프팅** | Claude API 또는 OpenAI API | 초안 자동 생성 (미정 — 추후 결정) |
| **배포** | Vercel | Edge Functions, ISR 활용 |

### 5.3 개발 도구 & 프로세스

- **번들러**: Next.js 기본 (Turbopack)
- **패키지 관리**: npm
- **코드 품질**: ESLint, TypeScript strict mode
- **환경 변수**: `.env.local` (Notion API 키, LLM API 키, NextAuth 시크릿)

---

## 6. Notion 데이터베이스 구조

### 6.1 필수 필드

| 필드명 | 타입 | 설명 | 필수 |
|--------|------|------|------|
| **Title** | Title | 글 제목 | ✅ |
| **Category** | Select | 카테고리 (맛집, 육아, 결혼 등) | ✅ |
| **Tags** | Multi-Select | 태그 (최대 5개 권장) | ❌ |
| **Published** | Date | 발행일 | ✅ |
| **Status** | Select | 상태 (초안, 발행됨, 보관됨) | ✅ |
| **Content** | Page Content | 본문 (블록 형식) | ✅ |

### 6.2 신규 추가 필드 (초안 생성 파이프라인)

| 필드명 | 타입 | 설명 | 필수 |
|--------|------|------|------|
| **NaverDraftStatus** | Select | 초안 생성 상태 (미생성, 생성됨, 게시완료) | ❌ |
| **NaverPostUrl** | URL | 게시된 네이버 포스팅 링크 | ❌ |

### 6.3 Notion 데이터베이스 설정 사항

- **보기**: "발행된 글" (Status = "발행됨" 필터), "카테고리별" (Group by Category)
- **정렬**: Published (내림차순)
- **아이콘**: 블로그 테마에 맞는 이모지 (e.g., 📝)

---

## 7. 화면 구성 (UI/UX)

### 7.1 공개 웹사이트

#### 홈 페이지 (`/`)
```
┌─ Header ─────────────────────────────────┐
│  Logo  Search Bar     Category Filter    │
└───────────────────────────────────────────┘
┌─ Main Content ────────────────────────────┐
│ [Latest Posts Grid]                       │
│ ┌─────────────────┐  ┌─────────────────┐ │
│ │ Post Card 1     │  │ Post Card 2     │ │
│ │ [Thumbnail]     │  │ [Thumbnail]     │ │
│ │ Title...        │  │ Title...        │ │
│ └─────────────────┘  └─────────────────┘ │
│ ┌─ Load More / Pagination ────────────┐ │
└───────────────────────────────────────────┘
```

#### 글 상세 페이지 (`/posts/[id]`)
```
┌─ Header ──────────────────────────────────┐
└───────────────────────────────────────────┘
┌─ Article ─────────────────────────────────┐
│ [Featured Image - 100% width]             │
│ Title: "맛집 제목"                         │
│ Meta: 2026-07-01 | 맛집 | #서울 #카페    │
│ ─────────────────────────────────────────│
│ [Content with images, paragraphs, etc.]   │
│                                           │
│ Tags: #카페 #디저트                       │
│ ─────────────────────────────────────────│
│ [Previous Post] | [Next Post]             │
└───────────────────────────────────────────┘
```

#### 카테고리 페이지 (`/category/[name]`)
- 선택 카테고리의 글 목록을 홈과 동일 구성으로 표시

### 7.2 관리자 페이지 (인증 필수)

#### 초안 관리 대시보드 (`/admin/drafts`)
```
┌─ Header ──────────────────────────────────┐
│ 관리자 페이지 | Logout                    │
└───────────────────────────────────────────┘
┌─ Draft List ──────────────────────────────┐
│ Notion 글 제목                             │
│ Status: [ ] 미생성 / [✓] 생성됨            │
│ NaverDraftStatus: 미생성 | 생성됨 | 게시완료 │
│ [View Draft] [Regenerate] [Mark as Posted] │
├───────────────────────────────────────────┤
│ ... (다른 글들)                            │
└───────────────────────────────────────────┘
┌─ Draft Preview ───────────────────────────┐
│ [선택한 글의 초안 미리보기]                 │
│ ┌─────────────────────────────────────┐  │
│ │ 생성된 초안 텍스트 (마크다운)         │  │
│ └─────────────────────────────────────┘  │
│ [Copy to Clipboard] [Edit] [Regenerate]   │
└───────────────────────────────────────────┘
```

---

## 8. 시스템 아키텍처

### 8.1 데이터 흐름도

```
┌─────────────┐
│   Notion    │
│ Database    │
└──────┬──────┘
       │ (Notion API)
       ▼
┌──────────────────────────────────────────────┐
│         Next.js Application (Vercel)          │
├──────────────────────────────────────────────┤
│ ┌─ Public Routes ──────────────────────────┐ │
│ │ GET /                 (홈)                 │ │
│ │ GET /posts/[id]      (상세)                │ │
│ │ GET /category/[name] (카테고리)            │ │
│ │ GET /search          (검색)                │ │
│ └──────────────────────────────────────────┘ │
│                                              │
│ ┌─ Admin Routes (NextAuth 인증) ────────────┐ │
│ │ GET  /admin/drafts        (초안 목록)      │ │
│ │ POST /api/drafts/generate (초안 생성)      │ │
│ │ GET  /api/drafts/[id]     (초안 조회)      │ │
│ └──────────────────────────────────────────┘ │
│                                              │
│ ┌─ Database (SQLite) ────────────────────────┐ │
│ │ - drafts_cache (생성된 초안 저장)          │ │
│ │ - sessions (NextAuth 인증)                 │ │
│ │ - users (관리자)                           │ │
│ └──────────────────────────────────────────┘ │
└──────────────────────────────────────────────┘
       │
       ├─ LLM API (Claude/OpenAI)
       │  └─> 초안 생성 (스타일 가이드 포함)
       │
       └─ Static Site (HTML/JSON)
          └─> CDN 캐시
```

### 8.2 주요 구성 모듈

| 모듈 | 역할 |
|------|------|
| `lib/notion.ts` | Notion API 클라이언트, 쿼리 함수 |
| `lib/llm.ts` | LLM API 호출, 프롬프트 구성 |
| `lib/db.ts` | Prisma 클라이언트 (기존) |
| `app/(public)/page.tsx` | 홈 페이지 |
| `app/(public)/posts/[id]/page.tsx` | 상세 페이지 |
| `app/(public)/category/[name]/page.tsx` | 카테고리 페이지 |
| `app/admin/drafts/page.tsx` | 초안 관리 대시보드 |
| `app/api/drafts/generate` | 초안 생성 API 엔드포인트 |

---

## 9. 리스크 및 제약사항

### 9.1 기술 리스크

#### Notion 이미지 URL 만료
- **문제**: Notion API가 반환하는 이미지 URL은 약 1시간 뒤 만료됨
- **해결책**: 
  - 단기: 이미지 URL을 직접 사용하지 않고, Notion 블록 렌더링 시점에 재조회
  - 장기: 이미지를 자체 스토리지(S3, Vercel Blob 등)에 다운로드/저장

#### Notion API Rate Limit
- **한계**: IP 당 분당 3회, 사용자 당 분당 30회 API 호출
- **대응**: ISR(Incremental Static Regeneration) + On-Demand Revalidation으로 최소화

#### LLM API 비용 및 응답 시간
- **문제**: 글당 초안 생성에 API 호출 비용 발생, 응답 시간 1-5초
- **대응**: 초안 생성을 비동기 백그라운드 작업으로 처리, 캐싱 활용

### 9.2 정책/규정 리스크

#### 네이버 블로그 이용약관 준수
- **현재 방식 (반자동)**: 관리자가 직접 게시 → 약관 준수 ✅
- **완전자동 방식 (제외)**: 브라우저 자동화를 통한 자동 로그인/게시 → 약관 위반 위험 ❌
  - 네이버는 "자동 수집, 가공, 배포" 금지 규정 존재
  - 위반 시 계정 정지 또는 법적 조치 가능성

#### Notion API 이용약관
- 공개 데이터 조회/캐싱 허용, 과도한 자동화는 금지
- MVP에서는 사용자 중심의 수동 관리 모델이므로 문제 없음

### 9.3 설계 제약사항

#### 블로그 스타일 자동 학습 불가
- **문제**: 레퍼런스 블로그(zmfflsp)를 자동으로 수집할 수 없음 (iframe/JS 렌더링)
- **해결책**: 초기 스타일 가이드를 수동으로 정의
  - 운영자가 기존 글 3-5개를 샘플로 제공
  - 해당 글의 어투, 구성, 해시태그 패턴을 프롬프트에 포함

---

## 10. MVP 범위 요약

### 10.1 포함되는 기능

✅ **Core Features:**
1. Notion 데이터베이스 연동 (생성, 읽기)
2. 공개 웹사이트 (글 목록, 상세, 카테고리, 검색)
3. 반응형 디자인
4. 네이버 포스팅 초안 자동 생성
5. 초안 미리보기 및 복사 (관리자 대시보드)

✅ **Non-Functional:**
- TypeScript 타입 안정성
- 성능 최적화 (이미지 lazy loading, ISR 캐싱)
- 기본적 에러 처리 및 로깅

### 10.2 제외되는 기능 (Phase 2+)

❌ **네이버 완전 자동 게시**
- 브라우저 자동화 (Playwright/Puppeteer)
- 자동 로그인 및 포스팅
- 이유: 이용약관 위반, 계정 정지 리스크

❌ **고급 기능**
- 댓글/피드백 시스템
- 소셜 공유 (SNS 최적화)
- 광고 플랫폼 통합
- 다중 관리자 권한 관리
- A/B 테스팅

---

## 11. 구현 단계

### Phase 1: 기초 설정 (1-2주)

**Step 1.1: 환경 설정**
- [ ] `npm install @notionhq/client`
- [ ] `.env.local` 에 환경 변수 추가
  ```
  NOTION_API_KEY=<your-api-key>
  NOTION_DATABASE_ID=<your-db-id>
  LLM_API_KEY=<claude-or-openai-key>
  LLM_PROVIDER=claude  # 또는 openai
  ```
- [ ] Notion API 토큰 생성 및 데이터베이스 권한 설정

**Step 1.2: Notion 데이터베이스 설계**
- [ ] 사용자 Notion 워크스페이스에 "블로그" 데이터베이스 생성
- [ ] 필드 6개 추가 (Title, Category, Tags, Published, Status, Content)
- [ ] 샘플 글 2-3개 작성 (테스트용)

**Step 1.3: Notion 클라이언트 구현**
- [ ] `lib/notion.ts` 작성: 
  - `getPublishedPosts()` - 모든 발행된 글 조회
  - `getPostById(id)` - 특정 글 조회
  - `getPostsByCategory(category)` - 카테고리별 글 조회
  - `searchPosts(query)` - 검색 함수

### Phase 2: 공개 웹사이트 구현 (2-3주)

**Step 2.1: 글 목록 및 상세 페이지**
- [ ] `app/(public)/page.tsx` - 홈 페이지 (최신 글 10개)
- [ ] `app/(public)/posts/[id]/page.tsx` - 상세 페이지
- [ ] Notion 블록 렌더링 (마크다운/HTML 변환)

**Step 2.2: 카테고리 및 검색**
- [ ] `app/(public)/category/[name]/page.tsx` - 카테고리 페이지
- [ ] `app/(public)/search/page.tsx` - 검색 결과 페이지
- [ ] 사이드바/필터 UI (shadcn/ui 활용)

**Step 2.3: 반응형 디자인 & 성능**
- [ ] Tailwind CSS로 모바일/태블릿/데스크톱 대응
- [ ] 이미지 최적화 (Next.js Image, lazy loading)
- [ ] ISR 및 캐시 전략 구성

### Phase 3: 초안 생성 파이프라인 (2주)

**Step 3.1: 네이버 스타일 가이드 정의**
- [ ] 기존 네이버 블로그 글 3-5개 검토
- [ ] 어투, 문단 구성, 해시태그 패턴 정리
- [ ] 프롬프트 템플릿 작성 (예: `lib/prompts/naver-style.ts`)

**Step 3.2: LLM 클라이언트 구현**
- [ ] `lib/llm.ts` 작성:
  - Claude API 또는 OpenAI API 호출 래퍼
  - 프롬프트 구성 함수

**Step 3.3: 초안 생성 API**
- [ ] `app/api/drafts/generate` - POST 엔드포인트
- [ ] SQLite에 생성된 초안 저장 (Prisma schema 확장)
- [ ] 비동기 처리 (초안 생성 시간 1-5초)

### Phase 4: 관리자 대시보드 (1-2주)

**Step 4.1: NextAuth 인증**
- [ ] NextAuth 초기화 (기존 설정 활용)
- [ ] `/admin` 라우트 보호

**Step 4.2: 초안 관리 UI**
- [ ] `app/admin/drafts/page.tsx` - 초안 목록 및 미리보기
- [ ] "Copy to Clipboard" 버튼 구현
- [ ] 초안 상태 추적 (미생성/생성됨/게시완료)

### Phase 5: 스타일링 및 최적화 (1주)

- [ ] 전체 UI 디자인 통일 (색상, 폰트, 간격)
- [ ] 접근성 검사 (WCAG 2.1 기본)
- [ ] SEO 기본 설정 (메타 태그, OpenGraph)
- [ ] 성능 프로파일링 및 최적화

### Phase 6: 배포 및 정리 (1주)

- [ ] Vercel에 배포
- [ ] 환경 변수 설정
- [ ] 모니터링 및 에러 로깅
- [ ] 문서화 (README, 관리자 가이드)

---

## 12. 추후 결정 사항 (Open Issues)

| 이슈 | 선택지 | 영향 |
|------|--------|------|
| **LLM 제공자** | Claude API vs OpenAI API | 비용(가격), 응답 품질, API 호출 속도 |
| **초안 캐싱** | 매번 재생성 vs 재사용 | API 비용 vs 최신도 갱신 |
| **관리자 인증** | NextAuth 기본 vs OAuth(Google/GitHub) | 운영 편의성 |
| **Phase 2: 완전자동 게시** | 도입 여부 재검토 | 리스크(계정 정지) vs 편의성 |
| **멀티 사용자** | 단일 운영자 vs 다중 권한 | 기능 복잡도 |

---

## 13. 성공 지표 (Definition of Done)

### 13.1 기능 측면

- ✅ Notion 글 5개 이상 추가 후 웹사이트에서 조회 가능
- ✅ 카테고리 필터 선택 시 해당 글만 표시
- ✅ 검색창에 키워드 입력 시 관련 글 표시
- ✅ 모바일에서 정상 렌더링 (레이아웃 깨짐 없음)
- ✅ 관리자 초안 미리보기 화면에서 초안 텍스트 복사 가능
- ✅ 복사한 초안을 네이버 블로그 에디터에 붙여넣었을 때 포맷 정상 유지

### 13.2 성능 측면

- ✅ 홈페이지 로딩 시간 < 3초
- ✅ 글 상세 페이지 < 2초
- ✅ 초안 생성 시간 1-5초 (LLM API 의존)

### 13.3 코드 품질

- ✅ TypeScript strict mode, 타입 검사 통과
- ✅ ESLint 에러 0건
- ✅ 주요 함수에 JSDoc 주석 (필요시)

---

## 14. 부록

### 14.1 환경 변수 예시 (`.env.local`)

```bash
# Notion API
NOTION_API_KEY=ntn_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
NOTION_DATABASE_ID=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx

# LLM API (선택: claude 또는 openai)
LLM_PROVIDER=claude
LLM_API_KEY=sk-ant-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx

# NextAuth (기존)
AUTH_SECRET=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
AUTH_URL=http://localhost:3000

# Database (기존)
DATABASE_URL="file:./dev.db"
```

### 14.2 Notion 스타일 가이드 예시 (프롬프트용)

```markdown
## 네이버 블로그 스타일 가이드

### 어투
- 친근하고 실용적: "~예요", "~네요", "~더라고요", "~했어"
- 과도한 존댓말 피함
- 개인적 경험/감정 표현 자연스럽게

### 구성
1. 서두: 1-2문장으로 글의 핵심 인상 표현
2. 본문: 사진별로 설명 (장소→분위기→음식/내용 순)
3. 마무리: "추천"/"아쉬운 점" 또는 배운 점

### 해시태그
- 맛집: #가성비 #분위기 #서울 #카페 #디저트 등
- 육아: #육아팁 #생활용품 #아이반응 등
- 결혼: #웨딩 #신혼생활 #신혼집 등
- 최대 10개 이하

### 이미지
- 각 사진 다음에 1문장 설명 추가
- 음식: 가격, 맛, 분량 평가
- 장소: 분위기, 위치 표현
```

### 14.3 References

- [Notion API Documentation](https://developers.notion.com)
- [Next.js 16 App Router](https://nextjs.org/docs)
- [shadcn/ui Components](https://ui.shadcn.com)
- [Tailwind CSS v4](https://tailwindcss.com)
- [Claude API](https://claude.ai/api) (LLM 선택 시)
- [NextAuth v5 Documentation](https://next-auth.js.org)

---

**Document Version:** 1.0  
**Last Updated:** 2026-07-01  
**Next Review:** 구현 완료 후 피드백 반영
