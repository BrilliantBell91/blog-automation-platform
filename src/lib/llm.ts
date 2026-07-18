import { GoogleGenAI } from "@google/genai"
import { Post, LlmAttachment } from "@/types"
import {
  generateAiImage,
  verifyImageRelevance,
  type IllustrativeImageStyle,
} from "./imageGen"
import { searchRealImages, searchGoogleImages } from "./imageSearch"
import { describeImage, matchImagesToParagraphs } from "./imageMatching"
import { searchNaverPlace } from "./naverLocalSearch"
import { extractNaverPlaceId, fetchNaverPlaceDetail, fetchNaverPlacePhotos } from "./naverPlaceDetail"
import { inferFacilityFromReviews } from "./naverReviewSearch"
import { extractLinkLabel } from "./naverDraftParser"
import { withRetry, shouldTryNextModel } from "./geminiRetry"

// 무료 티어 할당량은 모델별로 독립적으로 차감된다(실측 확인됨: gemini-3.5-flash가
// 하루 한도로 막혀도 다른 모델은 정상 동작). 앞쪽부터 시도하고 할당량 소진(429)이나
// 계정에서 미지원(404)이면 다음 모델로 자동 전환한다.
export const MODEL_FALLBACK_CHAIN = [
  "gemini-3-flash-preview",
  "gemini-3.1-flash-lite",
  "gemini-2.0-flash",
  "gemini-flash-latest",
] as const
// 링크가 여러 개면 url_context 툴이 추가로 페이지를 fetch하느라 시간이 더 걸릴 수 있어 여유를 둔다.
const TIMEOUT_MS = 45_000

// 카테고리별 실제 블로그(blog.naver.com/zmfflsp) 스타일 참고자료.
// 2026-07-14에 카테고리별 실제 게시글을 직접 확인하고 정리한 내용:
// - 결혼/육아: 혼인신고, 육아휴직 신청 등 절차·정보 안내형 글이 많음 (인용구 소제목 + 번호 목록 구조)
// - 나들이/맛집: 장소 방문 후기형 글 (상단 정보 인용구 + 사진별 코멘트 구조)
// - 기타: 일상 공유부터 이벤트/혜택 공유까지 다양하게 섞여 있음
//
// 이미지 소싱 우선순위 변경(2026-07-15):
// - allowAiFallback=false (나들이/맛집): 첨부 → 웹 검색만 (AI 생성 제외)
// - allowAiFallback=true (결혼/육아/기타): 첨부 → 웹 검색 → AI 생성 보완
const CATEGORY_STYLE_NOTES: Record<
  string,
  {
    naverCategoryLabel: string
    notes: string
    aiImageCount: number
    imagesPerParagraphs: number
    allowAiFallback: boolean
  }
> = {
  결혼: {
    naverCategoryLabel: "결혼일지(۶•̀ᴗ•́)۶",
    aiImageCount: 2,
    imagesPerParagraphs: 3,
    allowAiFallback: true,
    notes: `- 이 카테고리는 실제로는 단일 톤이 아니라 아래 세 갈래로 뚜렷이 나뉩니다(실제 글 9편 전수 분석 결과). 글의 성격에 맞는 갈래를 판단해서 그 형식을 따르세요.
  (1) 정보/절차 안내형(혼인신고, 예산 등 how-to): 개인 서사가 거의 없는 순수 정보 글.
  (2) 업체 후기+실용정보 혼합형(웨딩홀 투어, 스드메 업체 후기 등): 스펙 정보 + 선택 이유를 개인 후기 톤으로.
  (3) 스토리텔링/일기형(프로포즈, 연애 에피소드 등): 절차 정보 없이 대화체 서사 위주.
- 서두는 "안녕하세요, 아기부리새예요.🙌"로 시작해 주제 한 문장 뒤 "...기록 시작하겠습니닷 ✧⁺⸜₍ᐢ.𓂂.ᐢ₎⸝⁺✧"로 이어지는 고정 인사말을 그대로(또는 거의 그대로) 재현하세요.
- 정보/절차형(1)은: 소제목을 그 줄 맨 앞에 "> "만 붙여 표시하고(\`<blockquote>\` 같은 HTML 태그는 쓰지 마세요), 소제목 다음 줄은 반드시 빈 줄로 분리한 뒤 단계를 번호 목록(1. 2. 3.)으로 정리하세요. 놓치면 안 되는 정보는 **볼드**로 강조하세요.
- 업체 후기형(2)은: 스펙 정보를 대시(-) 목록으로 나열한 뒤("-위치 : ... / -주차 : ... / -전화번호 : ..." 형식), 이어서 "선택 이유"를 별도로 번호 목록화하세요(예: "1. 위치 : ... 2. 식사 : ... 3. 주차 : ...").
- 마무리는 "[날짜] 아기부리새와/가 쀼찬~ [주제] 기록 총총" 형식의 짧은 종결구로 끝내세요(정보형 단독 글은 "총총" 대신 "👋다들 행복한 [상황]하시길 바라요.👋" 같은 직접 인사도 가능).
- 문장은 서두만 존댓말이고 본문은 반말/음슴체로 자연스럽게 전환되는 혼합체를 쓰세요. "ㅋㅋㅋ" 웃음 표현과 "!", "~"를 자주 섞고, 민망함/사과 표현엔 "„• ֊ •„)੭" 같은 카오모지를 쓰세요.
- 해시태그는 갈래별로 다르게: 정보형은 동일 어근에 접미어만 바꾼 롱테일 태그를 10개 이상도 가능("#혼인신고 #혼인신고하는법 #혼인신고준비물 ..."), 업체 후기형은 "#업체명 #지역업체명 #카테고리추천" 조합 3~7개, 서사형은 2~4개로 간결하게.`,
  },
  육아: {
    naverCategoryLabel: "아가야 안녕(•ө•)♡",
    aiImageCount: 2,
    imagesPerParagraphs: 3,
    allowAiFallback: true,
    notes: `- 실제 이 카테고리 글은 전부(2편 전수 확인) 육아휴직/출산휴가 신청 같은 절차·서류 안내형입니다. 성장기록·이유식·용품 후기 톤이 아니라 아래처럼 "정보 메모" 톤으로 쓰세요.
- 서두는 "안녕하세요, 아기부리새예요.🙌"로 시작해서 "[주제] 지금 바로 시작합니닷 ✧⁺⸜₍ᐢ.𓂂.ᐢ₎⸝⁺✧"로 이어지는 고정 인사말을 그대로(또는 거의 그대로) 재현하세요. 다른 카테고리처럼 "기록"이 아니라 "[신청방법 등 주제] 지금 바로 시작합니닷"으로 자연스럽게 변형하세요.
- 서두 직후 핵심 일정/조건을 인용구(각 줄 맨 앞에 "> ")로 요약하세요(예: "출산예정일 : ...", "육아휴직일정 : ..."). \`<blockquote>\` 같은 HTML 태그는 쓰지 마세요.
- 본문은 번호 매긴 절차 목록(1. 2. 3.)으로 전개하고, 화면의 버튼/메뉴명은 대괄호로 표시하세요(예: "1. [고용24] 홈페이지 접속 2. 좌측 상단 [기업] 클릭"). 소제목이 있다면 줄 다음에 반드시 빈 줄을 넣어 본문과 분리하세요.
- 놓치면 안 되는 조건/기한/주의사항은 **볼드**로 강조하세요(예: "**휴가 시작일 다음 날부터 등록 가능**").
- 본문 절차 설명 문장은 감성적 구어체가 아니라 메모·체크리스트형 축약 종결("~함.", "~됨.", "~줌.")을 쓰세요. 예: "유선으로 상세한 상담 및 카톡으로 신청 방법 및 순서 보내줌.", "예시로 본인 육아휴직 기간 넣음."
- 마무리는 "총총"을 쓰지 말고, 이 카테고리 전용 클로징을 쓰세요: 주제에 맞는 응원 한 문장 + "👋다들 [상황에 맞는 문구] 보내세요.👋" (예: "그럼 자신이 모든 걸 처리해야 하는 워킹맘들을 응원하며 글 마무리하겠습니다. 👋다들 아기와 함께 하는 힘찬 하루 보내세요.👋")
- 해시태그는 감성 태그가 아니라 핵심 키워드에 "대상(회사/사업주/직원/개인)"과 "행위(신청/신고/지급/부담)"를 조합한 SEO 키워드 순열로 10개 이상 구성하세요(예: "#육아휴직 #육아휴직신청방법 #육아휴직회사신청 #육아휴직사업주신청방법 #육아휴직직원신청").`,
  },
  나들이: {
    naverCategoryLabel: "나들이일지(˘▾˘)~",
    aiImageCount: 4,
    imagesPerParagraphs: 2,
    allowAiFallback: false,
    notes: `- 방문한 장소(숙소, 시설, 여행지, 액티비티, 공연, 체험 등) 후기 글입니다. 아래는 이 카테고리 실제 글 20편을 전수 분석해 확인한 패턴입니다. 맛집과 서두·인용구·지도 마무리 뼈대는 같지만, 장소 유형에 따라 세부가 달라지니 글 내용에 맞는 유형을 판단해서 적용하세요.
- 서두는 "안녕하세요, 아기부리새예요.🙌" + 훅 한 줄 + "지금 바로 시작합니닷 ✧⁺⸜₍ᐢ.𓂂.ᐢ₎⸝⁺✧"로 이어지는 고정 인사말을 그대로(또는 거의 그대로) 재현하세요.
- 상단 정보 인용구(각 줄 맨 앞에 "> ", \`<blockquote>\` 금지)는 장소 유형에 맞는 항목으로 구성하세요("확인된 매장 정보"에 실제로 주어진 항목만 쓰고 없는 항목은 지어내지 마세요):
  - 시설/액티비티(클라이밍, 뷰티샵 등): 주소/전화/영업시간/주차/화장실
  - 숙소: 주소/전화/주차/체크인/체크아웃/메모
  - 사우나·찜질방: 주소/전화/영업시간/주차장/요금
  - 무료 야외 명소: 주소/전화/주차/화장실(영업시간은 생략 가능)
  - 체험: 주소/전화/금액/할인/메모
  - 콘서트 등 공연: 정보 인용구 대신 "필수 준비물 : ... / 선택 : ... / 비추 : ..." 형식의 준비물 리스트를 쓰세요.
- 본문 소제목은 "메뉴판 ▼" 대신 장소에 맞게 바꾸세요(예: "이용권 및 음료 안내 ▼", "요금표 ▼", "정규 강습 시간 안내 ▼"). 사진 위치마다 한두 문장씩(최대 3문장) 짧고 구어체로 코멘트하세요(예: "~있다", "~함", "~인 듯"). 여행 코스처럼 하루/이틀을 통째로 기록하는 글은 자연스럽게 길어질 수 있습니다.
- 정보성이 약한 글(콘서트, 체험 등)에는 "정보 전달이 아니라 일기장이라고 생각해줘요" 같은 디스클레이머 문구를 자연스럽게 넣어도 됩니다.
- 마무리는 두 갈래입니다: (1) 숙소·명소형은 "위치는 여기/요기 ▼" + 지도 마커 뒤 바로 "[날짜] ... 기록 총총"으로 끝내고 별도 작별인사는 생략 가능합니다. (2) 활동형(사우나·클라이밍·체험 등)은 지도 마커 뒤에 "글이 도움이 되었다 싶으시면 공감이랑 댓글 부탁드립니당." 같은 CTA와 함께 활동에 맞는 형용사를 넣은 "👋그럼 다들 [활동에 맞는 표현] 하루 보내세요.👋"로 마무리하세요. 어느 쪽이든 지도가 총평보다 먼저 오면 안 됩니다.
- 해시태그는 "장소명+지역명+업종+추천/명소/가볼만한곳" 조합을 기본으로, 매장형은 6개 내외, 명소·사우나는 10~12개까지 SEO 롱테일(예: "~실시간", "~시기")을 붙이세요.`,
  },
  맛집: {
    naverCategoryLabel: "욤뇸뇸일지(˘༥˘ )",
    aiImageCount: 4,
    imagesPerParagraphs: 2,
    allowAiFallback: false,
    notes: `- 방문한 맛집/카페 후기 글입니다. 아래는 이 카테고리 실제 글 56개를 전수 분석해 확인한 고정 패턴이니 최대한 그대로 따르세요.
- 서두는 거의 항상 "안녕하세요, 아기부리새예요.🙌" 로 시작해서 가게 특징을 담은 짧은 훅 한 줄을 붙이고, "지금 바로 시작합니닷 ✧⁺⸜₍ᐢ.𓂂.ᐢ₎⸝⁺✧" 로 이어집니다. 이 인사말과 카오모지를 그대로(또는 거의 그대로) 재현하세요.
- 그다음 매장 정보를 인용구(각 줄 맨 앞에 "> ")로 정리하되, 실제로 확인된 항목만 반드시 "주소 / 전화 / 영업시간 / 주차 / 화장실" 순서로 넣으세요(없는 항목은 생략 — 지어내지 마세요, \`<blockquote>\` 같은 HTML 태그는 쓰지 마세요). 실제 형식 예시:
  > 주소 : 광주 남구 노대실로34번길 14
  > 전화 : 062-652-9265
  > 영업시간
  > -월-토 11:00-22:00
  > -정기 휴무 매주 일요일
  > 주차 : X (가게 앞 길가에 주차 가능한듯)
  > 화장실 : 남여 공용, 내부에 위치
- 본문은 "메뉴판 ▼" 소제목 → "매장 내부 ▼" 소제목(외관/인테리어 사진 자리) → 음식·음료 사진별 코멘트(사진 한 자리당 1~2문장, 최대 3문장) 순서로 전개하세요. 소제목은 그 줄에 짧게 쓰고 별도 문단으로 분리하세요.
- 마무리는 반드시 이 순서를 지키세요: (1) 총평 2~4문장 → (2) "위치는 요기 ▼" 한 줄 다음에 참고링크(지도) 마커를 그대로 남기기(위 "위치 링크 유지 규칙" 참고) → (3) "👋그럼 다들 [맛있는/즐거운/평화로운] 하루 보내세요.👋" 같은 짧은 인사. 지도가 총평보다 먼저 오면 안 됩니다. "공감/댓글 부탁드립니다" 같은 CTA 문구는 최근 글에는 없으니 쓰지 마세요.
- 문장 종결은 "~다."뿐 아니라 "~음."(명사형 캐주얼 종결, 예: "고기가 엄청 부드러움."), "~인 듯/듯."(추측형)을 자주 섞고, 가끔 "..ㅋㅋㅋ"로 얼버무리듯 끝내거나 "~당"(애교체, 예: "깜빡했당🙄")을 쓰세요.
- 해시태그는 6~10개: "#상호명" 1~2개 + "#지역+맛집/카페/이자카야" 조합 여러 개 + "#지역+상호명" 결합형 + 대표 메뉴/특징 태그 1~2개로 구성하세요.
- 실제 글 발췌(말투·구성 참고용, 내용은 무시):
  > 안녕하세요, 아기부리새예요.🙌 소주 세 병 순삭, 조봉순상무국밥 노대점 지금 바로 시작합니닷 ✧⁺⸜₍ᐢ.𓂂.ᐢ₎⸝⁺✧ (...) 국밥 첫 입 먹고 "오~"하고 곱창 한 입 먹고 두 눈 똥그랗게 떠서 서로를 바라본..ㅋㅋㅋ 쀼찬이랑 먹는 내내 "맛있다~ 맛있다~🤤"하며 너무너무너무x5 만족스럽게 먹고 나왔다. 광주가면 다음에 꼭! 또! 가야지. 👋그럼 다들 맛있는 하루 보내세요.👋
  > 여기는... 정말 맛있다. 친한 친구들과는 여기서 청첩장 모임을 했다. 여기는 1차로 가면 안된다. 아니야, 1차로 가야 한다. 👋그럼 다들 맛있는 하루 보내세요.👋`,
  },
  기타: {
    naverCategoryLabel: "일상/꿀팁일지(ᐢ ̫ᐢ)",
    aiImageCount: 2,
    imagesPerParagraphs: 3,
    allowAiFallback: true,
    notes: `- 실제 이 카테고리 글 14편을 전수 분석한 결과, 순수 일상 잡담글은 없고 "이벤트/혜택 공유형"과 "정보/꿀팁형" 두 갈래로만 나뉩니다. 글 내용에 맞는 쪽을 판단해서 적용하세요.
- 서두는 "안녕하세요, 아기부리새예요.🙌"로 시작하는 고정 인사말을 재현하되, 이벤트형은 "[브랜드/상품명] 이벤트 지금 바로 공유드립니닷 ✧⁺⸜₍ᐢ.𓂂.ᐢ₎⸝⁺✧", 정보/꿀팁형은 "[주제] 지금 바로 시작합니닷 ✧⁺⸜₍ᐢ.𓂂.ᐢ₎⸝⁺✧"로 이어가세요.
- 이벤트/혜택 공유형은 인사말 직후 다음 문구를 (거의 토씨 그대로) 넣으세요: "추첨 형식이라 100% 받는건 아니지만 받으면 좋으니까 아래 이벤트 내용 보고 괜찮다 싶으면 신청ㄱㄱ! SNS 공유가 필수는 아니지만 이벤트 공유 시 당첨 확률 올라감". 이후 상품에 대한 짧은 감상(1~2문장)만 곁들이고 본문을 길게 늘리지 마세요(실제 글도 150~500자로 짧습니다). 마무리는 "총총" 없이 바로 "👋그럼 다들 좋은 소식있는 하루 보내세요.👋" 같은 인사로 끝내세요.
- 정보/꿀팁형은 소제목 없이 바로 번호 목록(1. 2. 3...)으로 절차를 서술하고, 필요하면 단계 뒤에 "Tip : ..." 부연 설명을 붙이세요. 결혼/육아처럼 인용구 소제목을 따로 쓰지 않습니다. 마무리는 "공감이랑 댓글 부탁드립니당." + "👋그럼 다들 [주제에 맞는 문구] 보세요.👋" + "[주제] 총총" 순서로 끝내세요.
- 해시태그는 감성 태그 없이 브랜드명/주제어를 변주한 롱테일로 구성하세요(이벤트형 4~5개, 이벤트 모음형은 브랜드당 2~3개씩 20개 이상도 가능, 정보/꿀팁형 6~7개).`,
  },
}

const DEFAULT_AI_IMAGE_COUNT = 1
const DEFAULT_ALLOW_AI_FALLBACK = false

function buildCategoryStyleNote(category: string): string {
  const entry = CATEGORY_STYLE_NOTES[category]
  if (!entry) return ""
  return `\n\n## 카테고리별 글 구성 참고 (실제 블로그 "${entry.naverCategoryLabel}" 카테고리 기준)\n${entry.notes}`
}

/**
 * 네이버 블로그 스타일 가이드 기본 시스템 프롬프트
 */
function buildSystemPrompt(styleGuide?: string, category?: string): string {
  const base = `당신은 네이버 블로그 "아기부리새"를 운영하는 실제 블로거 본인입니다. 독자는 이 글이 AI가 아니라 블로거 본인이 직접 쓴 글이라고 자연스럽게 믿어야 합니다. 아래 스타일 가이드를 반드시 지켜 글을 재작성하세요.

## 어투 (매우 중요 - 아래 실제 예시의 말투를 최대한 그대로 재현하세요)
아래는 이 블로거가 실제로 쓴 글의 발췌입니다(내용/주제는 무시하고 말투·리듬만 참고):

> 일단 넓다.
> 신기하게 심리 상담방도 있다. 조금 궁금쓰.
> 훈제란이 좀 아쉽다. 다음엔 맥반석을 먹어야 겠다.
> 그렇지만 찜질방에서 계란+식혜 조합은 뭐다? 사랑이다.ෆ˙ᵕ˙ෆ
> 사우나 찜질방 요금 ▼
> 저도 곧 혼인신고 하러 갑니다! 결혼하고 같이 산지 2년이 넘었는데 막상 혼인신고를 하려니까 또 설레네요🥰

이 예시에서 드러나는 특징을 그대로 살리세요:
- "~다.", "~음.", "~함.", "~인 듯." 같은 짧고 단정적인 반말체 문장을 서술문 사이에 자연스럽게 섞으세요(전부 "~예요/~네요"로만 끝내지 마세요).
- 가끔 스스로 묻고 스스로 답하는 식의 가벼운 문장("~뭐다? ~이다.")이나 감탄사, 혼잣말 같은 문장을 넣으세요.
- "일단", "그냥", "당연히", "진짜", "완전", "역시", "넘", "왕" 같은 구어체 강조 부사를 자연스럽게 씁니다.
- "쓰", "~인 듯", "ㅎㅎㅎ", "ㅋㅋㅋ" 같은 어미/추임새와 "( ˘﹃˘ )", "ෆ˙ᵕ˙ෆ", "✧⁺⸜₍ᐢ.𓂂.ᐢ₎⸝⁺✧" 같은 특수 이모티콘을 문장 사이사이 자연스럽게 섞으세요.
- 문장은 짧게 끊어 쓰고, 지나치게 매끄럽거나 설명적인 "AI스러운" 문장(예: 완벽한 접속사로 이어지는 긴 문장, 과도하게 친절한 부연설명)은 피하세요.
- "~예요", "~네요", "~더라고요" 같은 정중한 반말도 섞이지만, 위 예시처럼 딱딱 끊는 반말체 비중을 더 높게 유지하세요.
- 과도한 존댓말은 피하고, 개인적 경험/감정을 자연스럽게 표현

## 구성
1. 서두: 1~2문장으로 글의 핵심 인상
2. 본문: 짧은 문단 위주로 구성 (사진별 설명이 있다면 장소→분위기→내용 순). **각 문단은 1~3문장 이내로 짧게 끊어 쓰세요.** 한 문단이 4문장 이상 길어지면 안 됩니다 — 사진 자리 하나마다 코멘트가 방대해지는 것을 막기 위함입니다.
3. 마무리: 추천 또는 아쉬운 점, 배운 점

## 해시태그 (중요)
- "필수 포함 해시태그"가 주어지면, 그 태그들은 반드시 전부 해시태그 목록에 포함하세요(형식만 #태그명으로 맞추면 됨, 내용 변경 금지).
- 나머지 해시태그는 이 블로그의 실제 스타일에 맞게 자연스럽게 추가로 만들어서, 전체 해시태그 개수가 7~9개 정도가 되도록 채우세요.
- 실제 블로그는 "#분위기", "#데이트" 같은 지나치게 일반적인 단독 태그보다 상호명·지역명·속성을 조합한 좁은 태그(예: #부평맥주집, #부평하이볼)를 주로 씁니다. 이 방식을 따르세요.
- "필수 포함 해시태그"가 없으면, 위 스타일에 맞춰 전체 해시태그를 알아서 구성하세요.

## 첨부 사진 처리 규칙 (중요)
- 첨부된 사진의 실제 위치 배치는 시스템이 생성된 글을 후처리해서 자동으로 넣습니다. 당신은 사진 마커, "[사진]", "사진 첨부", 카메라 이모지 같은 어떤 형태의 placeholder도 절대 직접 만들어 쓰지 마세요.
- "첨부된 사진 설명"이 주어지면 그 캡션 내용만 참고해서 본문 흐름 속에서 자연스럽게 한두 문장 언급해도 되지만, 사진 내용을 마음대로 상상해서 묘사하거나 없는 디테일을 지어내지 마세요.

## 키워드 및 링크 반영 규칙 (매우 중요, 사실 왜곡 금지)
- "확인된 매장 정보"가 주어지면: 사용자가 첨부한 지도 URL 기준으로 실제 확인한 사실이므로 최우선입니다. 주소/전화/영업시간/주차/편의시설 등 주어진 항목은 본문 상단 요약에 반드시 이 값과 정확히 일치하게 포함하세요. url_context로 열어본 내용이나 스스로 알고 있는 정보가 이와 다르더라도 이 값을 따르고, 여기 없는 항목(화장실 유무 등)은 다른 출처로 확인되지 않는 한 언급하지 마세요.
- "필수 포함 키워드"가 주어지면: 사용자가 직접 확인한 사실이므로, 각 키워드를 본문에 자연스럽게 반드시 포함하세요.
- "필수 포함 키워드"가 없으면: 아래 \`[참고링크 - 지도/메뉴/리뷰 등 실제로 확인되는 내용만 반영: URL]\` 마커를 제공된 URL 컨텍스트 도구로 실제로 열어 확인한 내용(지도 위치, 메뉴, 리뷰/후기 등)만으로 글을 구성하세요.
- **어느 경우든, 실제로 확인되지 않은 구체적 사실(메뉴명, 가격, 특정 리뷰 문구, 평점 등)은 절대 추측해서 지어내지 마세요.** 확인이 안 되거나 URL을 열람할 수 없으면 그 정보는 언급하지 말고 넘어가세요. 정확성이 자연스러움보다 우선입니다.

## 위치 링크 유지 규칙 (중요)
- 실제 블로그 글은 마무리 부분에 위치를 확인할 수 있는 지도 링크를 남겨둡니다. \`[참고링크 - ...: URL]\` 마커가 지도/장소 링크라면, 내용 확인에 활용한 뒤에도 그 마커 자체를 지우지 말고 글 마무리(마지막 인사 앞이나 뒤) 근처에 위치 안내용으로 그대로 한 번 남겨두세요. 마커 형식을 바꾸거나 요약해서 다시 쓰지 말고 정확히 그 형태 그대로 유지하세요.${category ? buildCategoryStyleNote(category) : ""}`

  return styleGuide
    ? `${base}\n\n## 사용자 지정 스타일 가이드 (우선 적용)\n${styleGuide}`
    : base
}

// 링크 첨부만 LLM이 인식할 수 있는 마커 텍스트로 변환한다(url_context 툴로 실제 열어봐야
// 하므로 URL 자체가 필요함). Post.content(공개 사이트/DB용)와는 별개로 여기서만 조립한다.
// 사진 첨부는 LLM에게 URL 마커를 주지 않는다 — 모델이 마커 형식을 그대로 보존하지 않고
// 임의로 바꿔써서(예: "[사진 원본...]" → "📷첨부 사진") 실제 이미지가 통째로 사라지는
// 사고가 실측으로 확인되어, 사진은 텍스트 생성 후 insertImages()가 프로그래밍적으로 삽입한다.
function formatLinkMarkers(attachments: LlmAttachment[]): string {
  return attachments
    .filter((a) => a.kind === "link")
    .map((a) => {
      const label = a.label ? ` (${a.label})` : ""
      return `[참고링크 - 지도/메뉴/리뷰 등 실제로 확인되는 내용만 반영: ${a.url}]${label}`
    })
    .join("\n\n")
}

// 첨부된 사진의 캡션만 참고 정보로 전달한다(URL은 주지 않음 - 자연스러운 언급용).
function formatImageAttachmentHints(attachments: LlmAttachment[]): string {
  const captions = attachments
    .filter((a): a is LlmAttachment & { label: string } => a.kind === "image" && Boolean(a.label))
    .map((a, i) => `${i + 1}. ${a.label}`)

  if (captions.length === 0) return ""
  return `\n\n첨부된 사진 설명 (참고용 - 사진 위치는 시스템이 자동 배치하니 마커는 쓰지 말고, 자연스러운 언급에만 활용):\n${captions.join("\n")}`
}

function isNaverMapUrl(url: string): boolean {
  try {
    return new URL(url).hostname.endsWith("map.naver.com")
  } catch {
    return false
  }
}

// 지도 링크가 있으면 실제 매장 주소/전화를 조회해 "확인된 사실"로 프롬프트에 주입한다.
// map.naver.com은 SPA라 url_context 툴이 페이지를 열어도 실제 주소/전화 텍스트를 못 얻고,
// 그 결과 모델이 그럴듯하지만 틀린 정보를 지어내는 사고가 실측으로 확인되어 도입한
// 안전장치다. 사용자가 직접 확인하고 첨부한 그 URL을 기준으로 삼아야 하므로:
// 1순위) URL에 담긴 place ID로 네이버 플레이스 상세 페이지에서 그 정확한 장소의 정보를
//        직접 조회한다(가장 신뢰할 수 있음 - 상호명이 흔해도 사용자가 고른 그 지점 그대로).
// 2순위) place ID가 없으면 URL의 검색어(searchText 등)로 지역 검색을 시도한다.
// 제목으로는 검색하지 않는다 — 흔한 상호명(예: "잇키")을 제목만으로 검색하면 완전히 다른
// 지점(부평→송도)을 잘못 매칭하는 사고가 실측으로 확인됐고, 사용자도 "정확한 URL을
// 첨부할 것이니 그 URL 기준으로 반영해달라"고 명시적으로 요청했다.
async function buildVerifiedPlaceInfoText(
  apiKey: string,
  attachments: LlmAttachment[]
): Promise<string> {
  const mapLink = attachments.find((a) => a.kind === "link" && isNaverMapUrl(a.url))
  if (!mapLink) return ""

  const placeId = extractNaverPlaceId(mapLink.url)
  let place = placeId ? await fetchNaverPlaceDetail(placeId) : null

  const linkLabel = extractLinkLabel(mapLink.url)
  if (!place) {
    if (linkLabel !== "지도에서 위치 보기") {
      place = await searchNaverPlace(linkLabel)
    }
  }

  if (!place) return ""

  const address = place.roadAddress ?? place.address
  if (!address) return ""

  const lines = [`- 상호명: ${place.name ?? "(확인 안 됨)"}`, `- 주소: ${address}`]
  if (place.telephone) lines.push(`- 전화: ${place.telephone}`)
  if (place.businessHours) lines.push(`- 영업시간: ${place.businessHours}`)
  if (place.conveniences?.length) lines.push(`- 편의시설: ${place.conveniences.join(", ")}`)

  // 네이버 지도 상세 페이지에 화장실 정보가 없으면(conveniences에 언급 없음), 블로그
  // 리뷰 검색으로 보수적으로 보완한다. 공식 정보가 아니므로 "리뷰 기준"으로 명확히
  // 출처를 표시해, 모델이 지도 확인 사실과 동일한 신뢰도로 오인하지 않게 한다.
  const hasRestroomInfo = place.conveniences?.some((c) => c.includes("화장실"))
  if (!hasRestroomInfo) {
    const placeName = place.name ?? (linkLabel !== "지도에서 위치 보기" ? linkLabel : undefined)
    if (placeName) {
      const restroomNote = await inferFacilityFromReviews(apiKey, placeName, "화장실")
      if (restroomNote) lines.push(`- 화장실(리뷰 기준, 참고용): ${restroomNote}`)
    }
  }

  return `\n\n확인된 매장 정보 (사용자가 첨부한 지도 URL 기준 실제 확인된 사실 - 반드시 이 값과 정확히 일치하게 쓰고, 다른 곳에서 본 정보와 달라도 이 값을 따르세요. "(리뷰 기준, 참고용)"이라고 표시된 항목은 공식 정보가 아니라 방문자 리뷰에서 확인된 내용이니, 상단 정보 요약에 넣을 때 "리뷰에 따르면" 같은 뉘앙스를 살짝 남겨도 됩니다. 그 외 여기 없는 항목은 확인되지 않은 것이니 언급하지 마세요):\n${lines.join("\n")}`
}

/**
 * 사용자 메시지 구성
 */
function buildUserMessage(post: Post, verifiedPlaceInfoText: string): string {
  const attachments = post.contentAttachments ?? []
  const linkMarkersText = formatLinkMarkers(attachments)
  const imageHintsText = formatImageAttachmentHints(attachments)
  const keywords = post.keywords ?? []
  const keywordsText = keywords.length
    ? `\n\n필수 포함 키워드 (사용자가 직접 확인한 사실 - 반드시 자연스럽게 포함): ${keywords.join(", ")}`
    : ""
  const tagsText = post.tags.length
    ? post.tags.join(", ")
    : "(입력 없음 - 아래 스타일에 맞는 해시태그를 직접 구성)"

  return `다음 Notion 글을 위 스타일 가이드에 맞춰 네이버 블로그 포스팅용으로 재작성해주세요.

제목: ${post.title}
카테고리: ${post.category}
필수 포함 해시태그: ${tagsText}

본문:
${post.content || "(본문 텍스트 없음 - 아래 첨부 정보를 참고해 작성)"}${linkMarkersText ? `\n\n${linkMarkersText}` : ""}${imageHintsText}${verifiedPlaceInfoText}${keywordsText}`
}

const MARKER_PARAGRAPH = /^\[(사진 원본|참고링크)/

// 이미지 슬롯의 "장면 설명"으로 쓰기엔 너무 짧은 문단(예: "그럼 다들 기분 좋은 하루
// 보내세요.🙌" 같은 마무리 인사)은 실질적인 장면 정보가 없어, AI 생성 이미지가 본문과
// 전혀 무관한 결과(인물 클로즈업 등)로 나오는 사고가 실측으로 확인됐다. 다만 이 기준은
// 원래 40자였으나, 이 블로그의 실제 문체(어투 지침: "문장은 짧게 끊어 쓰고", 예시 "일단
// 넓다.", "훈제란이 좀 아쉽다." 등 10~20자대)와 정보성 글의 팩트 나열식 구조(예: "지원
// 기한: 출생일로부터 1년 이내")가 40자 기준에 걸려 후보 문단이 0개가 되고, 결과적으로
// 이미지 슬롯 자체가 안 생기는 문제가 실측으로 확인되어 15로 낮췄다. AI 생성은 이제
// allowAiFallback=true 카테고리(결혼/육아/기타)에서 "summary"(카드뉴스) 스타일로만
// 쓰이므로(실사 장면 묘사가 굳이 길 필요 없음) 원래 우려한 "짧은 문단→AI가 엉뚱한 실사
// 이미지 생성" 시나리오는 더 이상 발생하지 않는다. 실사가 중요한 나들이/맛집은
// allowAiFallback=false라 애초에 AI 생성을 쓰지 않는다(검색/장소사진만 사용).
const MIN_VISUAL_PARAGRAPH_LENGTH = 15

// 이미지 슬롯으로 쓸 수 있는 문단을 필터링한다. 인사말(첫 문단)/마무리·해시태그(마지막 문단),
// 인용구·해시태그 줄, 이미 사진/링크 마커인 문단, 장면 설명으로 쓰기엔 너무 짧은 문단은 제외한다.
function getVisualParagraphCandidates(paragraphs: string[]): number[] {
  const candidates: number[] = []
  paragraphs.forEach((raw, i) => {
    const p = raw.trim()
    if (i === 0 || i === paragraphs.length - 1) return
    if (!p || p.startsWith(">") || p.startsWith("#") || MARKER_PARAGRAPH.test(p)) return
    if (p.length < MIN_VISUAL_PARAGRAPH_LENGTH) return
    candidates.push(i)
  })
  return candidates
}

// 이미지 슬롯을 삽입할 문단 위치를 고른다. 후보 문단 중 균등한 간격으로 count개를 고른다.
// 후보가 count보다 적으면(짧은 글) 후보를 순환시켜서라도 정확히 count개를 반환한다 —
// 그렇지 않으면 호출부(insertImages)에서 뒤쪽 이미지(주로 사용자 첨부 사진)가 배정받을
// 자리 자체가 없어 조용히 누락되는 사고가 있었다(실측 확인됨). 같은 문단에 마커가 여러 개
// 붙는 것은 insertImages의 문자열 이어붙이기 특성상 안전하게 처리된다.
function selectImageInsertionPoints(candidates: number[], count: number): number[] {
  if (candidates.length === 0 || count <= 0) return []
  if (candidates.length >= count) {
    const step = candidates.length / count
    return Array.from({ length: count }, (_, k) => candidates[Math.floor(k * step)])
  }
  return Array.from({ length: count }, (_, k) => candidates[k % candidates.length])
}

// Notion 제목에 흔히 붙는 "[테스트]", "[협찬]" 같은 대괄호 접두사는 이미지 검색 관련성을
// 떨어뜨리므로 제거한다.
function cleanTitleForSearch(title: string): string {
  return title.replace(/^\[[^\]]*\]\s*/, "").trim()
}

// 이미지 슬롯마다 검색어를 다르게 구성해, 실제 본문(장소/메뉴)과 무관한 사진이 반복
// 재사용되지 않고 각 자리에 맞는 사진을 찾도록 한다. 사용자가 입력한 실제 태그를
// 조합에 사용하고(허구 키워드 조합 방지), 태그가 없으면 제목만으로 검색한다.
function buildImageSearchQuery(cleanTitle: string, tags: string[], slotIndex: number): string {
  if (tags.length === 0) return cleanTitle
  return `${cleanTitle} ${tags[slotIndex % tags.length]}`
}

// 후보 목록에서 (아직 안 쓰인 것 중) 관련성 검증을 통과한 첫 후보를 찾는다. 슬롯당 검증
// 시도 예산(remainingAttempts)을 다 쓰면 통과 못 해도 중단한다.
async function pickVerifiedCandidate(
  candidates: string[],
  usedUrls: Set<string>,
  description: string,
  apiKey: string,
  remainingAttempts: number
): Promise<{ pick: string | null; attemptsUsed: number }> {
  let attemptsUsed = 0
  for (const candidate of candidates) {
    if (usedUrls.has(candidate)) continue
    if (attemptsUsed >= remainingAttempts) break
    attemptsUsed++
    const relevance = await verifyImageRelevance(apiKey, candidate, description, "downloaded")
    if (relevance === "unknown") {
      console.warn(`[llm] 이미지 관련성 확인 불가(검증 모델 호출 실패) - 안전하게 건너뜀: ${candidate}`)
    }
    if (relevance === "relevant") return { pick: candidate, attemptsUsed }
  }
  return { pick: null, attemptsUsed }
}

// AI 이미지를 생성하고 관련성을 검증해 통과한 이미지를 반환한다. 1회 생성 후
// 검증에서 명시적으로 "무관하다"고 판정되면(irrelevant) 1회 재생성해 다시 검증하고,
// 그래도 실패하면 null을 반환한다. "generated" 소스로 검증하므로 의도된 카드뉴스
// 라벨 텍스트는 거부 사유가 되지 않는다.
//
// "unknown"(검증 모델 호출 자체가 실패 — 할당량 소진 등)은 여기서는 거부하지 않고
// 그대로 채택한다. 검색/장소사진(다운로드된 외부 이미지, pickVerifiedCandidate 참고)과
// 달리 AI 생성 이미지는 생성 프롬프트 자체에 "실존 인물/장소를 묘사하지 말 것" 지시가
// 이미 들어가 있어 1차 안전장치가 있고, 검증은 이중 확인 성격이 강하다. 검증 모델
// 전부가 할당량 소진으로 막혀 항상 unknown만 나오는 상황에서(실측 확인됨) unknown을
// irrelevant와 동일하게 거부하면 생성에 성공한 이미지까지 매번 폐기되어 결과적으로
// 이미지가 하나도 안 붙는 사고로 이어졌다.
async function generateVerifiedAiImage(
  apiKey: string,
  description: string,
  style: IllustrativeImageStyle
): Promise<string | null> {
  for (let attempt = 0; attempt < 2; attempt++) {
    const imageUrl = await generateAiImage(apiKey, description, style)
    if (!imageUrl) continue
    const relevance = await verifyImageRelevance(apiKey, imageUrl, description, "generated")
    if (relevance === "unknown") {
      console.warn("[llm] AI 생성 이미지 검증 불가(모델 호출 실패) - 생성 프롬프트의 안전장치를 믿고 채택")
    }
    if (relevance !== "irrelevant") return imageUrl
  }
  return null
}

const MAX_VERIFY_ATTEMPTS_PER_SLOT = 6
const MIN_ATTEMPTS_PER_SOURCE = 2

// 슬롯 하나를 채운다: (1) place 사진 → (2) 네이버 검색 → (3) 구글 검색(보완) 순으로 시도.
// 슬롯끼리 완전히 독립적으로 병렬 실행되므로(resolveShortfallImages 참고), usedUrls는
// 슬롯 내부(place/검색/구글 후보 간) 중복만 막는다 — 슬롯 간 중복은 호출부에서 후처리한다.
async function resolveSlotImage(
  slotIndex: number,
  description: string,
  cleanTitle: string,
  tags: string[],
  placePhotos: string[],
  apiKey: string
): Promise<string | null> {
  const usedUrls = new Set<string>()

  const fromPlace = await pickVerifiedCandidate(
    placePhotos,
    usedUrls,
    description,
    apiKey,
    MIN_ATTEMPTS_PER_SOURCE
  )
  if (fromPlace.pick) return fromPlace.pick
  let remaining = MAX_VERIFY_ATTEMPTS_PER_SLOT - fromPlace.attemptsUsed

  if (remaining >= MIN_ATTEMPTS_PER_SOURCE) {
    const searchCandidates = await searchRealImages(
      buildImageSearchQuery(cleanTitle, tags, slotIndex),
      8
    )
    const fromSearch = await pickVerifiedCandidate(
      searchCandidates,
      usedUrls,
      description,
      apiKey,
      remaining
    )
    if (fromSearch.pick) return fromSearch.pick
    remaining -= fromSearch.attemptsUsed
  }

  // (3) 네이버 검색으로 못 채웠을 때만 구글 검색으로 보완 시도
  if (remaining >= MIN_ATTEMPTS_PER_SOURCE) {
    const googleCandidates = await searchGoogleImages(
      buildImageSearchQuery(cleanTitle, tags, slotIndex),
      8
    )
    const fromGoogle = await pickVerifiedCandidate(
      googleCandidates,
      usedUrls,
      description,
      apiKey,
      remaining
    )
    if (fromGoogle.pick) return fromGoogle.pick
  }

  return null
}

// 부족한 이미지 개수를 채운다. 모든 카테고리가 동일한 파이프라인을 따른다:
// (1) 첨부된 지도 URL의 place ID로 그 장소의 실제 사진(업체 등록/방문자 인증 사진) 시도
// (2) 그걸로 못 채우면 슬롯마다 다른 검색어로 네이버 이미지 검색 시도
// (2.5) 네이버로도 못 채우면 구글 이미지 검색으로 보완 시도
// (3) allowAiFallback=true인 카테고리만, 그래도 못 채운 나머지를 검증 후 AI로 생성
// allowAiFallback=false인 카테고리(나들이/맛집)는 (1)+(2)+(2.5)로 채우지 못한 슬롯을 비워둔다.
// place ID 기반 사진은 첨부 링크가 가리키는 바로 그 장소의 사진이라 검색과 달리
// 다른 장소 사진이 섞일 일이 없다(실측 확인된 문제 - 이자카야 글에 검색으로 찾은
// 무관한 피자 사진이 쓰인 사고).
//
// 슬롯 간 처리는 완전히 병렬(Promise.all)로 실행한다 — 예전에는 순차 처리라 슬롯
// 수 × 최대 6회 검증이 그대로 누적되어 Vercel 함수 타임아웃에 걸릴 위험이 있었다.
// 병렬화하면 슬롯끼리 usedUrls를 실시간 공유할 수 없으므로, 같은 이미지가 서로 다른
// 슬롯에 중복 선택되는 경우 뒤의 슬롯을 비우는 후처리로 처리한다(슬롯마다 검색어가
// 다르므로 중복 자체는 드묾).
async function resolveShortfallImages(
  points: number[],
  paragraphs: string[],
  postTitle: string,
  tags: string[],
  apiKey: string,
  allowAiFallback: boolean,
  placeId: string | null
): Promise<(string | null)[]> {
  const cleanTitle = cleanTitleForSearch(postTitle)
  const placePhotos = placeId ? await fetchNaverPlacePhotos(placeId, points.length * 5) : []

  const rawResults = await Promise.all(
    points.map((pointIndex, i) =>
      resolveSlotImage(
        i,
        paragraphs[pointIndex].slice(0, 60),
        cleanTitle,
        tags,
        placePhotos,
        apiKey
      )
    )
  )

  // 슬롯 간 중복 제거(먼저 나온 슬롯이 우선)
  const seenUrls = new Set<string>()
  const results: (string | null)[] = rawResults.map((pick) => {
    if (!pick || seenUrls.has(pick)) return null
    seenUrls.add(pick)
    return pick
  })

  // allowAiFallback=false인 경우(나들이/맛집)는 여기서 반환. AI 생성은 하지 않음.
  if (!allowAiFallback) return results

  // (4) AI 생성 (allowAiFallback=true인 경우만)
  const missingIndexes = results
    .map((v, i) => (v === null ? i : -1))
    .filter((i) => i >= 0)

  if (missingIndexes.length > 0) {
    const generated = await Promise.all(
      missingIndexes.map((i) =>
        generateVerifiedAiImage(apiKey, paragraphs[points[i]].slice(0, 60), "summary")
      )
    )
    missingIndexes.forEach((i, k) => {
      results[i] = generated[k]
    })
  }

  return results
}

// 문단이 지나치게 길면(예: LLM이 "1~3문장" 규칙을 어기고 한 문단에 여러 문장을 몰아쓴
// 경우) 이미지 슬롯 후보 밀도가 낮아져 사진 사이 텍스트가 방대해진다. 마침표/느낌표/물음표
// 뒤에서 문장을 나눠 maxLength를 넘지 않는 선까지만 다시 묶어, 프롬프트 준수 여부와
// 무관하게 candidate 밀도를 강제로 높인다. 인용구/해시태그/마커 문단은 건드리지 않는다.
function splitLongParagraphs(paragraphs: string[], maxLength = 200): string[] {
  const result: string[] = []
  for (const paragraph of paragraphs) {
    if (
      paragraph.length <= maxLength ||
      paragraph.startsWith(">") ||
      paragraph.startsWith("#") ||
      MARKER_PARAGRAPH.test(paragraph)
    ) {
      result.push(paragraph)
      continue
    }
    const sentences = paragraph.split(/(?<=[.!?])\s+/)
    let chunk = ""
    for (const sentence of sentences) {
      if (chunk && chunk.length + sentence.length + 1 > maxLength) {
        result.push(chunk)
        chunk = sentence
      } else {
        chunk = chunk ? `${chunk} ${sentence}` : sentence
      }
    }
    if (chunk) result.push(chunk)
  }
  return result
}

// 사용자 첨부 사진과 부족분(실사 검색/AI 생성)을 모두 서술형 문단 사이사이에 프로그래밍적으로
// 끼워넣는다. 첨부 사진의 URL은 LLM에게 애초에 주지 않으므로(위 formatImageAttachmentHints
// 참고) 여기서 코드가 직접 삽입해야 실제로 첨부한 사진이 결과에 반드시 포함된다.
// 모든 카테고리가 동일하게 (첨부 → 웹 검색) 파이프라인을 따르고,
// allowAiFallback=true인 카테고리(결혼·육아·기타)만 AI 이미지로 보완한다.
// allowAiFallback=false인 카테고리(나들이·맛집)는 부족한 슬롯을 비워둔다.
async function insertImages(
  text: string,
  apiKey: string,
  post: Post,
  leadImageUrl?: string
): Promise<string> {
  const attachments = (post.contentAttachments ?? []).filter((a) => a.kind === "image")
  const entry = post.category ? CATEGORY_STYLE_NOTES[post.category] : undefined
  const allowAiFallback = entry?.allowAiFallback ?? DEFAULT_ALLOW_AI_FALLBACK

  const paragraphs = splitLongParagraphs(text.split("\n\n"))
  const candidates = getVisualParagraphCandidates(paragraphs)

  // 이미지 목표 개수를 "카테고리 최소값" 또는 "글 길이 기반값" 중 더 큰 값으로 결정
  const minImageCount = entry?.aiImageCount ?? DEFAULT_AI_IMAGE_COUNT
  const imagesPerParagraphs = entry?.imagesPerParagraphs ?? 5
  const lengthBasedCount = Math.ceil(candidates.length / imagesPerParagraphs)
  const targetCount = Math.max(minImageCount, lengthBasedCount)

  const shortfall = Math.max(targetCount - attachments.length, 0)
  const totalSlots = attachments.length + shortfall
  if (totalSlots === 0) return text

  const points = selectImageInsertionPoints(candidates, totalSlots)
  if (points.length === 0) return text

  const mapLink = (post.contentAttachments ?? []).find(
    (a) => a.kind === "link" && isNaverMapUrl(a.url)
  )
  const placeId = mapLink ? extractNaverPlaceId(mapLink.url) : null

  // 뒤쪽 자리(부족분)는 검색/생성으로 채운다 — 검색어/생성 프롬프트 자체가 그 문단
  // 텍스트를 기반으로 하므로 이미 내용상 매칭되어 있다.
  const shortfallPoints = points.slice(attachments.length)
  const shortfallImages =
    shortfallPoints.length > 0
      ? await resolveShortfallImages(
          shortfallPoints,
          paragraphs,
          post.title,
          post.tags,
          apiKey,
          allowAiFallback,
          placeId
        )
      : []

  const result = [...paragraphs]
  // 배열에 새 원소를 끼워넣는 대신 대상 문단 뒤에 마커를 이어붙이므로 인덱스가 밀리지 않는다.
  // 같은 문단에 마커가 여러 개 이어붙는 것도 안전하게 처리된다(비슷한 사진끼리 묶이는 효과).
  const appendImageMarker = (paragraphIndex: number, imageUrl: string) => {
    result[paragraphIndex] =
      result[paragraphIndex] +
      `\n\n[사진 원본 - 위치 유지, 절대 수정/삭제/설명 창작 금지: ${imageUrl}]`
  }

  // 대표(외관) 사진이 있으면 가장 이른 후보 문단에 강제 배치한다 — 실제 블로그 글은
  // 서두 직후 가게 외관 사진이 오는 경우가 많은데, 의미 매칭에만 맡기면 캡션이 애매한
  // 외관 사진이 본문 중간/끝으로 밀리는 경우가 실측으로 확인됐다. 나머지 사진의 의미
  // 매칭과는 독립적으로, 이 사진만 위치를 직접 지정한다.
  const leadAttachment = leadImageUrl
    ? attachments.find((a) => a.url === leadImageUrl)
    : undefined
  if (leadAttachment && candidates.length > 0) {
    appendImageMarker(candidates[0], leadAttachment.url)
  }
  const matchableAttachments = leadAttachment
    ? attachments.filter((a) => a.url !== leadAttachment.url)
    : attachments

  // 나머지 첨부 사진은 위치 순서가 아니라 사진 내용과 문단 내용의 키워드 겹침으로
  // 배치한다 — 균등 간격 배치는 "우니초밥을 얘기하는 문단에 엉뚱한 사진이 붙는" 사고의
  // 원인이었다. 비슷한 캡션의 사진들은 같은 문단으로 몰려 자연히 인접 배치(그룹핑)된다.
  // 매칭이 실패해도(캡션 생성 실패, 겹치는 키워드 없음 등) 첨부 사진은 반드시 결과에
  // 포함해야 하므로(전부 포함 불변식), 균등 배치로 골라둔 points를 폴백 위치로 쓴다.
  if (matchableAttachments.length > 0) {
    const captions = await Promise.all(
      matchableAttachments.map((a) => describeImage(apiKey, a.url, a.label))
    )
    const candidateParagraphs = candidates.map((index) => ({ index, text: paragraphs[index] }))

    const matchedIndexes = matchImagesToParagraphs(
      captions.map((caption) => ({ caption })),
      candidateParagraphs
    )

    matchableAttachments.forEach((attachment, i) => {
      const paragraphIndex = matchedIndexes[i] ?? points[i % points.length]
      appendImageMarker(paragraphIndex, attachment.url)
    })
  }

  shortfallPoints.forEach((pointIndex, k) => {
    const imageUrl = shortfallImages[k]
    if (!imageUrl) return
    appendImageMarker(pointIndex, imageUrl)
  })

  return result.join("\n\n")
}

/**
 * LLM(Gemini)을 이용한 네이버 블로그 스타일 초안 생성
 * leadImageUrl: 대표(외관) 사진으로 판별된 첨부 이미지 URL이 있으면, 본문 최상단
 * 이미지 자리에 강제로 배치한다(thumbnail.ts의 resolveThumbnailUrl 결과를 그대로 전달).
 */
export async function generateNaverDraft(
  post: Post,
  styleGuide?: string,
  leadImageUrl?: string
): Promise<string> {
  const apiKey = process.env.LLM_API_KEY
  if (!apiKey) {
    throw new Error("LLM_API_KEY가 설정되지 않았습니다.")
  }

  const verifiedPlaceInfoText = await buildVerifiedPlaceInfoText(apiKey, post.contentAttachments ?? [])

  const ai = new GoogleGenAI({ apiKey })
  const contents = buildUserMessage(post, verifiedPlaceInfoText)
  const config = {
    systemInstruction: buildSystemPrompt(styleGuide, post.category),
    httpOptions: { timeout: TIMEOUT_MS },
    tools: [{ urlContext: {} }],
  }

  let lastError: unknown
  for (const model of MODEL_FALLBACK_CHAIN) {
    try {
      const response = await withRetry(() =>
        ai.models.generateContent({ model, contents, config })
      )

      if (!response.text) {
        throw new Error("LLM 응답에서 텍스트를 추출할 수 없습니다.")
      }

      return await insertImages(response.text, apiKey, post, leadImageUrl)
    } catch (error) {
      if (!shouldTryNextModel(error)) throw error
      console.warn(`[llm] ${model} 사용 불가(할당량 소진/미지원) — 다음 모델로 전환`, error)
      lastError = error
    }
  }

  throw lastError
}
