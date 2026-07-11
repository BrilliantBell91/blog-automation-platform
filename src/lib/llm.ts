import Anthropic from "@anthropic-ai/sdk"
import { Post } from "@/types"

const MODEL = "claude-sonnet-5"
const TIMEOUT_MS = 30_000

/**
 * 네이버 블로그 스타일 가이드 기본 시스템 프롬프트
 */
function buildSystemPrompt(styleGuide?: string): string {
  const base = `당신은 네이버 블로그에서 활동하는 인기 있는 블로거입니다. 아래 스타일 가이드를 반드시 지켜 글을 재작성하세요.

## 어투
- 친근하고 실용적: "~예요", "~네요", "~더라고요", "~했어"
- 과도한 존댓말은 피하고, 개인적 경험/감정을 자연스럽게 표현

## 구성
1. 서두: 1~2문장으로 글의 핵심 인상
2. 본문: 짧은 문단 위주로 구성 (사진별 설명이 있다면 장소→분위기→내용 순)
3. 마무리: 추천 또는 아쉬운 점, 배운 점

## 해시태그
- 카테고리에 맞는 해시태그를 글 끝에 최대 10개 이내로 추가 (예: 맛집 → #가성비 #분위기 #서울, 육아 → #육아팁 #생활용품, 결혼 → #웨딩 #신혼생활)`

  return styleGuide
    ? `${base}\n\n## 사용자 지정 스타일 가이드 (우선 적용)\n${styleGuide}`
    : base
}

/**
 * 사용자 메시지 구성
 */
function buildUserMessage(post: Post): string {
  return `다음 Notion 글을 위 스타일 가이드에 맞춰 네이버 블로그 포스팅용으로 재작성해주세요.

제목: ${post.title}
카테고리: ${post.category}
태그: ${post.tags.join(", ")}

본문:
${post.content}`
}

/**
 * LLM(Claude)을 이용한 네이버 블로그 스타일 초안 생성
 */
export async function generateNaverDraft(post: Post, styleGuide?: string): Promise<string> {
  const apiKey = process.env.LLM_API_KEY
  if (!apiKey) {
    throw new Error("LLM_API_KEY가 설정되지 않았습니다.")
  }

  const client = new Anthropic({
    apiKey,
    timeout: TIMEOUT_MS,
    maxRetries: 2,
  })

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 3000,
    system: buildSystemPrompt(styleGuide),
    messages: [
      {
        role: "user",
        content: buildUserMessage(post),
      },
    ],
  })

  const textBlock = response.content.find((b) => b.type === "text")
  if (!textBlock || textBlock.type !== "text") {
    throw new Error("LLM 응답에서 텍스트를 추출할 수 없습니다.")
  }

  return textBlock.text
}
