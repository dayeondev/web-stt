export type TranscriptionResult = {
  readonly text: string
  readonly duration: number
}

export class TranscriptionApiError extends Error {
  public constructor(message: string) {
    super(message)
    this.name = "TranscriptionApiError"
  }
}

const API_BASE_URL = import.meta.env["VITE_API_BASE_URL"] ?? "http://localhost:8000"

function isTranscriptionResult(payload: unknown): payload is TranscriptionResult {
  return (
    typeof payload === "object" &&
    payload !== null &&
    "text" in payload &&
    typeof payload.text === "string" &&
    "duration" in payload &&
    typeof payload.duration === "number"
  )
}

export async function transcribeAudioChunk(audio: Blob): Promise<TranscriptionResult> {
  const formData = new FormData()
  formData.append("audio", audio, "zoom-tab-audio.webm")

  let response: Response
  try {
    response = await fetch(`${API_BASE_URL}/api/transcribe`, {
      method: "POST",
      body: formData,
    })
  } catch (error: unknown) {
    console.error("Unable to reach transcription server", error)
    throw new TranscriptionApiError(
      "전사 서버에 연결할 수 없습니다. FastAPI 서버가 실행 중인지 확인해주세요.",
    )
  }

  if (!response.ok) {
    console.error("Transcription request failed", response.status, await response.text())
    throw new TranscriptionApiError("오디오 전사 중 오류가 발생했습니다.")
  }

  const payload: unknown = await response.json()
  if (!isTranscriptionResult(payload)) {
    console.error("Unexpected transcription response", payload)
    throw new TranscriptionApiError("오디오 전사 중 오류가 발생했습니다.")
  }

  return payload
}
