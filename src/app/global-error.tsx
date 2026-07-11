"use client"

import { useEffect } from "react"

interface GlobalErrorProps {
  error: Error & { digest?: string }
  reset: () => void
}

export default function GlobalError({ error, reset }: GlobalErrorProps) {
  useEffect(() => {
    console.error("[Global Error]", error)
  }, [error])

  return (
    <html>
      <body>
        <div style={{
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          minHeight: "100vh",
          backgroundColor: "#f5f5f5",
          fontFamily: "system-ui, -apple-system, sans-serif",
        }}>
          <div style={{
            textAlign: "center",
            padding: "20px",
            maxWidth: "500px",
          }}>
            <h1 style={{
              fontSize: "48px",
              fontWeight: "bold",
              margin: "0 0 10px 0",
            }}>
              오류
            </h1>
            <p style={{
              fontSize: "18px",
              color: "#666",
              margin: "0 0 20px 0",
            }}>
              치명적 오류가 발생했습니다
            </p>
            <p style={{
              fontSize: "14px",
              color: "#999",
              marginBottom: "30px",
            }}>
              페이지를 불러오는 중에 예기치 않은 오류가 발생했습니다.
            </p>
            <button
              onClick={reset}
              style={{
                padding: "10px 20px",
                backgroundColor: "#000",
                color: "#fff",
                border: "none",
                borderRadius: "4px",
                cursor: "pointer",
                fontSize: "14px",
              }}
            >
              다시 시도
            </button>
          </div>
        </div>
      </body>
    </html>
  )
}
