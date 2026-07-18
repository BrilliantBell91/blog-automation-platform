import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/auth"
import { notion } from "@/lib/notion"
import { invalidatePostCache } from "@/lib/postsCache"

export const dynamic = "force-dynamic"
// 사진 여러 장을 순차적으로 Notion File Upload API에 업로드하므로(1장당 create+send
// 2회 왕복) 사진이 많으면 시간이 걸릴 수 있어 넉넉하게 잡는다.
export const maxDuration = 300

// Notion File Upload API(single_part 모드)는 파일당 20MB 제한이다.
const MAX_FILE_SIZE = 20 * 1024 * 1024

export async function POST(request: NextRequest) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: "인증이 필요합니다." }, { status: 401 })
  }

  let formData: FormData
  try {
    formData = await request.formData()
  } catch {
    return NextResponse.json({ error: "유효한 form-data가 필요합니다." }, { status: 400 })
  }

  // Notion 페이지 ID(notionId) — 로컬 DB의 Post.id(cuid)와는 다르다. blocks.children.append의
  // block_id로 그대로 쓰이므로 반드시 Notion 페이지 ID여야 한다.
  const notionPageId = formData.get("notionPageId")
  if (typeof notionPageId !== "string" || !notionPageId) {
    return NextResponse.json({ error: "notionPageId가 필요합니다." }, { status: 400 })
  }

  const files = formData.getAll("files").filter((f): f is File => f instanceof File)
  if (files.length === 0) {
    return NextResponse.json({ error: "업로드할 파일이 없습니다." }, { status: 400 })
  }

  const oversized = files.find((f) => f.size > MAX_FILE_SIZE)
  if (oversized) {
    return NextResponse.json(
      { error: `"${oversized.name}" 파일이 20MB를 초과합니다.` },
      { status: 400 }
    )
  }

  try {
    // Notion File Upload API는 (1) 업로드 슬롯 생성 → (2) 실제 바이트 전송 두 단계다.
    // 파일마다 순차 처리(Promise.all 병렬 시) Notion API rate limit(분당 요청 제한)에
    // 걸릴 위험이 있어 안전하게 순서대로 처리한다.
    const fileUploadIds: string[] = []
    for (const file of files) {
      const created = await notion.fileUploads.create({
        mode: "single_part",
        filename: file.name,
        content_type: file.type || "application/octet-stream",
      })
      await notion.fileUploads.send({
        file_upload_id: created.id,
        file: { filename: file.name, data: file },
      })
      fileUploadIds.push(created.id)
    }

    // 한 번의 children.append 호출로 페이지에 순서대로 일괄 추가한다.
    await notion.blocks.children.append({
      block_id: notionPageId,
      children: fileUploadIds.map((id) => ({
        type: "image" as const,
        image: { type: "file_upload" as const, file_upload: { id } },
      })),
    })

    invalidatePostCache(notionPageId)

    return NextResponse.json({ uploaded: fileUploadIds.length })
  } catch (error) {
    console.error("[POST /api/admin/notion/uploads]", error)
    const message = error instanceof Error ? error.message : "업로드 중 오류가 발생했습니다."
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
