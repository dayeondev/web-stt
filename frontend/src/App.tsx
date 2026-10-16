import { useCallback, useEffect, useMemo, useState } from "react"

import {
  RecorderStatus,
  useTabAudioRecorder,
  type AudioChunk,
} from "./hooks/useTabAudioRecorder"
import { transcribeAudioChunk } from "./services/transcriptionApi"
import { downloadTranscript } from "./utils/download"
import { formatElapsedTime } from "./utils/timestamp"

const TRANSCRIPT_STORAGE_KEY = "zoom-web-local-transcript"
const configuredChunkSeconds = Number.parseInt(
  import.meta.env["VITE_AUDIO_CHUNK_SECONDS"] ?? "20",
  10,
)
const CHUNK_SECONDS =
  Number.isFinite(configuredChunkSeconds) && configuredChunkSeconds > 0
    ? configuredChunkSeconds
    : 20

type TranscriptEntry = {
  readonly timestamp: string
  readonly text: string
}

type StatusCopy = {
  readonly label: string
  readonly message: string
}

const statusCopy: Record<RecorderStatus, StatusCopy> = {
  [RecorderStatus.idle]: {
    label: "대기",
    message: "전사를 시작하면 Chrome 탭 선택 창이 열립니다.",
  },
  [RecorderStatus.selecting]: {
    label: "탭 선택 중",
    message: "Chrome 탭에서 Zoom Web 탭을 선택하고 탭 오디오를 공유해주세요.",
  },
  [RecorderStatus.recording]: {
    label: "전사 중",
    message: `${CHUNK_SECONDS}초 단위로 로컬 Whisper에 전송합니다.`,
  },
  [RecorderStatus.stopped]: {
    label: "중지됨",
    message: "캡처와 업로드 큐가 안전하게 종료되었습니다.",
  },
  [RecorderStatus.error]: {
    label: "오류",
    message: "아래 안내를 확인한 뒤 다시 시도해주세요.",
  },
}

function restoreTranscript(): readonly TranscriptEntry[] {
  const storedTranscript = window.localStorage.getItem(TRANSCRIPT_STORAGE_KEY)
  if (storedTranscript === null) {
    return []
  }

  try {
    const parsed: unknown = JSON.parse(storedTranscript)
    if (!Array.isArray(parsed)) {
      return []
    }

    return parsed.filter(
      (entry): entry is TranscriptEntry =>
        typeof entry === "object" &&
        entry !== null &&
        "timestamp" in entry &&
        typeof entry.timestamp === "string" &&
        "text" in entry &&
        typeof entry.text === "string",
    )
  } catch (error: unknown) {
    console.error("Unable to restore saved transcript", error)
    return []
  }
}

export function App(): React.JSX.Element {
  const [entries, setEntries] = useState<readonly TranscriptEntry[]>(restoreTranscript)

  const handleChunk = useCallback(async ({ blob, elapsedSeconds }: AudioChunk): Promise<void> => {
    const result = await transcribeAudioChunk(blob)
    if (result.text === "") {
      return
    }

    setEntries((currentEntries) => [
      ...currentEntries,
      {
        timestamp: formatElapsedTime(elapsedSeconds),
        text: result.text,
      },
    ])
  }, [])

  const recorder = useTabAudioRecorder({
    chunkMilliseconds: CHUNK_SECONDS * 1000,
    onChunk: handleChunk,
  })

  useEffect(() => {
    window.localStorage.setItem(TRANSCRIPT_STORAGE_KEY, JSON.stringify(entries))
  }, [entries])

  const transcriptText = useMemo(
    () => entries.map((entry) => `[${entry.timestamp}] ${entry.text}`).join("\n\n"),
    [entries],
  )
  const canStart =
    recorder.status !== RecorderStatus.selecting && recorder.status !== RecorderStatus.recording
  const canStop =
    recorder.status === RecorderStatus.recording ||
    recorder.status === RecorderStatus.error ||
    recorder.pendingChunks > 0

  return (
    <main className="app-shell">
      <section className="workspace" aria-labelledby="page-title">
        <header className="page-header">
          <p className="eyebrow">Local-only transcription</p>
          <h1 id="page-title">Zoom Web 탭 전사</h1>
          <p className="lead">
            Chrome에서 Zoom Web 탭을 선택하고 <strong>탭 오디오 공유</strong>를 켜면,
            오디오를 이 Mac의 Whisper로 전사합니다.
          </p>
        </header>

        <section className="control-panel" aria-label="전사 제어">
          <div className={`status-strip status-${recorder.status}`} role="status" aria-live="polite">
            <div>
              <p className="status-label">{statusCopy[recorder.status].label}</p>
              <p className="status-message">{statusCopy[recorder.status].message}</p>
            </div>
            <p className="queue-count">
              {recorder.pendingChunks === 0
                ? "처리 대기 없음"
                : `${recorder.pendingChunks}개 chunk 처리 중`}
            </p>
          </div>

          {recorder.errorMessage !== null ? (
            <p className="error-message" role="alert">
              {recorder.errorMessage}
            </p>
          ) : null}

          <p className="capture-note">
            화면 공유 창에서 일반 창이나 전체 화면 대신 <strong>Chrome 탭</strong>을 선택하세요.
          </p>

          <div className="actions">
            <button className="button button-primary" type="button" disabled={!canStart} onClick={() => void recorder.startRecording()}>
              전사 시작
            </button>
            <button className="button button-danger" type="button" disabled={!canStop} onClick={() => void recorder.stopRecording()}>
              전사 중지
            </button>
            <button className="button button-secondary" type="button" disabled={entries.length === 0} onClick={() => setEntries([])}>
              내용 지우기
            </button>
            <button className="button button-secondary" type="button" disabled={entries.length === 0} onClick={() => downloadTranscript(transcriptText)}>
              TXT 다운로드
            </button>
          </div>
        </section>

        <section className="transcript-paper" aria-labelledby="transcript-title">
          <div className="transcript-heading">
            <div>
              <p className="eyebrow">Transcript</p>
              <h2 id="transcript-title">누적 전사 결과</h2>
            </div>
            <p>{entries.length}개 항목</p>
          </div>

          {entries.length === 0 ? (
            <p className="empty-transcript">
              아직 전사 내용이 없습니다. 전사를 시작한 뒤 첫 번째 오디오 chunk가 처리되면 여기에
              표시됩니다.
            </p>
          ) : (
            <div className="transcript-content">
              {entries.map((entry, index) => (
                <p key={`${entry.timestamp}-${index}`}>
                  <time dateTime={`PT${entry.timestamp.replaceAll(":", "H")}S`}>
                    [{entry.timestamp}]
                  </time>{" "}
                  {entry.text}
                </p>
              ))}
            </div>
          )}
        </section>
      </section>
    </main>
  )
}
