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
2. Authentication > Sign-in method에서 `Google`을 사용 설정합니다.
3. Firestore Database를 만듭니다.
4. Authentication > Settings > 승인된 도메인에 Netlify 도메인을 추가합니다.

학생 임시 로그인은 Firebase Email/Password를 쓰지 않으므로, 현재 임시 버전에서는 Email/Password를 꼭 켜지 않아도 됩니다.

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
