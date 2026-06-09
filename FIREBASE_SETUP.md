# 문맥 단어왕 Firebase 연결 순서

## 현재 버전

현재 앱은 수업 전 빠른 사용을 위해 **임시 운영 모드**로 되어 있습니다.

- 교사는 Google 계정으로 로그인합니다.
- 교사는 Firestore에 학생 ID와 비밀번호 해시를 저장합니다.
- 학생은 Firebase Auth 계정이 아니라, 학생 ID와 비밀번호로 앱 안에서 임시 로그인합니다.
- Cloud Functions 배포 없이 사용할 수 있습니다.

주의: 이 방식은 수업 중 임시 운영용입니다. 장기 운영이나 민감한 학습 기록 저장에는 `functions/index.js`를 배포하는 정식 구조로 바꾸는 것이 안전합니다.

## 1. Firebase 프로젝트 준비

1. Firebase Console에서 프로젝트를 만듭니다.
2. Authentication > Sign-in method에서 `Google`과 `익명`을 사용 설정합니다.
3. Firestore Database를 만듭니다.
4. Authentication > Settings > 승인된 도메인에 Netlify 도메인을 추가합니다.

학생은 ID와 비밀번호 확인 뒤 Firebase 익명 인증 UID를 발급받습니다. 따라서 `익명` 로그인 제공업체를 반드시 켜야 합니다. 현재 임시 버전에서는 Email/Password를 꼭 켜지 않아도 됩니다.

## 2. 웹 앱 설정값 넣기

Firebase Console > 프로젝트 설정 > 내 앱 > 웹 앱의 SDK 설정값을 복사해서
`outputs/firebase-config.js`의 `YOUR_...` 값을 바꿉니다.

```js
export const firebaseConfig = {
  apiKey: "...",
  authDomain: "...firebaseapp.com",
  projectId: "...",
  storageBucket: "...firebasestorage.app",
  messagingSenderId: "...",
  appId: "..."
};
```

`measurementId`는 Google Analytics용이라 없어도 됩니다.

## 3. Firestore 규칙 게시

Firebase Console > Firestore Database > 규칙에 `firestore.rules` 내용을 붙여넣고 게시합니다.

Netlify는 `outputs` 폴더를 배포합니다.

```text
Publish directory: outputs
Build command: 비워두기
```

## 4. 사용 흐름

- 교사: Google 계정으로 로그인합니다.
- 교사 화면: 학생 이름, 학생 ID, 초기 비밀번호를 입력해 학생 로그인을 만듭니다.
- 학생: 첫 화면의 `학생 로그인`에서 선생님이 알려 준 학생 ID와 비밀번호로 로그인합니다.

## 5. 랭킹

- `1·2단계 오늘의 도전`과 `3단계 오늘의 도전` 결과만 랭킹에 반영됩니다.
- 두 도전의 랭킹은 서로 분리됩니다.
- 오늘과 이번 주에 받은 학생별 최고 정답률을 사용합니다.
- 같은 정답률이면 맞힌 문항 수가 높은 학생이 먼저 표시됩니다.
- 랭킹은 학생을 만든 교사별로 분리됩니다.

## 6. 교사 학습 통계

모든 20문항 STAGE가 끝나면 문제별 결과가 교사별 Firestore 영역에 저장됩니다.

- 전체 정답률
- 1·2·3단계별 정답률
- 처음부터 맞힌 문제
- 이전에 틀렸다가 나중에 맞힌 문제
- 두 번 이상 반복해서 틀린 문제와 단어
- 최근 STAGE 결과

교사는 자신이 만든 학생들의 기록만 읽을 수 있습니다. 학생은 자신의 익명 인증 세션으로 자기 교사 영역에만 기록을 추가할 수 있습니다.
