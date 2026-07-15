import { NextRequest, NextResponse } from "next/server"
import { getCachedRefreshedImageUrl } from "@/lib/imageCache"

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const blockId = searchParams.get("blockId")
  const pageId = searchParams.get("pageId")
  // "property": 본문에 이미지가 없어 Notion "Image" 속성 첫 파일로 폴백한 썸네일
  // (블록 ID가 없어 pageId 기준으로 속성을 다시 조회해야 함)
  const kind = searchParams.get("kind")

  if (!blockId && !pageId) {
    return NextResponse.json(
      { error: "blockId 또는 pageId가 필요합니다." },
      { status: 400 }
    )
  }

  try {
    const url = blockId
      ? await getCachedRefreshedImageUrl("block", blockId)
      : kind === "property"
        ? await getCachedRefreshedImageUrl("property", pageId!)
        : await getCachedRefreshedImageUrl("cover", pageId!)

    if (!url) {
      return NextResponse.json(
        { error: "이미지를 찾을 수 없습니다." },
        { status: 404 }
      )
    }

    return NextResponse.json(
      { url },
      {
        headers: {
          "Cache-Control": "private, no-store",
        },
      }
    )
  } catch (error) {
    console.error("[GET /api/images/refresh]", error)
    return NextResponse.json(
      { error: "이미지 URL을 갱신하지 못했습니다." },
      { status: 500 }
    )
  }
}
