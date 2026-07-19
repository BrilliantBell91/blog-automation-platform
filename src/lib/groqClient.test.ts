import { describe, it, expect, vi, beforeEach } from "vitest"
import { generateGroqText, generateGroqVisionText } from "./groqClient"

const { GroqMock } = vi.hoisted(() => {
  const GroqMock = vi.fn()
  return { GroqMock }
})

vi.mock("groq-sdk", () => ({
  default: GroqMock,
}))

describe("groqClient", () => {
  beforeEach(() => {
    vi.stubEnv("GROQ_API_KEY", "")
    GroqMock.mockReset()
  })

  describe("generateGroqText", () => {
    it("GROQ_API_KEY가 없으면 즉시 null을 반환한다", async () => {
      vi.stubEnv("GROQ_API_KEY", "")
      const result = await generateGroqText("시스템 명령", "사용자 메시지")
      expect(result).toBeNull()
      expect(GroqMock).not.toHaveBeenCalled()
    })

    it("GROQ_API_KEY가 있으면 API를 호출해 텍스트를 반환한다", async () => {
      vi.stubEnv("GROQ_API_KEY", "test-key")
      GroqMock.mockReturnValue({
        chat: {
          completions: {
            create: vi.fn().mockResolvedValue({
              choices: [{ message: { content: "생성된 텍스트" } }],
            }),
          },
        },
      })

      const result = await generateGroqText("시스템 명령", "사용자 메시지")
      expect(result).toBe("생성된 텍스트")
    })

    it("API 호출 실패 시 null을 반환하고 경고를 로깅한다", async () => {
      vi.stubEnv("GROQ_API_KEY", "test-key")
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {})
      GroqMock.mockReturnValue({
        chat: {
          completions: {
            create: vi.fn().mockRejectedValue(new Error("API 오류")),
          },
        },
      })

      const result = await generateGroqText("시스템 명령", "사용자 메시지")
      expect(result).toBeNull()
      expect(warnSpy).toHaveBeenCalled()
      warnSpy.mockRestore()
    })
  })

  describe("generateGroqVisionText", () => {
    it("GROQ_API_KEY가 없으면 즉시 null을 반환한다", async () => {
      vi.stubEnv("GROQ_API_KEY", "")
      const result = await generateGroqVisionText([], "프롬프트")
      expect(result).toBeNull()
      expect(GroqMock).not.toHaveBeenCalled()
    })

    it("GROQ_API_KEY가 있으면 멀티모달 포맷으로 API를 호출한다", async () => {
      vi.stubEnv("GROQ_API_KEY", "test-key")
      const createMock = vi.fn().mockResolvedValue({
        choices: [{ message: { content: "이미지 분석 결과" } }],
      })
      GroqMock.mockReturnValue({
        chat: {
          completions: { create: createMock },
        },
      })

      const result = await generateGroqVisionText(
        [{ mimeType: "image/jpeg", data: "base64data" }],
        "분석해줘"
      )

      expect(result).toBe("이미지 분석 결과")
      expect(createMock).toHaveBeenCalled()
      const callArgs = createMock.mock.calls[0][0]
      expect(callArgs.messages[0].content).toEqual([
        {
          type: "image_url",
          image_url: { url: "data:image/jpeg;base64,base64data" },
        },
        { type: "text", text: "분석해줘" },
      ])
    })

    it("API 호출 실패 시 null을 반환하고 경고를 로깅한다", async () => {
      vi.stubEnv("GROQ_API_KEY", "test-key")
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {})
      GroqMock.mockReturnValue({
        chat: {
          completions: {
            create: vi.fn().mockRejectedValue(new Error("API 오류")),
          },
        },
      })

      const result = await generateGroqVisionText([], "프롬프트")
      expect(result).toBeNull()
      expect(warnSpy).toHaveBeenCalled()
      warnSpy.mockRestore()
    })
  })
})
