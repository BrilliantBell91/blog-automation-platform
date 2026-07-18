"use client"

import { useRef, useState } from "react"
import { toast } from "sonner"
import { UploadCloud, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

interface NotionImageUploaderProps {
  notionPageId: string
}

export function NotionImageUploader({ notionPageId }: NotionImageUploaderProps) {
  const [files, setFiles] = useState<File[]>([])
  const [isDragging, setIsDragging] = useState(false)
  const [isUploading, setIsUploading] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  function addFiles(list: FileList | null) {
    if (!list) return
    const images = Array.from(list).filter((f) => f.type.startsWith("image/"))
    if (images.length < list.length) {
      toast.warning("이미지 파일만 추가됩니다")
    }
    setFiles((prev) => [...prev, ...images])
  }

  function removeFile(index: number) {
    setFiles((prev) => prev.filter((_, i) => i !== index))
  }

  async function handleUpload() {
    if (files.length === 0) return
    setIsUploading(true)
    try {
      const formData = new FormData()
      formData.set("notionPageId", notionPageId)
      files.forEach((file) => formData.append("files", file))

      const res = await fetch("/api/admin/notion/uploads", {
        method: "POST",
        body: formData,
      })
      const data = await res.json()
      if (!res.ok) {
        throw new Error(data.error ?? "업로드에 실패했습니다")
      }
      toast.success(`사진 ${data.uploaded}장을 Notion 페이지에 추가했습니다`)
      setFiles([])
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "업로드에 실패했습니다")
    } finally {
      setIsUploading(false)
    }
  }

  return (
    <div className="space-y-4">
      <div
        role="button"
        tabIndex={0}
        onClick={() => inputRef.current?.click()}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") inputRef.current?.click()
        }}
        onDragOver={(e) => {
          e.preventDefault()
          setIsDragging(true)
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={(e) => {
          e.preventDefault()
          setIsDragging(false)
          addFiles(e.dataTransfer.files)
        }}
        className={cn(
          "flex min-h-40 flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed p-6 text-center transition-colors cursor-pointer",
          isDragging ? "border-primary bg-primary/5" : "border-input hover:bg-accent/50"
        )}
      >
        <UploadCloud className="h-8 w-8 text-muted-foreground" aria-hidden="true" />
        <p className="text-sm text-muted-foreground">
          여러 장의 사진을 드래그앤드롭하거나 클릭해서 선택하세요
        </p>
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={(e) => {
            addFiles(e.target.files)
            e.target.value = ""
          }}
        />
      </div>

      {files.length > 0 && (
        <ul className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {files.map((file, index) => (
            <li
              key={`${file.name}-${index}`}
              className="relative flex items-center gap-2 rounded-md border p-2 text-xs"
            >
              <span className="min-w-0 flex-1 truncate">{file.name}</span>
              <button
                type="button"
                onClick={() => removeFile(index)}
                aria-label={`${file.name} 제거`}
                className="shrink-0 rounded p-1 hover:bg-accent"
              >
                <X className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      )}

      <Button
        onClick={handleUpload}
        disabled={files.length === 0 || isUploading}
        className="h-11 w-full gap-2 sm:w-auto"
      >
        {isUploading ? "업로드 중..." : `사진 ${files.length > 0 ? files.length + "장 " : ""}업로드`}
      </Button>
    </div>
  )
}
