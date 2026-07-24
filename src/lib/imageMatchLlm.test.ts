import { describe, it, expect, vi, beforeEach } from "vitest"
import { matchImagesToParagraphsViaLlm, respectsCourseOrder } from "./imageMatchLlm"

const generateContentMock = vi.fn()
const { generateGroqTextMock } = vi.hoisted(() => ({
  generateGroqTextMock: vi.fn().mockResolvedValue(null),
}))

vi.mock("./groqClient", () => ({
  generateGroqText: generateGroqTextMock,
}))

vi.mock("@google/genai", () => {
  class ApiError extends Error {
    status: number
    constructor(options: { message: string; status: number }) {
      super(options.message)
      this.name = "ApiError"
      this.status = options.status
    }
  }
  return {
    GoogleGenAI: vi.fn(() => ({
      models: { generateContent: generateContentMock },
    })),
    ApiError,
  }
})

describe("imageMatchLlm", () => {
  beforeEach(() => {
    generateContentMock.mockReset()
    generateGroqTextMock.mockReset().mockResolvedValue(null)
  })

  describe("matchImagesToParagraphsViaLlm", () => {
    const images = [
      { caption: "샐러드", courseStage: 0 },
      { caption: "사시미", courseStage: 1 },
    ]
    const paragraphs = [
      { index: 3, text: "처음 시작은 상큼한 샐러드가 나온다" },
      { index: 7, text: "이어서 신선한 사시미가 나온다" },
    ]

    it("정상 JSON 응답을 실제 문단 인덱스로 변환해 반환한다", async () => {
      generateContentMock.mockResolvedValueOnce({
        text: '[{"image":1,"paragraph":1},{"image":2,"paragraph":2}]',
      })

      const result = await matchImagesToParagraphsViaLlm("test-key", images, paragraphs)

      expect(result).toEqual([3, 7])
    })

    it("코드펜스나 설명 텍스트가 섞여도 JSON 배열만 추출해 파싱한다", async () => {
      generateContentMock.mockResolvedValueOnce({
        text: '다음과 같이 매칭했습니다:\n```json\n[{"image":1,"paragraph":2},{"image":2,"paragraph":1}]\n```',
      })

      const result = await matchImagesToParagraphsViaLlm("test-key", images, paragraphs)

      expect(result).toEqual([7, 3])
    })

    it("이미지/문단 번호가 범위를 벗어난 항목은 무시한다", async () => {
      generateContentMock.mockResolvedValueOnce({
        text: '[{"image":1,"paragraph":1},{"image":99,"paragraph":1},{"image":2,"paragraph":99}]',
      })

      const result = await matchImagesToParagraphsViaLlm("test-key", images, paragraphs)

      expect(result).toEqual([3, null])
    })

    it("응답이 JSON 배열을 전혀 포함하지 않으면 null을 반환한다", async () => {
      generateContentMock.mockResolvedValueOnce({ text: "죄송하지만 답변할 수 없습니다." })

      const result = await matchImagesToParagraphsViaLlm("test-key", images, paragraphs)

      expect(result).toBeNull()
    })

    it("모델 호출 자체가 실패하고 Groq도 실패하면 null을 반환한다", async () => {
      const { ApiError } = await import("@google/genai")
      // 404(모델 미지원)는 withRetry가 재시도하지 않고 즉시 다음 모델로 넘어가므로
      // 실제 지연(setTimeout) 없이 테스트가 빠르게 끝난다(429/503은 지수 백오프로
      // 재시도해 real timer 기반 테스트에서 타임아웃을 유발한다).
      generateContentMock.mockRejectedValue(new ApiError({ message: "not found", status: 404 }))

      const result = await matchImagesToParagraphsViaLlm("test-key", images, paragraphs)

      expect(result).toBeNull()
      expect(generateGroqTextMock).toHaveBeenCalled()
    })

    it("Gemini가 전부 실패해도 Groq 응답이 있으면 그걸로 매칭한다", async () => {
      const { ApiError } = await import("@google/genai")
      // 404(모델 미지원)는 withRetry가 재시도하지 않고 즉시 다음 모델로 넘어가므로
      // 실제 지연(setTimeout) 없이 테스트가 빠르게 끝난다(429/503은 지수 백오프로
      // 재시도해 real timer 기반 테스트에서 타임아웃을 유발한다).
      generateContentMock.mockRejectedValue(new ApiError({ message: "not found", status: 404 }))
      generateGroqTextMock.mockResolvedValueOnce('[{"image":1,"paragraph":1},{"image":2,"paragraph":2}]')

      const result = await matchImagesToParagraphsViaLlm("test-key", images, paragraphs)

      expect(result).toEqual([3, 7])
    })

    it("이미지나 문단이 없으면 호출 없이 null을 반환한다", async () => {
      const result = await matchImagesToParagraphsViaLlm("test-key", [], paragraphs)

      expect(result).toBeNull()
      expect(generateContentMock).not.toHaveBeenCalled()
    })
  })

  describe("respectsCourseOrder", () => {
    it("코스 순서대로 배정됐으면 true를 반환한다", () => {
      const images = [
        { caption: "샐러드", courseStage: 0 },
        { caption: "사시미", courseStage: 1 },
        { caption: "초밥", courseStage: 2 },
      ]
      expect(respectsCourseOrder(images, [0, 1, 2])).toBe(true)
    })

    it("뒤 단계 사진이 앞 단계보다 앞선 문단에 배정되면 false를 반환한다", () => {
      const images = [
        { caption: "초밥", courseStage: 2 },
        { caption: "샐러드", courseStage: 0 },
      ]
      // 초밥(단계 2)이 문단 0, 샐러드(단계 0)가 문단 1 — 순서 위반
      expect(respectsCourseOrder(images, [0, 1])).toBe(false)
    })

    it("courseStage가 UNKNOWN(-1)인 이미지는 검증 대상에서 제외한다", () => {
      const images = [
        { caption: "무관한사진", courseStage: -1 },
        { caption: "초밥", courseStage: 2 },
      ]
      // UNKNOWN 이미지가 초밥보다 뒤에 있어도(문단 5) 검증 대상이 아니므로 위반 아님
      expect(respectsCourseOrder(images, [5, 1])).toBe(true)
    })

    it("같은 코스단계끼리는 문단 순서가 달라도 위반으로 보지 않는다", () => {
      const images = [
        { caption: "초밥1", courseStage: 2 },
        { caption: "초밥2", courseStage: 2 },
      ]
      expect(respectsCourseOrder(images, [3, 1])).toBe(true)
    })
  })
})
