// 초안 생성 시점에 대표 사진(썸네일)을 "가게 외관/정면" 사진 우선으로 재선정한다.
// 기존 로직(notion.ts의 firstImageBlock)은 본문 첫 이미지를 그냥 가져다 쓸 뿐이라
// 외관이 아닌 사진(예: 음식 클로즈업)이 대표 사진이 되는 경우가 많았다.
//
// 이 로직은 초안 생성(route.ts) 시점에만 적용되고, notion.ts의 mapPageToPost/
// firstImageBlock 자체는 건드리지 않는다 — 그 경로는 공개 목록 조회(getPublishedPosts,
// syncPublishedPosts 등)에서도 매번 호출되므로 여기에 비전 호출을 넣으면 초안 생성과
// 무관한 페이지 렌더링·동기화까지 지연·비용이 생긴다. 대신 초안 생성 시 로컬 DB의
// Post.imageUrl을 덮어써서 영속화하며, syncPublishedPosts()가 재실행되면 원래 썸네일로
// 되돌아갈 수 있는 한계는 감수한다.

import { Post } from "@/types"
import { runVisionPrompt } from "./imageGen"
import { searchRealImages, searchGoogleImages } from "./imageSearch"

const EXTERIOR_CLASSIFY_PROMPT = `이 사진이 가게/매장/장소의 외관(건물 정면, 간판이 보이는 입구, 외부 전경) 사진인지 판단해주세요.
음식, 실내 인테리어, 메뉴판, 사람 얼굴 클로즈업 등은 외관 사진이 아닙니다.
외관 사진이면 정확히 "예"만, 아니면 정확히 "아니오"만 답하세요.`

// 첨부 사진이 많은 글에서 전부 비전 호출을 하면 비용·시간이 커지므로 앞쪽 일부만 확인한다.
const MAX_ATTACHMENTS_TO_CHECK = 6

// 웹 검색으로 외관 사진을 찾는 폴백은 "장소 방문 후기"형 카테고리에서만 의미가 있다
// (결혼/육아/기타는 절차 안내형 글이 많아 "외관 사진"이라는 개념 자체가 안 맞음).
const VENUE_CATEGORIES = new Set(["나들이", "맛집"])

async function classifyExteriorPhoto(apiKey: string, imageUrl: string): Promise<boolean> {
  const text = await runVisionPrompt(apiKey, imageUrl, EXTERIOR_CLASSIFY_PROMPT)
  return (text ?? "").startsWith("예")
}

// Notion 제목에 흔히 붙는 "[테스트]", "[협찬]" 같은 대괄호 접두사는 검색 관련성을 떨어뜨린다.
function cleanTitleForSearch(title: string): string {
  return title.replace(/^\[[^\]]*\]\s*/, "").trim()
}

/**
 * 첨부 사진 중 외관 사진을 찾고, 없으면(방문 후기형 카테고리에 한해) 웹 검색으로 대체한다.
 * 찾지 못하면 undefined를 반환해 호출부가 기존 post.imageUrl을 그대로 쓰도록 한다.
 */
export async function resolveThumbnailUrl(
  apiKey: string,
  post: Post
): Promise<string | undefined> {
  if (!apiKey) return undefined

  const attachments = (post.contentAttachments ?? [])
    .filter((a) => a.kind === "image")
    .slice(0, MAX_ATTACHMENTS_TO_CHECK)

  if (attachments.length > 0) {
    const results = await Promise.all(
      attachments.map(async (a) => ({
        url: a.url,
        isExterior: await classifyExteriorPhoto(apiKey, a.url),
      }))
    )
    const found = results.find((r) => r.isExterior)
    if (found) return found.url
  }

  if (!VENUE_CATEGORIES.has(post.category)) return undefined

  const query = `${cleanTitleForSearch(post.title)} 외관`
  const candidates = [
    ...(await searchRealImages(query, 5)),
    ...(await searchGoogleImages(query, 5)),
  ]

  for (const candidate of candidates) {
    if (await classifyExteriorPhoto(apiKey, candidate)) return candidate
  }

  return undefined
}
