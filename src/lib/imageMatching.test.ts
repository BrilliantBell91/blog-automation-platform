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

      expect(result).toEqual([{ caption: "가게 외관 사진", isExterior: true, isMenu: false }])
      expect(runVisionPromptBatchMock).not.toHaveBeenCalled()
    })

    it("라벨에 메뉴판 관련 단어가 있으면 비전 호출 없이 메뉴판으로 판정한다", async () => {
      const result = await analyzeImagesBatch("test-key", [
        { url: "https://example.com/1.jpg", existingLabel: "메뉴판 사진" },
      ])

      expect(result).toEqual([{ caption: "메뉴판 사진", isExterior: false, isMenu: true }])
      expect(runVisionPromptBatchMock).not.toHaveBeenCalled()
    })

    it("라벨이 파일명 패턴(의미 없음)이면 비전 배치 호출로 캡션을 생성한다", async () => {
      runVisionPromptBatchMock.mockResolvedValueOnce({
        successIndexes: [0],
        text: "1) 우니, 초밥, 클로즈업 | 아니오 | 아니오",
      })

      const result = await analyzeImagesBatch("test-key", [
        { url: "https://example.com/1.jpg", existingLabel: "20180206_195520.jpg" },
      ])

      expect(result).toEqual([{ caption: "우니, 초밥, 클로즈업", isExterior: false, isMenu: false }])
    })

    it("비전 배치 응답에서 메뉴판 여부(두 번째 예/아니오)도 함께 파싱한다", async () => {
      runVisionPromptBatchMock.mockResolvedValueOnce({
        successIndexes: [0],
        text: "1) 메뉴판, 가격표 | 아니오 | 예",
      })

      const result = await analyzeImagesBatch("test-key", [
        { url: "https://example.com/1.jpg", existingLabel: "20180206_195520.jpg" },
      ])

      expect(result).toEqual([{ caption: "메뉴판, 가격표", isExterior: false, isMenu: true }])
    })

    it("영문자가 섞인 메신저/카메라 앱 자동 파일명(예: 카카오톡 전송 파일명)도 의미 없는 라벨로 판정해 비전 배치 호출로 캡션을 생성한다 (회귀 테스트)", async () => {
      // 과거 정규식은 숫자만 허용해 "KakaoTalk_..." 같은 영문 포함 파일명을 못 잡았고,
      // 그 결과 파일명 자체가 캡션으로 쓰여 문단 매칭이 항상 실패하고 외관 판별도
      // 항상 false가 되는 사고로 이어졌다(실측 확인).
      runVisionPromptBatchMock.mockResolvedValueOnce({
        successIndexes: [0],
        text: "1) 가게 외관, 간판 | 예 | 아니오",
      })

      const result = await analyzeImagesBatch("test-key", [
        { url: "https://example.com/1.jpg", existingLabel: "KakaoTalk_20260717_161714013_11.jpg" },
      ])

      expect(runVisionPromptBatchMock).toHaveBeenCalledTimes(1)
      expect(result).toEqual([{ caption: "가게 외관, 간판", isExterior: true, isMenu: false }])
    })

    it("여러 장을 배치 크기(5장) 단위로 나눠 여러 번 호출한다", async () => {
      runVisionPromptBatchMock
        .mockResolvedValueOnce({
          successIndexes: [0, 1, 2, 3, 4],
          text: "1) a | 아니오 | 아니오\n2) b | 아니오 | 아니오\n3) c | 아니오 | 아니오\n4) d | 아니오 | 아니오\n5) e | 아니오 | 아니오",
        })
        .mockResolvedValueOnce({
          successIndexes: [0],
          text: "1) f | 예 | 아니오",
        })

      const images = Array.from({ length: 6 }, (_, i) => ({ url: `https://example.com/${i}.jpg` }))
      const result = await analyzeImagesBatch("test-key", images)

      expect(runVisionPromptBatchMock).toHaveBeenCalledTimes(2)
      expect(result).toHaveLength(6)
      expect(result[5]).toEqual({ caption: "f", isExterior: true, isMenu: false })
    })

    it("배치 호출이 완전히 실패해도(text: null) 전체를 버리지 않고 빈 캡션으로 폴백한다", async () => {
      runVisionPromptBatchMock.mockResolvedValueOnce({ successIndexes: [], text: null })

      const result = await analyzeImagesBatch("test-key", [
        { url: "https://example.com/1.jpg" },
        { url: "https://example.com/2.jpg" },
      ])

      expect(result).toEqual([
        { caption: "", isExterior: false, isMenu: false },
        { caption: "", isExterior: false, isMenu: false },
      ])
    })

    it("일부 사진만 파싱에 성공해도 성공한 사진만 반영하고 나머지는 빈 캡션으로 남긴다", async () => {
      runVisionPromptBatchMock.mockResolvedValueOnce({
        successIndexes: [0, 1],
        // 2번째 줄은 형식이 깨져 파싱되지 않음
        text: "1) 라떼, 커피잔 | 아니오 | 아니오\n형식이 깨진 줄",
      })

      const result = await analyzeImagesBatch("test-key", [
        { url: "https://example.com/1.jpg" },
        { url: "https://example.com/2.jpg" },
      ])

      expect(result[0]).toEqual({ caption: "라떼, 커피잔", isExterior: false, isMenu: false })
      expect(result[1]).toEqual({ caption: "", isExterior: false, isMenu: false })
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

    it("캡션이 비슷해 겹치는 문단이 같아도, 이미 배정된 문단은 재사용하지 않고 다른 문단으로 분산한다 (회귀 테스트)", () => {
      // 실측 확인된 사고: 사진 3장의 캡션이 모두 "초밥" 키워드를 포함하면 소프트
      // 페널티만으로는 충분히 안 갈라져 한 문단에 사진이 2~3장씩 몰렸다("짧은 문단
      // 하나에 사진 하나"라는 요구와 정반대). 이제는 이미 배정된 문단을 하드 제외해,
      // 후보 문단 수가 충분하면 서로 다른 문단에 1장씩 퍼져야 한다.
      const result = matchImagesToParagraphs(
        [{ caption: "초밥, 참치" }, { caption: "초밥, 우니" }, { caption: "초밥, 계란찜" }],
        [
          { index: 1, text: "오늘의 초밥 코스를 소개합니다" },
          { index: 2, text: "초밥과 곁들인 계란찜도 나왔다" },
          { index: 3, text: "마지막으로 초밥 한 점 더" },
        ]
      )

      expect(result.every((r) => r !== null)).toBe(true)
      expect(new Set(result).size).toBe(3) // 세 사진이 각각 다른 문단에 배정됨
    })

    it("후보 문단보다 사진이 많으면, 다 채운 뒤 넘치는 사진은 매칭 실패(null)로 폴백에 넘긴다", () => {
      const result = matchImagesToParagraphs(
        [{ caption: "초밥" }, { caption: "초밥" }, { caption: "초밥" }],
        [{ index: 1, text: "초밥 이야기" }]
      )

      expect(result.filter((r) => r !== null)).toHaveLength(1)
      expect(result.filter((r) => r === null)).toHaveLength(2)
    })

    it("입력 순서상 먼저 와도, 약하게 겹치는 사진이 훨씬 구체적으로 겹치는 사진보다 문단을 먼저 차지하지 않는다 (회귀 테스트)", () => {
      // 실측 확인된 사고: "일본식 계란찜, 푸딩 계란찜"(계란찜 2회 언급, 4개 중 2개
      // 겹침)이 정확히 계란찜 문단에 매칭돼야 하는데, "기본 상차림, 토마토 샐러드"
      // (샐러드 1개만 겹침, 4개 중 1개)가 배열에서 먼저 처리되는 바람에 이 유일한
      // 후보 문단을 먼저 선점해버려서, 정작 더 구체적으로 맞는 계란찜 사진이 문단
      // 매칭에 실패해 위치 기반 폴백으로 밀려나는 사고로 이어졌다. 점수가 더 높은
      // 매칭이 입력 순서와 무관하게 항상 우선해야 한다.
      const result = matchImagesToParagraphs(
        [
          { caption: "기본 상차림, 토마토 샐러드" }, // 약한 매칭(1/4) - 배열상 먼저 옴
          { caption: "일본식 계란찜, 푸딩 계란찜" }, // 강한 매칭(2/4) - 배열상 나중에 옴
        ],
        [{ index: 1, text: "처음 시작은 상큼한 샐러드랑 보들보들한 계란찜이 나온다" }]
      )

      expect(result[1]).toBe(1) // 계란찜 사진이 유일한 후보 문단을 차지
      expect(result[0]).toBeNull() // 샐러드 사진은 밀려나 매칭 실패로 폴백에 넘어감
    })
  })
})
