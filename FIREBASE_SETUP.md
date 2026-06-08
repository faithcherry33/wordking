# 문맥 단어왕 Firebase 연결 순서

## 1. Firebase 프로젝트 준비

1. Firebase Console에서 새 프로젝트를 만듭니다.
2. Authentication > Sign-in method에서 `Google`과 `Email/Password`를 사용 설정합니다.
3. Firestore Database를 만듭니다.
4. Functions를 사용할 수 있도록 Firebase CLI에서 로그인합니다.

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

## 3. 배포

```bash
firebase login
firebase use --add
firebase deploy --only firestore:rules,functions,hosting
```

## 4. 사용 흐름

- 교사: Google 계정으로 로그인합니다.
- 교사 화면: 학생 이름, 학생 ID, 초기 비밀번호를 입력해 학생 계정을 만듭니다.
- 학생: 첫 화면의 `학생 로그인`에서 선생님이 알려 준 학생 ID와 비밀번호로 로그인합니다.

학생 ID는 Firebase Auth 내부에서 `학생ID@students.contextwordking.app` 형태의 이메일로 변환되어 저장됩니다. 학생에게는 이메일 주소를 알려 줄 필요가 없습니다.
