# Notion CMS 블로그 자동화 플랫폼

Notion을 단일 정보원(Single Source of Truth)으로 하는 블로그 콘텐츠 관리 및 자동화 플랫폼입니다.

## 📋 프로젝트 개요

**목표**: Notion에 이미지와 필수 정보를 입력하면, 자동으로:
1. 자체 블로그 웹사이트에 발행
2. 기존 블로그 스타일(어투, 형식, 해시태그)을 반영한 포스팅 초안 생성

**주요 대상 콘텐츠**: 맛집, 육아, 결혼 관련 블로그 글

## ✨ 주요 기능

### 공개 웹사이트
- 📝 Notion 글 목록 및 상세 페이지
- 🏷️ 카테고리별 필터링 (맛집/육아/결혼 등)
- 🔍 검색 기능
- 📱 완벽한 반응형 디자인 (Desktop/Tablet/Mobile)

### 관리자 기능
- 🤖 네이버 블로그 스타일 반자동 초안 생성 (LLM 기반)
- 👁️ 초안 미리보기 및 복사
- 🔐 인증 기반 관리자 대시보드

## 🛠️ 기술 스택

| 항목 | 기술 |
|------|------|
| **Framework** | Next.js 16.2.9 (App Router) |
| **Language** | TypeScript |
| **Styling** | Tailwind CSS v4 + shadcn/ui |
| **CMS** | Notion API (@notionhq/client) |
| **Database** | Turso (libSQL) via Prisma ORM 드라이버 어댑터 |
| **Auth** | NextAuth v5 |
| **LLM** | Claude API / OpenAI (미정) |
| **Deployment** | Vercel |

## 📦 설치 및 환경 설정

### 전제 조건
- Node.js 18+ 
- npm 또는 yarn
- Notion 계정 및 API 키

### 설치 단계

1. **저장소 클론**
   ```bash
   git clone <repository-url>
   cd blog-automation-platform
   ```

2. **의존성 설치**
   ```bash
   npm install
   ```

3. **환경 변수 설정** (`.env.local` 생성)
   ```bash
   # Notion API
   NOTION_API_KEY=your_notion_api_key
   NOTION_DATABASE_ID=your_database_id

   # LLM API (Claude 또는 OpenAI)
   LLM_PROVIDER=claude
   LLM_API_KEY=your_llm_api_key

   # NextAuth
   AUTH_SECRET=generate_with_openssl_rand_base64_32
   AUTH_URL=http://localhost:3000

   # Database (로컬 개발: SQLite 파일 / 프로덕션: Turso libSQL)
   DATABASE_URL="file:./prisma/dev.db"
   # Turso(libSQL) 사용 시 아래 두 값을 설정 (로컬 파일 사용 시 불필요)
   # DATABASE_URL="libsql://<db-name>-<org>.turso.io"
   # TURSO_AUTH_TOKEN="eyJhbGciOiJFZERTQSIsInR5cCI6IkpXVCJ9..."
   ```

4. **개발 서버 실행**
   ```bash
   npm run dev
   ```
   http://localhost:3000 에서 확인 가능

## 📖 프로젝트 구조

```
.
├── src/
│   ├── app/                    # Next.js App Router
│   │   ├── (public)/          # 공개 라우트
│   │   │   ├── page.tsx       # 홈
│   │   │   ├── posts/         # 글 상세
│   │   │   ├── category/      # 카테고리
│   │   │   └── search/        # 검색
│   │   └── admin/             # 관리자 라우트 (인증)
│   │       └── drafts/        # 초안 관리
│   ├── components/            # React 컴포넌트
│   │   └── ui/               # shadcn/ui 컴포넌트
│   └── lib/
│       ├── notion.ts         # Notion API 클라이언트
│       ├── llm.ts            # LLM API 클라이언트
│       ├── db.ts             # Prisma 클라이언트
│       └── utils.ts
├── prisma/
│   └── schema.prisma         # Prisma 데이터 모델
├── docs/
│   └── PRD.md               # Product Requirements Document
├── .env.local               # 환경 변수 (git 무시됨)
├── next.config.ts
├── tsconfig.json
├── tailwind.config.ts
└── package.json
```

## 🚀 개발 가이드

### Notion 데이터베이스 구조

필수 필드:
- **Title** (제목)
- **Category** (카테고리: Select)
- **Tags** (태그: Multi-Select)
- **Published** (발행일: Date)
- **Status** (상태: Select - "초안", "발행됨", "보관됨")
- **Content** (본문: Page Content)

선택 필드 (초안 추적):
- **NaverDraftStatus** (초안 상태)
- **NaverPostUrl** (네이버 포스팅 링크)

자세한 설명은 [docs/PRD.md](./docs/PRD.md) 참고

### 주요 스크립트

```bash
# 개발 서버 실행
npm run dev

# 프로덕션 빌드
npm run build
npm start

# 타입 체크
npm run type-check

# 린트 검사
npm run lint

# 단위 테스트 실행
npm run test

# 단위 테스트 감시 모드
npm run test:watch

# E2E 테스트 실행
npm run test:e2e

# Prisma 마이그레이션
npx prisma migrate dev
npx prisma studio  # DB 관리자 UI
```

## 🚀 Vercel 배포 가이드

### 환경 변수 설정

Vercel 대시보드의 프로젝트 설정 → Environment Variables에서 다음 값들을 설정하세요:

| 변수명 | 설명 | 필수 |
|--------|------|------|
| `DATABASE_URL` | Turso(libSQL) DB URL (예: `libsql://<db>-<org>.turso.io`) | ✅ |
| `TURSO_AUTH_TOKEN` | Turso 인증 토큰 (Turso 대시보드 → Tokens에서 생성) | ✅ |
| `AUTH_SECRET` | NextAuth 토큰 서명용 비밀키 (openssl rand -base64 32) | ✅ |
| `AUTH_URL` | 배포 URL (예: https://your-domain.vercel.app) | ✅ |
| `NOTION_API_KEY` | Notion Integration Token | ✅ |
| `NOTION_DATABASE_ID` | Notion 데이터베이스 ID | ✅ |
| `ADMIN_EMAIL` | 관리자 로그인 이메일 | ✅ |
| `ADMIN_PASSWORD` | 관리자 로그인 비밀번호 (bcrypt로 해시됨) | ✅ |
| `LLM_API_KEY` | Claude API 키 또는 OpenAI API 키 | ✅ |
| `LLM_PROVIDER` | 사용할 LLM 제공자 (현재 미사용, 향후 지원 예정) | ❌ |
| `GROQ_API_KEY` | Gemini 할당량 소진 시 최종 폴백 LLM(Groq) 키, 없으면 Gemini 실패 시 그대로 에러 | ❌ |
| `REVALIDATE_SECRET` | ISR 재검증 webhook 토큰 (선택사항) | ❌ |
| `NAVER_SEARCH_CLIENT_ID` | 네이버 이미지 검색 API 클라이언트 ID (초안 이미지 소싱, 없으면 검색 단계 건너뜀) | ❌ |
| `NAVER_SEARCH_CLIENT_SECRET` | 네이버 이미지 검색 API 시크릿 | ❌ |
| `GOOGLE_SEARCH_API_KEY` | 구글 Custom Search API 키 (네이버 검색 보조 수단, 없으면 건너뜀) | ❌ |
| `GOOGLE_SEARCH_CX` | 구글 Programmable Search Engine ID (cx 값) | ❌ |

> ⚠️ `NAVER_SEARCH_*`/`GOOGLE_SEARCH_*`는 필수는 아니지만, 설정하지 않으면 초안 생성 시 Notion 첨부 이미지 외에는 이미지가 거의 채워지지 않습니다. 로컬 `.env`에만 넣고 Vercel에는 등록하지 않으면 로컬에서는 되는데 배포본에서는 안 되는 불일치가 생기니, 로컬과 프로덕션 양쪽에 동일하게 설정하세요.

> ⚠️ `GROQ_API_KEY`도 필수는 아니지만, 설정하지 않으면 Gemini 무료 티어 할당량(모델별 일일 한도)이 소진되는 순간 텍스트 생성/이미지 캡션·외관 판별/이미지 관련성 검증이 곧바로 실패로 이어집니다(할당량 소진 시 대표 사진 누락·엉뚱한 위치에 사진 배치 등으로 나타남). 무료로 발급 가능하니 등록해두는 것을 권장합니다.

### ✅ Turso(libSQL)로 마이그레이션 완료

Vercel 서버리스 환경(함수형 컴퓨팅)에서는 파일시스템이 요청마다 초기화되는 임시 환경이므로, 파일 기반 SQLite는 쓰기 작업이 유지되지 않습니다. 이 프로젝트는 **Turso(libSQL)**로 마이그레이션을 완료하여 이 문제를 해결했습니다.

**적용된 구조**:
- Prisma 7의 드라이버 어댑터(`@prisma/adapter-libsql`, `@libsql/client`)를 사용해 `src/lib/db.ts`에서 `PrismaClient({ adapter })` 형태로 연결 (`prisma/schema.prisma`의 `datasource provider`는 `sqlite`로 그대로 유지 — Turso는 SQLite 호환 프로토콜)
- 로컬 개발과 프로덕션 모두 동일한 `DATABASE_URL`/`TURSO_AUTH_TOKEN` 조합 사용 가능 (`file:` 로컬 경로도 지원)
- `prisma migrate deploy`는 마이그레이션 엔진이 `libsql://` 스킴을 인식하지 못해 Turso에는 사용할 수 없음 — 대신 `scripts/migrate-turso.ts`가 `@libsql/client`로 `prisma/migrations/*/migration.sql`을 순서대로 직접 실행함:
  ```bash
  npx tsx scripts/migrate-turso.ts
  ```
- 새 마이그레이션 추가 시: 로컬 SQLite 파일 기준으로 `npx prisma migrate dev`로 SQL 파일을 생성한 뒤, 위 스크립트를 다시 실행해 Turso에 반영

### ✅ 배포 완료 (Task 015)

**프로덕션 URL**: https://blog-automation-platform.vercel.app

- Vercel 프로젝트가 GitHub 저장소(`BrilliantBell91/blog-automation-platform`)와 연동되어 `master` 브랜치 푸시 시 자동 배포됨
- 환경변수 전체 설정 완료(Turso DB 포함)
- End-to-End 검증 완료: 홈페이지·로그인 페이지·API 응답, 관리자 로그인 → 세션 발급까지 실제 Turso DB 기반으로 정상 동작 확인

**참고**: Prisma 7의 `prisma-client` 제너레이터는 `client.ts`를 진입점으로 사용하므로(`index.ts` 아님), 코드에서 `@/generated/prisma/client` 경로로 import해야 함(Vercel 클린 빌드에서 발견된 이슈, 로컬은 구버전 잔여 파일로 우연히 동작했었음).

**추가 배포(재배포) 방법**:
1. GitHub `master`에 푸시 → 자동 배포, 또는
2. `vercel --prod` 로 수동 배포

### 테스트

배포 전 로컬에서 검증:
```bash
npm run lint        # 린트 에러 확인
npm run type-check  # 타입 에러 확인
npm run build       # 프로덕션 빌드
npm run test        # 단위 테스트
npm run test:e2e    # E2E 테스트 (환경변수 필수)
```

## 📚 문서

- [PRD (Product Requirements Document)](./docs/PRD.md) - 전체 기능, 설계, 구현 계획
- [Notion API](https://developers.notion.com)
- [Next.js 16 App Router](https://nextjs.org/docs)
- [Tailwind CSS v4](https://tailwindcss.com)

## 🔐 보안

- 환경 변수는 절대 커밋하지 않음 (.env.local은 .gitignore에 포함)
- Notion API 키와 LLM 키는 백엔드에서만 사용
- 관리자 대시보드는 NextAuth 인증으로 보호됨

## 📋 MVP 범위

**포함**:
- ✅ Notion API 연동
- ✅ 글 목록 및 상세 페이지
- ✅ 카테고리, 검색, 반응형 디자인
- ✅ 네이버 포스팅 반자동 초안 생성

**제외** (Phase 2):
- ❌ 네이버 완전 자동 게시 (이용약관 위반 리스크)

## ⚠️ 알려진 제약사항

1. **Notion 이미지 URL 만료**: Notion API 이미지는 ~1시간 뒤 만료되므로, 자체 스토리지 저장 필요
2. **네이버 API 부재**: 공식 포스팅 API 없음 → 반자동 방식 채택
3. **스타일 가이드**: 기존 블로그 스타일은 초기에 수동으로 샘플링

## 🐛 버그 제보 및 피드백

GitHub Issues 탭에서 버그 및 기능 요청 등록

## 📄 라이선스

MIT

---

**마지막 업데이트**: 2026-07-01  
**상태**: MVP 개발 계획 중
