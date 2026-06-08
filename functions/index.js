const { initializeApp } = require("firebase-admin/app");
const { getAuth } = require("firebase-admin/auth");
const { FieldValue, getFirestore } = require("firebase-admin/firestore");
const { HttpsError, onCall } = require("firebase-functions/v2/https");

initializeApp();

const db = getFirestore();
const region = "asia-northeast3";
const studentDomain = "students.contextwordking.app";

function requireSignedIn(request) {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "로그인이 필요합니다.");
  }
  return request.auth.uid;
}

async function requireTeacher(request) {
  const uid = requireSignedIn(request);
  const teacherSnapshot = await db.doc(`users/${uid}`).get();
  if (!teacherSnapshot.exists || teacherSnapshot.data().role !== "teacher") {
    throw new HttpsError("permission-denied", "교사 계정만 학생을 만들 수 있습니다.");
  }
  return { uid, profile: teacherSnapshot.data() };
}

exports.ensureTeacherProfile = onCall({ region }, async request => {
  const uid = requireSignedIn(request);
  const provider = request.auth.token.firebase?.sign_in_provider;
  if (provider !== "google.com") {
    throw new HttpsError("permission-denied", "교사는 Google 계정으로 로그인해야 합니다.");
  }

  const displayName = String(request.auth.token.name || "선생님").slice(0, 40);
  const email = String(request.auth.token.email || "");
  const ref = db.doc(`users/${uid}`);
  const snapshot = await ref.get();

  if (snapshot.exists && snapshot.data().role !== "teacher") {
    throw new HttpsError("permission-denied", "이미 다른 역할로 등록된 계정입니다.");
  }

  const profile = {
    role: "teacher",
    displayName,
    email,
    updatedAt: FieldValue.serverTimestamp()
  };
  await ref.set({
    ...profile,
    createdAt: snapshot.exists
      ? snapshot.data().createdAt || FieldValue.serverTimestamp()
      : FieldValue.serverTimestamp()
  }, { merge: true });

  return { role: "teacher", displayName, email };
});

exports.createStudentAccount = onCall({ region }, async request => {
  const teacher = await requireTeacher(request);
  const displayName = String(request.data?.displayName || "").trim();
  const studentId = String(request.data?.studentId || "").trim().toLowerCase();
  const password = String(request.data?.password || "");

  if (!displayName || displayName.length > 20) {
    throw new HttpsError("invalid-argument", "학생 이름은 1~20자로 입력하세요.");
  }
  if (!/^[a-z0-9_-]{4,24}$/.test(studentId)) {
    throw new HttpsError("invalid-argument", "학생 ID 형식을 확인하세요.");
  }
  if (password.length < 6 || password.length > 30) {
    throw new HttpsError("invalid-argument", "비밀번호는 6~30자로 입력하세요.");
  }

  const email = `${studentId}@${studentDomain}`;
  let studentRecord;
  try {
    studentRecord = await getAuth().createUser({
      email,
      password,
      displayName,
      emailVerified: true,
      disabled: false
    });
  } catch (error) {
    if (error.code === "auth/email-already-exists") {
      throw new HttpsError("already-exists", "이미 사용 중인 학생 ID입니다.");
    }
    throw new HttpsError("internal", "학생 인증 계정을 만들지 못했습니다.");
  }

  const studentProfile = {
    role: "student",
    studentId,
    displayName,
    teacherId: teacher.uid,
    disabled: false,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp()
  };

  try {
    const batch = db.batch();
    batch.set(db.doc(`users/${studentRecord.uid}`), studentProfile);
    batch.set(db.doc(`teachers/${teacher.uid}/students/${studentRecord.uid}`), studentProfile);
    await batch.commit();
  } catch (error) {
    await getAuth().deleteUser(studentRecord.uid).catch(() => {});
    throw new HttpsError("internal", "학생 정보를 저장하지 못했습니다.");
  }

  return {
    uid: studentRecord.uid,
    studentId,
    displayName
  };
});
