import { describe, it, expect, vi, beforeEach } from "vitest"
import { analyzeImagesBatch, matchImagesToParagraphs } from "./imageMatching"

const { runVisionPromptBatchMock } = vi.hoisted(() => ({
  runVisionPromptBatchMock: vi.fn(),
}))

vi.mock("./imageGen", () => ({
  runVisionPromptBatch: runVisionPromptBatchMock,
}))

describe("imageMatching", () => {
  beforeEach(() => {
    runVisionPromptBatchMock.mockReset()
  })

  describe("analyzeImagesBatch", () => {
    it("라벨이 의미 있으면 비전 호출 없이 라벨을 캡션으로 재사용한다", async () => {
      const result = await analyzeImagesBatch("test-key", [
        { url: "https://example.com/1.jpg", existingLabel: "가게 외관 사진" },
      ])

      expect(result).toEqual([{ caption: "가게 외관 사진", isExterior: true }])
      expect(runVisionPromptBatchMock).not.toHaveBeenCalled()
    })

    it("라벨이 파일명 패턴(의미 없음)이면 비전 배치 호출로 캡션을 생성한다", async () => {
      runVisionPromptBatchMock.mockResolvedValueOnce({
        successIndexes: [0],
        text: "1) 우니, 초밥, 클로즈업 | 아니오",
      })

      const result = await analyzeImagesBatch("test-key", [
        { url: "https://example.com/1.jpg", existingLabel: "20180206_195520.jpg" },
      ])

      expect(result).toEqual([{ caption: "우니, 초밥, 클로즈업", isExterior: false }])
    })

    it("여러 장을 배치 크기(5장) 단위로 나눠 여러 번 호출한다", async () => {
      runVisionPromptBatchMock
        .mockResolvedValueOnce({
          successIndexes: [0, 1, 2, 3, 4],
          text: "1) a | 아니오\n2) b | 아니오\n3) c | 아니오\n4) d | 아니오\n5) e | 아니오",
        })
        .mockResolvedValueOnce({
          successIndexes: [0],
          text: "1) f | 예",
        })

      const images = Array.from({ length: 6 }, (_, i) => ({ url: `https://example.com/${i}.jpg` }))
      const result = await analyzeImagesBatch("test-key", images)

      expect(runVisionPromptBatchMock).toHaveBeenCalledTimes(2)
      expect(result).toHaveLength(6)
      expect(result[5]).toEqual({ caption: "f", isExterior: true })
    })

    it("배치 호출이 완전히 실패해도(text: null) 전체를 버리지 않고 빈 캡션으로 폴백한다", async () => {
      runVisionPromptBatchMock.mockResolvedValueOnce({ successIndexes: [], text: null })

      const result = await analyzeImagesBatch("test-key", [
        { url: "https://example.com/1.jpg" },
        { url: "https://example.com/2.jpg" },
      ])

      expect(result).toEqual([
        { caption: "", isExterior: false },
        { caption: "", isExterior: false },
      ])
    })

    it("일부 사진만 파싱에 성공해도 성공한 사진만 반영하고 나머지는 빈 캡션으로 남긴다", async () => {
      runVisionPromptBatchMock.mockResolvedValueOnce({
        successIndexes: [0, 1],
        // 2번째 줄은 형식이 깨져 파싱되지 않음
        text: "1) 라떼, 커피잔 | 아니오\n형식이 깨진 줄",
      })

      const result = await analyzeImagesBatch("test-key", [
        { url: "https://example.com/1.jpg" },
        { url: "https://example.com/2.jpg" },
      ])

      expect(result[0]).toEqual({ caption: "라떼, 커피잔", isExterior: false })
      expect(result[1]).toEqual({ caption: "", isExterior: false })
    })
  })

  describe("matchImagesToParagraphs", () => {
    it("캡션 키워드가 겹치는 문단에 배정한다", () => {
      const result = matchImagesToParagraphs(
        [{ caption: "우니, 초밥" }, { caption: "티라미수, 디저트" }],
        [
          { index: 1, text: "우니초밥을 먹었다" },
          { index: 2, text: "디저트로 티라미수가 나왔다" },
        ]
      )

      expect(result).toEqual([1, 2])
    })

    it("겹치는 키워드가 하나도 없으면 null을 반환한다", () => {
      const result = matchImagesToParagraphs(
        [{ caption: "고양이, 강아지" }],
        [{ index: 1, text: "오늘 먹은 초밥 이야기" }]
      )

      expect(result).toEqual([null])
    })

    it("후보 문단이 없으면 전부 null을 반환한다", () => {
      const result = matchImagesToParagraphs([{ caption: "우니" }], [])
      expect(result).toEqual([null])
    })
  })
})
