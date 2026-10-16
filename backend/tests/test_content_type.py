"""Regression tests for Chrome MediaRecorder upload metadata."""

import unittest

from app.main import is_supported_webm_content_type


class WebMContentTypeTests(unittest.TestCase):
    """Keep MediaRecorder's codec parameter from being rejected."""

    def test_accepts_webm_with_opus_codec_parameter(self) -> None:
        self.assertTrue(is_supported_webm_content_type("audio/webm;codecs=opus"))

    def test_rejects_non_webm_audio(self) -> None:
        self.assertFalse(is_supported_webm_content_type("audio/wav"))
