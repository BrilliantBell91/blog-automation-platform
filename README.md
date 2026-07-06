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
| **Database** | SQLite (Prisma ORM) |
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

   # Database
   DATABASE_URL="file:./dev.db"
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

# Prisma 마이그레이션
npx prisma migrate dev
npx prisma studio  # DB 관리자 UI
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
