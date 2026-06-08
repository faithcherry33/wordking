import { firebaseConfig } from "./firebase-config.js";

const $ = id => document.getElementById(id);
const configured = firebaseConfig.apiKey && !firebaseConfig.apiKey.startsWith("YOUR_");
const STUDENT_SESSION_KEY = "wordkingStudentSession";

let auth;
let db;
let stopStudentList;
let firebaseApi = {};

function showOnly(sectionId) {
  window.sectionsOff();
  $(sectionId).classList.remove("hidden");
}

function setMessage(id, message, type = "") {
  const element = $(id);
  if (!element) return;
  element.textContent = message;
  element.className = `form-message ${type}`.trim();
}

function normalizeStudentId(value) {
  return value.trim().toLowerCase();
}

function friendlyError(error) {
  const code = error?.code || "";
  if (code.includes("popup-closed")) return "Google 로그인 창이 닫혔습니다.";
  if (code.includes("not-found")) return "학생 ID 또는 비밀번호가 맞지 않습니다.";
  if (code.includes("already-exists")) return "이미 사용 중인 학생 ID입니다.";
  if (code.includes("permission-denied")) return "이 작업을 할 권한이 없습니다.";
  if (code.includes("unavailable")) return "Firebase 연결이 불안정합니다. 잠시 뒤 다시 시도하세요.";
  return error?.message || "처리 중 오류가 발생했습니다.";
}

function setUserPill(text) {
  $("user-pill").textContent = text;
  $("user-pill").classList.remove("hidden");
}

function clearLiveListeners() {
  if (stopStudentList) {
    stopStudentList();
    stopStudentList = null;
  }
}

function clearSessionUi() {
  clearLiveListeners();
  $("user-pill").classList.add("hidden");
  showOnly("login");
}

async function hashPassword(studentId, password) {
  const bytes = new TextEncoder().encode(`wordking:${studentId}:${password}`);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)]
    .map(byte => byte.toString(16).padStart(2, "0"))
    .join("");
}

function saveStudentSession(profile) {
  localStorage.setItem(STUDENT_SESSION_KEY, JSON.stringify({
    role: "student",
    studentId: profile.studentId,
    displayName: profile.displayName,
    teacherId: profile.teacherId,
    loggedInAt: Date.now()
  }));
}

function readStudentSession() {
  try {
    return JSON.parse(localStorage.getItem(STUDENT_SESSION_KEY) || "null");
  } catch {
    return null;
  }
}

function escapeText(value = "") {
  return String(value).replace(/[&<>"']/g, character => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[character]);
}

function showStudentDashboard(profile) {
  setUserPill(`${profile.displayName || profile.studentId} · 학생`);
  showOnly("student-dashboard");
}

window.openStudentLogin = () => {
  showOnly("student-login");
  $("student-login-id").focus();
};

window.backToLogin = () => {
  setMessage("student-login-message", "");
  showOnly("login");
};

window.teacherGoogleLogin = async () => {
  if (!configured) {
    alert("firebase-config.js에 Firebase 프로젝트 설정값을 먼저 입력해 주세요.");
    return;
  }
  try {
    localStorage.removeItem(STUDENT_SESSION_KEY);
    const provider = new firebaseApi.GoogleAuthProvider();
    provider.setCustomParameters({ prompt: "select_account" });
    await firebaseApi.signInWithPopup(auth, provider);
  } catch (error) {
    alert(friendlyError(error));
  }
};

window.studentPasswordLogin = async event => {
  event.preventDefault();
  if (!configured) {
    setMessage("student-login-message", "Firebase 설정값을 먼저 입력해야 합니다.", "error");
    return;
  }

  const studentId = normalizeStudentId($("student-login-id").value);
  const password = $("student-login-password").value;
  if (!/^[a-z0-9_-]{4,24}$/.test(studentId)) {
    setMessage("student-login-message", "학생 ID는 영문 소문자, 숫자, -, _로 4~24자여야 합니다.", "error");
    return;
  }

  setMessage("student-login-message", "로그인하고 있습니다.");
  try {
    const loginRef = firebaseApi.doc(db, "studentLogins", studentId);
    const loginSnapshot = await firebaseApi.getDoc(loginRef);
    if (!loginSnapshot.exists()) throw new Error("not-found");

    const login = loginSnapshot.data();
    const inputHash = await hashPassword(studentId, password);
    if (inputHash !== login.passwordHash || login.disabled) {
      throw new Error("not-found");
    }

    const profile = {
      role: "student",
      studentId,
      displayName: login.displayName,
      teacherId: login.teacherId
    };
    saveStudentSession(profile);
    if (auth.currentUser) await firebaseApi.signOut(auth);
    $("student-login-password").value = "";
    setMessage("student-login-message", "");
    showStudentDashboard(profile);
  } catch (error) {
    setMessage("student-login-message", friendlyError(error), "error");
  }
};

window.appLogout = async () => {
  localStorage.removeItem(STUDENT_SESSION_KEY);
  if (auth?.currentUser) await firebaseApi.signOut(auth);
  else clearSessionUi();
};

window.createStudentAccount = async event => {
  event.preventDefault();
  const teacher = auth.currentUser;
  const button = $("create-student-button");
  const displayName = $("new-student-name").value.trim();
  const studentId = normalizeStudentId($("new-student-id").value);
  const password = $("new-student-password").value;

  if (!teacher) {
    setMessage("create-student-message", "교사 Google 로그인이 필요합니다.", "error");
    return;
  }
  if (!displayName || displayName.length > 20) {
    setMessage("create-student-message", "학생 이름은 1~20자로 입력하세요.", "error");
    return;
  }
  if (!/^[a-z0-9_-]{4,24}$/.test(studentId)) {
    setMessage("create-student-message", "학생 ID는 영문 소문자, 숫자, -, _로 4~24자여야 합니다.", "error");
    return;
  }
  if (password.length < 6) {
    setMessage("create-student-message", "비밀번호는 6자 이상이어야 합니다.", "error");
    return;
  }

  button.disabled = true;
  setMessage("create-student-message", "학생 계정을 만들고 있습니다.");
  try {
    const loginRef = firebaseApi.doc(db, "studentLogins", studentId);
    const existing = await firebaseApi.getDoc(loginRef);
    if (existing.exists()) throw Object.assign(new Error("이미 사용 중인 학생 ID입니다."), { code: "already-exists" });

    const now = firebaseApi.serverTimestamp();
    const studentProfile = {
      role: "student",
      studentId,
      displayName,
      teacherId: teacher.uid,
      teacherEmail: teacher.email || "",
      disabled: false,
      createdAt: now,
      updatedAt: now
    };
    const passwordHash = await hashPassword(studentId, password);

    await Promise.all([
      firebaseApi.setDoc(firebaseApi.doc(db, "teachers", teacher.uid, "students", studentId), studentProfile),
      firebaseApi.setDoc(loginRef, {
        ...studentProfile,
        passwordHash
      })
    ]);

    event.target.reset();
    setMessage("create-student-message", `${displayName} 학생 계정을 만들었습니다.`, "good");
  } catch (error) {
    setMessage("create-student-message", friendlyError(error), "error");
  } finally {
    button.disabled = false;
  }
};

function renderStudentList(teacherUid) {
  const studentsQuery = firebaseApi.query(
    firebaseApi.collection(db, "teachers", teacherUid, "students"),
    firebaseApi.orderBy("createdAt", "desc")
  );
  stopStudentList = firebaseApi.onSnapshot(studentsQuery, snapshot => {
    const rows = snapshot.docs.map(studentDoc => {
      const student = studentDoc.data();
      const createdAt = student.createdAt?.toDate?.();
      const date = createdAt ? createdAt.toLocaleDateString("ko-KR") : "-";
      return `<tr>
        <td><b>${escapeText(student.displayName)}</b></td>
        <td>${escapeText(student.studentId)}<div class="student-id">로그인용 ID</div></td>
        <td>${student.disabled ? "사용 중지" : "사용 가능"}</td>
        <td>${date}</td>
      </tr>`;
    });
    $("teacher-student-list").innerHTML = rows.length
      ? rows.join("")
      : '<tr><td colspan="4" class="empty-row">아직 만든 학생 계정이 없습니다.</td></tr>';
    $("teacher-student-count").textContent = `${snapshot.size}명`;
    $("stats-student-count").textContent = `${snapshot.size}명`;
  }, error => {
    $("teacher-student-list").innerHTML =
      `<tr><td colspan="4" class="empty-row">${escapeText(friendlyError(error))}</td></tr>`;
  });
}

async function ensureTeacherProfile(user) {
  const userRef = firebaseApi.doc(db, "users", user.uid);
  const userSnapshot = await firebaseApi.getDoc(userRef);
  if (userSnapshot.exists()) return userSnapshot.data();

  const profile = {
    role: "teacher",
    displayName: user.displayName || "선생님",
    email: user.email || "",
    createdAt: firebaseApi.serverTimestamp(),
    updatedAt: firebaseApi.serverTimestamp()
  };
  await firebaseApi.setDoc(userRef, profile);
  return profile;
}

async function routeTeacher(user) {
  const profile = await ensureTeacherProfile(user);
  if (profile.role !== "teacher") {
    await firebaseApi.signOut(auth);
    alert("교사 계정으로 사용할 수 없는 계정입니다.");
    return;
  }

  setUserPill(`${profile.displayName || user.displayName || "선생님"} · 교사`);
  $("teacher-name").textContent = profile.displayName || user.displayName || "선생님";
  showOnly("teacher-dashboard");
  renderStudentList(user.uid);
}

if (!configured) {
  setMessage("firebase-status", "Firebase 설정 전: 화면 확인만 할 수 있습니다.");
} else {
  const [
    appModule,
    authModule,
    firestoreModule
  ] = await Promise.all([
    import("https://www.gstatic.com/firebasejs/11.10.0/firebase-app.js"),
    import("https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js"),
    import("https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js")
  ]);

  firebaseApi = { ...authModule, ...firestoreModule };
  const app = appModule.initializeApp(firebaseConfig);
  auth = authModule.getAuth(app);
  db = firestoreModule.getFirestore(app);
  setMessage("firebase-status", "임시 운영 모드: Functions 없이 Firestore로 학생 로그인을 처리합니다.");

  const studentSession = readStudentSession();
  if (studentSession?.role === "student") {
    showStudentDashboard(studentSession);
  }

  authModule.onAuthStateChanged(auth, async user => {
    if (!user) {
      if (!readStudentSession()) clearSessionUi();
      return;
    }
    try {
      localStorage.removeItem(STUDENT_SESSION_KEY);
      await routeTeacher(user);
    } catch (error) {
      console.error(error);
      await authModule.signOut(auth);
      alert(friendlyError(error));
    }
  });
}
