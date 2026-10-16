# Zoom Web Local Transcript

Chrome에서 재생되는 **Zoom Web 미팅 탭의 상대방 음성**을 캡처하여, 이 Mac에서 실행되는
MLX Whisper로 한국어 전사하는 로컬 MVP입니다. Zoom API, 계정 로그인, 클라우드 STT,
요약, 화자 분리, 마이크 믹싱은 사용하지 않습니다.

## 지원 환경

- macOS Apple Silicon
- Python 3.11 이상
- Node.js 20 이상
- 최신 Chrome
- Zoom **Web** 미팅 탭

Zoom 데스크톱 앱의 오디오는 이 앱의 브라우저 탭 캡처 방식으로 지원하지 않습니다.

## 구조

```text
.
├── frontend/                 # Vite + React + TypeScript
│   └── src/hooks/useTabAudioRecorder.ts
├── backend/                  # FastAPI + mlx-whisper
│   └── app/services/transcriber.py
├── DESIGN.md                 # 화면 토큰과 접근성 규칙
└── README.md
```

프론트엔드는 `getDisplayMedia()`로 Chrome 탭을 선택하고, `MediaRecorder`가 만든
WebM/Opus chunk를 **직렬 큐**로 전송합니다. 백엔드는 각 요청을 임시 WebM 파일에
저장해 MLX Whisper로 전사한 뒤, 성공/실패와 관계없이 해당 파일을 삭제합니다.
`mlx_whisper.transcribe()`는 내부 `ModelHolder` 캐시를 사용하므로 첫 전사에서 모델을
로드하고 이후 동일 모델 요청에는 불필요하게 다시 초기화하지 않습니다.

## 설치

### 1. 백엔드

```bash
cd backend
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
brew install ffmpeg
cp .env.example .env
uvicorn app.main:app --reload --port 8000
```

처음 전사할 때 Whisper 모델 다운로드와 로드 시간이 필요합니다. 기본 모델은
`mlx-community/whisper-large-v3-turbo`이며, `backend/.env`에서 변경할 수 있습니다.
`mlx-whisper`는 Chrome WebM/Opus chunk를 디코딩할 때 시스템 `ffmpeg`를 사용하므로,
`ffmpeg -version`으로 설치를 확인하세요.

```env
WHISPER_MODEL=mlx-community/whisper-large-v3-turbo
WHISPER_LANGUAGE=ko
FRONTEND_ORIGIN=http://localhost:5173
```

`FRONTEND_ORIGIN`만 CORS 허용 목록에 추가됩니다. 와일드카드 Origin은 사용하지 않습니다.

### 2. 프론트엔드

새 터미널에서 실행합니다.

```bash
cd frontend
npm install
cp .env.example .env.local
npm run dev
```

브라우저에서 `http://localhost:5173`을 엽니다. 환경변수로 API 주소와 녹음 chunk
길이를 바꿀 수 있습니다.

```env
VITE_API_BASE_URL=http://localhost:8000
VITE_AUDIO_CHUNK_SECONDS=20
```

## 사용 방법

1. Chrome에서 Zoom Web 미팅을 엽니다. Zoom 데스크톱 앱은 대상이 아닙니다.
2. 전사 앱에서 **전사 시작**을 누릅니다.
3. Chrome 화면 공유 선택 창에서 **Chrome 탭**을 선택합니다.
4. Zoom Web 미팅이 열려 있는 탭을 선택합니다.
5. 반드시 **탭 오디오 공유**를 활성화한 뒤 공유를 시작합니다.
6. 앱은 기본 20초마다 WebM/Opus 오디오를 로컬 FastAPI 서버에 보내고, 결과를
   `[00:00:20] 전사 텍스트` 형태로 누적합니다.
7. **전사 중지**를 누르면 마지막 chunk를 전송하고 큐 완료 후 모든 캡처 track을 정리합니다.
8. **TXT 다운로드**는 UTF-8 `zoom-transcript-YYYY-MM-DD-HHmm.txt` 파일을 저장합니다.

전사 내용은 변경될 때마다 브라우저 `localStorage`에 자동 저장되며, 새로고침 후
자동으로 복원됩니다. **내용 지우기**는 화면과 저장된 복원 내용을 함께 비웁니다.

## 수동 검증 절차

실제 Chrome 권한 창, Zoom Web 오디오, MLX 모델 추론은 자동화하지 않습니다. 다음을
실제 환경에서 확인하세요.

1. 백엔드와 프론트엔드를 각각 실행합니다.
2. **전사 시작**을 눌러 Chrome의 화면 공유 선택 창이 열리는지 확인합니다.
3. 일반 창/전체 화면이 아니라 Chrome 탭의 Zoom Web 미팅을 선택합니다.
4. `탭 오디오 공유`를 끈 채 시작해
   `오디오가 감지되지 않았습니다. Chrome 탭을 선택하고 '탭 오디오 공유'를 활성화해주세요.`
   안내가 나타나는지 확인합니다.
5. Zoom 상대방 음성이 재생된 상태로 20초 이상 기다린 뒤, FastAPI 로그에 요청이 오고
   화면에 한국어 결과가 시간순으로 누적되는지 확인합니다.
6. 두 개 이상의 chunk가 완료된 뒤에도 결과가 업로드 순서대로 표시되는지 확인합니다.
7. 전사 중지를 눌러 마지막 짧은 chunk까지 처리한 뒤 캡처가 종료되는지 확인합니다.
8. TXT 다운로드 파일의 이름, UTF-8 한글, 누적 내용이 올바른지 확인합니다.
9. 새로고침 후 기존 결과가 복원되는지 확인합니다.

## 문제 해결

| 증상 | 확인 방법 |
|---|---|
| `탭 선택이 취소되었습니다.` | Chrome 선택 창을 취소했거나 권한을 거부했습니다. 전사 시작을 다시 누르세요. |
| 오디오가 감지되지 않음 | Zoom이 열린 **Chrome 탭**을 골랐는지와 `탭 오디오 공유` 체크를 확인하세요. 데스크톱 Zoom은 지원하지 않습니다. |
| 전사 서버 연결 실패 | `http://localhost:8000/api/health`가 `{"status":"ok"}`를 반환하는지와 `VITE_API_BASE_URL`을 확인하세요. |
| 전사 오류 | 백엔드 터미널의 MLX Whisper 오류를 확인하세요. 첫 요청에서는 모델 다운로드/로드가 필요하며, Apple Silicon 환경인지 확인하세요. |
| 화면 공유 목록에 탭이 없음 | 최신 Chrome에서 Zoom Web 미팅을 먼저 열고, 앱이 아닌 탭 선택 화면인지 확인하세요. |
| 결과가 비어 있음 | 선택한 탭에서 실제 원격 참가자 음성이 재생되는지, 브라우저 탭이 음소거되지 않았는지 확인하세요. |

## 개인정보 및 동의

오디오와 전사 결과는 외부 STT API로 전송되지 않습니다. 다만 브라우저는 선택한 탭의
오디오를 로컬 FastAPI 서버로 전달하고, 전사 텍스트는 해당 브라우저의 `localStorage`에
남습니다. 회의 참가자에게 녹음과 전사 사실을 고지하고 필요한 동의를 받은 뒤 사용하세요.
조직 정책, 지역 법령, Zoom 회의 규칙을 준수할 책임은 사용자에게 있습니다.

## 현재 제한사항

- Zoom Web 탭에서 재생되는 오디오만 지원합니다.
- 화자 구분, 화자 이름, 번역, 요약, 회의록, action item, PDF/RAG/Vector DB는 포함하지 않습니다.
- 마이크를 섞지 않으므로 사용자 자신의 발화는 전사 대상이 아닙니다.
- chunk 경계에서 문장이 나뉠 수 있으며, 실시간 스트리밍 STT가 아닌 chunk 업로드 방식입니다.
- 브라우저는 탭 선택과 탭 오디오 공유를 강제할 수 없으므로 사용자가 올바르게 선택해야 합니다.

## 검증 명령

```bash
cd frontend
npm install
npm run build
```

```bash
cd backend
python -m compileall app
```
