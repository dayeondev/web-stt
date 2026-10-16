"""Local MLX Whisper transcription service."""

from dataclasses import dataclass
from pathlib import Path
from typing import NotRequired, TypedDict

from mlx_whisper import transcribe

from app.config import Settings


class WhisperSegment(TypedDict):
    """The fields used from an MLX Whisper segment."""

    end: float


class WhisperResult(TypedDict):
    """The fields used from the MLX Whisper response."""

    text: str
    segments: NotRequired[list[WhisperSegment]]


@dataclass(frozen=True, slots=True)
class Transcription:
    """Normalized transcript returned to the HTTP boundary."""

    text: str
    duration: float


class TranscriptionFailedError(RuntimeError):
    """Raised when local Whisper cannot transcribe an uploaded chunk."""


class Transcriber:
    """Transcribe files with mlx-whisper's built-in per-model cache."""

    def __init__(self, settings: Settings) -> None:
        self._model = settings.whisper_model
        self._language = settings.whisper_language

    def transcribe_file(self, audio_path: Path) -> Transcription:
        """Run local Whisper and normalize the result for the API."""
        try:
            result: WhisperResult = transcribe(
                str(audio_path),
                path_or_hf_repo=self._model,
                language=self._language,
                task="transcribe",
                verbose=None,
            )
        except (OSError, RuntimeError, ValueError) as error:
            raise TranscriptionFailedError("MLX Whisper transcription failed") from error

        segments = result.get("segments", [])
        duration = max((segment["end"] for segment in segments), default=0.0)
        return Transcription(text=result["text"].strip(), duration=round(duration, 1))
