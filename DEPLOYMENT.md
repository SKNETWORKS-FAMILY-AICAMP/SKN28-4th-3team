# MediPill 배포 가이드

이 프로젝트는 프론트엔드를 Vercel에, Django/RAG 백엔드를 Render에 배포하는 구성을 권장합니다.

## 1. GitHub에 프로젝트 올리기

배포 전에 아래 파일/폴더가 GitHub에 포함되어야 합니다.

- `frontend/`
- `backend/`
- `src/`
- `data/processed/`
- `vectorstore/faiss_index/`
- `requirements.txt`
- `Procfile`
- `runtime.txt`
- `render.yaml`

`data/processed`와 `vectorstore/faiss_index`가 빠지면 배포 서버에서 RAG 답변 품질이 떨어지거나 fallback 답변으로 동작합니다.

## 2. 백엔드 Render 배포

1. Render 접속 후 GitHub 저장소를 연결합니다.
2. `render.yaml`을 사용하는 Blueprint 배포를 선택합니다.
3. 환경변수에서 아래 값을 설정합니다.

```env
OPENAI_API_KEY=sk-...
CORS_ALLOWED_ORIGINS=https://your-frontend.vercel.app
CSRF_TRUSTED_ORIGINS=https://your-frontend.vercel.app
```

Render 배포 후 백엔드 주소 예시는 다음과 같습니다.

```text
https://medipill-backend.onrender.com
```

백엔드 확인 주소:

```text
https://medipill-backend.onrender.com/api/chat/
```

로그에서 `collectstatic`, `migrate`, `gunicorn` 실행이 성공했는지 확인합니다.

## 3. 프론트엔드 Vercel 배포

Vercel에서 같은 GitHub 저장소를 연결하고 아래처럼 설정합니다.

```text
Root Directory: frontend
Framework Preset: Vite
Build Command: npm run build
Output Directory: dist
```

Vercel Environment Variables에 아래 값을 추가합니다.

```env
VITE_API_BASE_URL=https://your-backend.onrender.com
```

배포 후 프론트 주소 예시는 다음과 같습니다.

```text
https://medipill.vercel.app
```

## 4. 백엔드 CORS 갱신

Vercel 배포 주소가 나온 뒤 Render 환경변수를 실제 주소로 바꿉니다.

```env
CORS_ALLOWED_ORIGINS=https://medipill.vercel.app
CSRF_TRUSTED_ORIGINS=https://medipill.vercel.app
```

변경 후 Render에서 다시 Deploy 합니다.

## 5. 배포 후 테스트 순서

1. Vercel 프론트 접속
2. 회원가입/로그인
3. 건강정보 등록
4. 채팅 질문 입력
5. 답변에 제품 후보와 건강정보 기준 주의 후보가 나오는지 확인
6. Render Logs에서 오류가 없는지 확인

## 6. 자주 나는 오류

### CORS 오류

프론트 주소가 Render의 `CORS_ALLOWED_ORIGINS`에 정확히 들어갔는지 확인합니다.

### OpenAI 오류

Render 환경변수 `OPENAI_API_KEY`가 설정되어 있는지 확인합니다.

### RAG fallback 답변만 나옴

`data/processed`와 `vectorstore/faiss_index`가 GitHub와 Render 배포 파일에 포함되어 있는지 확인합니다.

### DB 오류

Render의 `DATABASE_URL`이 `render.yaml`의 Postgres DB와 연결되어 있는지 확인합니다.