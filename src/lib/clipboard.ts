import { naverDraftToHtml } from "./naverDraftParser"

/**
 * 초안 텍스트를 클립보드에 복사한다. 이미지·링크·인용구가 있으면 리치 텍스트(HTML)로도
 * 함께 실어서, 네이버 블로그 에디터 같은 리치 텍스트 에디터에 붙여넣을 때 이미지가 실제
 * 이미지로, 링크가 실제 링크로 그대로 붙도록 한다. HTML 클립보드를 지원하지 않는 환경에서는
 * 일반 텍스트로 폴백한다.
 */
export async function copyNaverDraftToClipboard(content: string): Promise<void> {
  if (typeof ClipboardItem !== "undefined" && navigator.clipboard.write) {
    try {
      const html = naverDraftToHtml(content)
      await navigator.clipboard.write([
        new ClipboardItem({
          "text/html": new Blob([html], { type: "text/html" }),
          "text/plain": new Blob([content], { type: "text/plain" }),
        }),
      ])
      return
    } catch {
      // ClipboardItem 생성/쓰기 실패 시 일반 텍스트 복사로 폴백
    }
  }

  await navigator.clipboard.writeText(content)
}
