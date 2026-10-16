import { useCallback, useEffect, useRef, useState } from "react"

export const RecorderStatus = {
  idle: "idle",
  selecting: "selecting",
  recording: "recording",
  stopped: "stopped",
  error: "error",
} as const

export type RecorderStatus = (typeof RecorderStatus)[keyof typeof RecorderStatus]

export type AudioChunk = {
  readonly blob: Blob
  readonly elapsedSeconds: number
}

type TabAudioRecorderOptions = {
  readonly chunkMilliseconds: number
  readonly onChunk: (chunk: AudioChunk) => Promise<void>
}

type TabAudioRecorder = {
  readonly status: RecorderStatus
  readonly errorMessage: string | null
  readonly pendingChunks: number
  readonly startRecording: () => Promise<void>
  readonly stopRecording: () => Promise<void>
}

type ChromeDisplayMediaStreamOptions = DisplayMediaStreamOptions & {
  readonly selfBrowserSurface?: "exclude" | "include"
}

const AUDIO_MIME_TYPE = "audio/webm;codecs=opus"
const NO_AUDIO_MESSAGE =
  "오디오가 감지되지 않았습니다. Chrome 탭을 선택하고 '탭 오디오 공유'를 활성화해주세요."

function getCaptureErrorMessage(error: unknown): string {
  if (error instanceof DOMException && error.name === "NotAllowedError") {
    return "탭 선택이 취소되었습니다."
  }

  if (error instanceof Error) {
    console.error("Tab audio capture failed", error)
  } else {
    console.error("Tab audio capture failed with an unknown error", error)
  }
  return "탭 오디오 캡처를 시작할 수 없습니다. Chrome 탭을 선택한 뒤 다시 시도해주세요."
}

export function useTabAudioRecorder({
  chunkMilliseconds,
  onChunk,
}: TabAudioRecorderOptions): TabAudioRecorder {
  const [status, setStatus] = useState<RecorderStatus>(RecorderStatus.idle)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [pendingChunks, setPendingChunks] = useState(0)
  const captureStreamRef = useRef<MediaStream | null>(null)
  const recorderRef = useRef<MediaRecorder | null>(null)
  const segmentTimerRef = useRef<number | null>(null)
  const shouldContinueRef = useRef(false)
  const queueRef = useRef<Promise<void>>(Promise.resolve())
  const startedAtRef = useRef(0)
  const statusRef = useRef<RecorderStatus>(RecorderStatus.idle)
  const onChunkRef = useRef(onChunk)

  useEffect(() => {
    onChunkRef.current = onChunk
  }, [onChunk])

  const updateStatus = useCallback((nextStatus: RecorderStatus): void => {
    statusRef.current = nextStatus
    setStatus(nextStatus)
  }, [])

  const releaseCapture = useCallback((): void => {
    if (segmentTimerRef.current !== null) {
      window.clearTimeout(segmentTimerRef.current)
      segmentTimerRef.current = null
    }
    shouldContinueRef.current = false
    captureStreamRef.current?.getTracks().forEach((track) => track.stop())
    captureStreamRef.current = null
    recorderRef.current = null
  }, [])

  const enqueueChunk = useCallback(
    (blob: Blob): void => {
      if (blob.size === 0) {
        return
      }

      const elapsedSeconds = (Date.now() - startedAtRef.current) / 1000
      setPendingChunks((count) => count + 1)
      const nextRequest = queueRef.current.then(() =>
        onChunkRef.current({ blob, elapsedSeconds }),
      )

      queueRef.current = nextRequest.catch((error: unknown) => {
        const message =
          error instanceof Error ? error.message : "오디오 전사 중 오류가 발생했습니다."
        console.error("Chunk transcription failed", error)
        setErrorMessage(message)
        updateStatus(RecorderStatus.error)
      })
      void nextRequest.finally(() => {
        setPendingChunks((count) => Math.max(0, count - 1))
      })
    },
    [updateStatus],
  )

  const stopRecording = useCallback(async (): Promise<void> => {
    const recorder = recorderRef.current
    const hasActiveCapture = recorder?.state === "recording" || captureStreamRef.current !== null
    if (!hasActiveCapture) {
      return
    }

    shouldContinueRef.current = false
    if (segmentTimerRef.current !== null) {
      window.clearTimeout(segmentTimerRef.current)
      segmentTimerRef.current = null
    }

    if (recorder?.state === "recording") {
      await new Promise<void>((resolve) => {
        recorder.addEventListener("stop", () => resolve(), { once: true })
        recorder.stop()
      })
    }

    await queueRef.current
    releaseCapture()
    if (statusRef.current !== RecorderStatus.error) {
      updateStatus(RecorderStatus.stopped)
    }
  }, [releaseCapture, updateStatus])

  const startRecording = useCallback(async (): Promise<void> => {
    if (
      statusRef.current === RecorderStatus.selecting ||
      recorderRef.current?.state === "recording"
    ) {
      return
    }

    if (!MediaRecorder.isTypeSupported(AUDIO_MIME_TYPE)) {
      setErrorMessage("이 브라우저는 WebM Opus 녹음을 지원하지 않습니다. 최신 Chrome을 사용해주세요.")
      updateStatus(RecorderStatus.error)
      return
    }

    setErrorMessage(null)
    setPendingChunks(0)
    queueRef.current = Promise.resolve()
    updateStatus(RecorderStatus.selecting)

    const preferredOptions: ChromeDisplayMediaStreamOptions = {
      video: { displaySurface: "browser" },
      audio: true,
      selfBrowserSurface: "exclude",
    }

    let captureStream: MediaStream
    try {
      captureStream = await navigator.mediaDevices.getDisplayMedia(preferredOptions)
    } catch (firstError: unknown) {
      if (!(firstError instanceof DOMException && firstError.name === "TypeError")) {
        setErrorMessage(getCaptureErrorMessage(firstError))
        updateStatus(RecorderStatus.error)
        return
      }

      try {
        captureStream = await navigator.mediaDevices.getDisplayMedia({
          video: true,
          audio: true,
        })
      } catch (fallbackError: unknown) {
        setErrorMessage(getCaptureErrorMessage(fallbackError))
        updateStatus(RecorderStatus.error)
        return
      }
    }

    const [audioTrack] = captureStream.getAudioTracks()
    if (audioTrack === undefined) {
      captureStream.getTracks().forEach((track) => track.stop())
      setErrorMessage(NO_AUDIO_MESSAGE)
      updateStatus(RecorderStatus.error)
      return
    }

    const audioStream = new MediaStream([audioTrack])
    captureStreamRef.current = captureStream
    startedAtRef.current = Date.now()
    audioTrack.addEventListener("ended", () => {
      void stopRecording()
    })

    shouldContinueRef.current = true
    const startSegment = (): void => {
      if (!shouldContinueRef.current) {
        return
      }

      // A new recorder per segment produces a complete WebM, not a cluster fragment.
      const recorder = new MediaRecorder(audioStream, { mimeType: AUDIO_MIME_TYPE })
      recorderRef.current = recorder
      recorder.addEventListener("dataavailable", (event) => enqueueChunk(event.data))
      recorder.addEventListener("error", (event) => {
        console.error("MediaRecorder failed", event.error)
        shouldContinueRef.current = false
        setErrorMessage("탭 오디오 녹음 중 오류가 발생했습니다.")
        updateStatus(RecorderStatus.error)
      })
      recorder.addEventListener("stop", () => {
        segmentTimerRef.current = null
        if (shouldContinueRef.current) {
          startSegment()
        }
      })
      recorder.start()
      segmentTimerRef.current = window.setTimeout(() => {
        if (recorder.state === "recording") {
          recorder.stop()
        }
      }, chunkMilliseconds)
    }

    startSegment()
    updateStatus(RecorderStatus.recording)
  }, [chunkMilliseconds, enqueueChunk, stopRecording, updateStatus])

  useEffect(() => {
    return () => {
      void stopRecording()
    }
  }, [stopRecording])

  return {
    status,
    errorMessage,
    pendingChunks,
    startRecording,
    stopRecording,
  }
}
