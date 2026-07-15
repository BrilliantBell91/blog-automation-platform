"use client"

import { useState } from "react"
import Image from "next/image"

type OptimizedImageVariant = "thumbnail" | "detail" | "body"

interface OptimizedImageProps {
  src: string
  alt: string
  variant: OptimizedImageVariant
  blockId?: string
  pageId?: string
  // 만료 시 재조회 방식을 명시. 미지정 시 blockId 유무로 "block"/"cover"를 추론(기존 동작 유지).
  // "property": 본문에 이미지가 없어 Notion "Image" 속성으로 폴백한 썸네일(pageId 필요).
  refreshKind?: "block" | "cover" | "property"
  preload?: boolean
  className?: string
}

const PRESET = {
  thumbnail: {
    sizes: "(min-width: 1024px) 33vw, (min-width: 768px) 50vw, 100vw",
    quality: 75,
  },
  detail: {
    sizes: "(min-width: 768px) 768px, 100vw",
    quality: 85,
  },
  body: {
    sizes: "(min-width: 1024px) 800px, (min-width: 768px) 600px, 100vw",
    quality: 85,
  },
} as const

export function OptimizedImage({
  src,
  alt,
  variant,
  blockId,
  pageId,
  refreshKind,
  preload = false,
  className,
}: OptimizedImageProps) {
  const [currentSrc, setCurrentSrc] = useState(src)
  const [hasRetried, setHasRetried] = useState(false)
  const [failed, setFailed] = useState(false)

  const { sizes, quality } = PRESET[variant]

  const handleError = async () => {
    const id = blockId ?? pageId
    if (hasRetried || !id) {
      setFailed(true)
      return
    }

    try {
      // refreshKind가 명시되면 그대로 따르고, 없으면 기존처럼 blockId 유무로 추론한다.
      const kind = refreshKind ?? (blockId ? "block" : "cover")
      const idParam = kind === "block" ? `blockId=${id}` : `pageId=${id}&kind=${kind}`

      const res = await fetch(`/api/images/refresh?${idParam}`)
      if (!res.ok) {
        setFailed(true)
        return
      }

      const data = await res.json()
      if (data.url) {
        setCurrentSrc(data.url)
      }
    } catch (error) {
      console.error("이미지 재조회 실패:", error)
    }

    setHasRetried(true)
  }

  if (failed) {
    return (
      <div
        className={`flex h-full w-full items-center justify-center bg-muted text-sm text-muted-foreground ${
          className || ""
        }`}
      >
        이미지를 불러올 수 없습니다
      </div>
    )
  }

  return (
    <Image
      src={currentSrc}
      alt={alt}
      fill
      priority={preload}
      sizes={sizes}
      quality={quality}
      placeholder="empty"
      className={className}
      onError={handleError}
    />
  )
}
