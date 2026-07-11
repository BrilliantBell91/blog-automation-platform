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
  preload = false,
  className,
}: OptimizedImageProps) {
  const [currentSrc, setCurrentSrc] = useState(src)
  const [hasRetried, setHasRetried] = useState(false)
  const [failed, setFailed] = useState(false)

  const { sizes, quality } = PRESET[variant]

  const handleError = async () => {
    if (hasRetried || !blockId) {
      setFailed(true)
      return
    }

    try {
      const id = blockId ?? pageId
      const kind = blockId ? "block" : "cover"

      if (!id) {
        setFailed(true)
        return
      }

      const res = await fetch(`/api/images/refresh?${kind}Id=${id}`)
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
