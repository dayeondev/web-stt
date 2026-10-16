"""FastAPI entry point for local Zoom Web audio transcription."""

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
import logging
from pathlib import Path
from tempfile import NamedTemporaryFile

from fastapi import FastAPI, File, HTTPException, UploadFile, status
from fastapi.concurrency import run_in_threadpool
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, ConfigDict

from app.config import get_settings
from app.services.transcriber import Transcriber, TranscriptionFailedError

logger = logging.getLogger(__name__)


def is_supported_webm_content_type(content_type: str | None) -> bool:
    """Accept WebM uploads even when MediaRecorder adds codec parameters."""
    media_type = (content_type or "").partition(";")[0].strip().lower()
    return media_type in {"audio/webm", "video/webm"}


class TranscriptionResponse(BaseModel):
    """The text and observed speech duration for one uploaded audio chunk."""

    model_config = ConfigDict(frozen=True)

    text: str
    duration: float


@asynccontextmanager
async def lifespan(_: FastAPI) -> AsyncIterator[None]:
    """Keep startup lightweight; mlx-whisper loads and caches on first use."""
    yield


def create_app() -> FastAPI:
    """Create the configured local-only transcription API."""
    settings = get_settings()
    application = FastAPI(
        title="Zoom Web Local Transcription API",
        version="0.1.0",
        lifespan=lifespan,
    )
    application.add_middleware(
        CORSMiddleware,
        allow_origins=[settings.frontend_origin],
        allow_credentials=False,
        allow_methods=["POST"],
        allow_headers=["Content-Type"],
    )
    transcriber = Transcriber(settings)

    @application.get("/api/health")
    async def health() -> dict[str, str]:
        """Expose a lightweight local readiness probe."""
        return {"status": "ok"}

    @application.post(
        "/api/transcribe",
        response_model=TranscriptionResponse,
        response_model_exclude_none=True,
    )
    async def transcribe_audio(
        audio: UploadFile = File(..., description="A Chrome MediaRecorder WebM chunk"),
    ) -> TranscriptionResponse:
        """Persist one WebM chunk temporarily, transcribe it, and always delete it."""
        if not is_supported_webm_content_type(audio.content_type):
            raise HTTPException(
                status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
                detail="audio 필드는 WebM 오디오 파일이어야 합니다.",
            )

        temp_path: Path | None = None
        try:
            with NamedTemporaryFile(suffix=".webm", delete=False) as temporary_file:
                temp_path = Path(temporary_file.name)
                temporary_file.write(await audio.read())

            transcription = await run_in_threadpool(transcriber.transcribe_file, temp_path)
            return TranscriptionResponse(
                text=transcription.text,
                duration=transcription.duration,
            )
        except TranscriptionFailedError as error:
            logger.exception("Whisper failed for an uploaded audio chunk")
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="오디오 전사 중 오류가 발생했습니다.",
            ) from error
        finally:
            await audio.close()
            if temp_path is not None:
                temp_path.unlink(missing_ok=True)

    return application


app = create_app()
