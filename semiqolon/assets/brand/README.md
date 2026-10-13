# SEMIQOLON identity · v23 · 2026-09-24

- 앱/상위 브랜드: **SEMIQOLON**
- 첫 서비스: **SEMI · 성경 BETA**
- 사용자 첨부 원본 네 개를 그대로 보관하고 적용. 새 이미지 생성·로고 재작도·원본 픽셀 편집 없음.
- `semiqolon-wordmark-white.png` / `semiqolon-wordmark-black.png`: 3000×537 워드마크.
- `semiqolon-icon-black.png` / `semiqolon-icon-white.png`: 1024×1024 앱 아이콘.
- 화면 로고는 흰 워드마크를 SVG luminance mask로 표시해 배경 변화에 맞춰 기존 글자색을 따름. 아랫줄은 SEMI / 성경 / BETA.
- 웹앱 설치 이름, 문서 제목, 브라우저 아이콘, iPhone 홈 화면 아이콘, 오프라인 캐시 반영. 아이콘은 원본을 브라우저가 축소 표시.
- 기존 IndexedDB·localStorage·백업 형식 식별자는 유지해 기존 녹음 및 백업과 호환.
- 브랜드/베타 표기 반영이며 앱스토어 심사나 외부 서비스 공개 배포를 수행한 것은 아님.

## 이전 아이덴티티 기록

# SEMi identity · 2026-09-24

## 확정 로고 · v18

2026-09-24 사용자가 직접 첨부하고 “이거 너무좋아”로 선택한 Higgsfield 결과를 그대로 적용합니다.

- 모델: `gpt_image_2_5`
- 확정 Job: `09942ce1-a380-45fd-a983-77ff0d8c66bd`
- 원본: `semi-higgsfield-logo-v18.png` (1024×1024)
- 사용자 첨부와 동일한 원본: `Edit-this-exact-finished-SEMi-logo-with.png`
- 윗줄 ‘목소리성경’, 아랫줄 ‘SEMi’. E는 물결·바람의 세 선입니다. S/M/i와 한글까지 굵어진 이 시안을 확정했습니다.
- 이전 v17 Job: `6e82eb2a-d80c-45e3-8026-96784c8f7d27`. 추가로 생성된 더 가는 시안 `df4837ce-c167-4e89-844b-1318c54927d7`은 사용자 선택에 따라 적용하지 않습니다.
- 생성 이미지 파일을 수정하거나 다시 그리지 않았습니다. 앱 SVG luminance mask가 원본의 흰 로고만 표시하며, 밝은 화면에서는 글자색을 따릅니다.
- viewBox `175 315 669 352`로 바깥 여백을 화면에서 제외합니다. 첫 화면과 상단은 같은 원본과 서로 다른 mask ID를 씁니다.
- 본문 UI 글꼴은 Paperlogy입니다. 로고는 하나의 그림이어서 폰트와 별도 E를 조합할 때의 굵기 불일치가 없습니다.
- 로컬 서버의 정적 파일 허용 목록과 오프라인 캐시에 확정 원본을 포함합니다.

## 이전 시안 · v12 (보관)

사용자 요청으로 Higgsfield의 `gpt_image_2_5`에서 생성한 아이덴티티 시안입니다.

- Job: `847842bc-3632-4f8e-bb5e-b0da3ad1cda6`
- 원본: `semi-higgsfield-direction.png`
- 콘셉트: 펼친 책, 목소리를 담는 물그릇, 한 줄의 파동. 깊은 옥빛과 진주빛 유리.
- `semi-mark.svg`: 생성 시안의 심벌을 UI 크기에 맞게 벡터로 재구성.
- 앱의 `favicon.svg`: 같은 심벌로 만든 유리·물빛 앱 아이콘.
- `index.html`의 `ICONS`: 시안의 해돋이/성경/계단/목소리/재생/기록함을 24px 공통 선으로 재구성.
- 화면의 `semi` 워드마크도 본문과 같은 Paperlogy를 사용. 별도 글꼴 추가 없음.

v12에서는 생성 시안을 벡터로 재구성했습니다. v18 워드마크에는 위의 확정 생성 원본을 직접 적용합니다.
