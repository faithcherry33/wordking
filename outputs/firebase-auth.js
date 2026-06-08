import { firebaseConfig, functionsRegion } from "./firebase-config.js";

const $ = id => document.getElementById(id);
const configured = firebaseConfig.apiKey && !firebaseConfig.apiKey.startsWith("YOUR_");
let auth;
let db;
let functions;
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

function studentEmail(studentId) {
  return `${studentId}@students.contextwordking.app`;
}

function friendlyError(error) {
  const code = error?.code || "";
  if (code.includes("popup-closed")) return "Google 로그인 창이 닫혔습니다.";
  if (code.includes("invalid-credential")) return "학생 ID 또는 비밀번호가 맞지 않습니다.";
  if (code.includes("too-many-requests")) return "로그인 시도가 너무 많습니다. 잠시 뒤 다시 시도하세요.";
  if (code.includes("already-exists")) return "이미 사용 중인 학생 ID입니다.";
  if (code.includes("invalid-argument")) return error.message || "입력한 내용을 다시 확인하세요.";
  if (code.includes("permission-denied")) return "이 작업을 할 권한이 없습니다.";
  return error?.message || "처리 중 오류가 발생했습니다.";
}

function setUserPill(text) {
  $("user-pill").textContent = text;
  $("user-pill").classList.remove("hidden");
}

function clearSessionUi() {
  if (stopStudentList) {
    stopStudentList();
    stopStudentList = null;
  }
  $("user-pill").classList.add("hidden");
  showOnly("login");
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
    await firebaseApi.signInWithEmailAndPassword(auth, studentEmail(studentId), password);
  } catch (error) {
    setMessage("student-login-message", friendlyError(error), "error");
  }
};

window.appLogout = async () => {
  if (auth) await firebaseApi.signOut(auth);
  else clearSessionUi();
};

window.createStudentAccount = async event => {
  event.preventDefault();
  const button = $("create-student-button");
  const displayName = $("new-student-name").value.trim();
  const studentId = normalizeStudentId($("new-student-id").value);
  const password = $("new-student-password").value;

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
    const createStudent = firebaseApi.httpsCallable(functions, "createStudentAccount");
    await createStudent({ displayName, studentId, password });
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

function escapeText(value = "") {
  return String(value).replace(/[&<>"']/g, character => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[character]);
}

async function routeUser(user) {
  const userSnapshot = await firebaseApi.getDoc(firebaseApi.doc(db, "users", user.uid));
  let profile = userSnapshot.exists() ? userSnapshot.data() : null;

  if (!profile && user.providerData.some(provider => provider.providerId === "google.com")) {
    const ensureTeacher = firebaseApi.httpsCallable(functions, "ensureTeacherProfile");
    const response = await ensureTeacher();
    profile = response.data;
  }

  if (!profile) {
    await firebaseApi.signOut(auth);
    alert("등록되지 않은 계정입니다.");
    return;
  }

  if (profile.role === "teacher") {
    setUserPill(`${profile.displayName || user.displayName || "선생님"} · 교사`);
    $("teacher-name").textContent = profile.displayName || user.displayName || "선생님";
    showOnly("teacher-dashboard");
    renderStudentList(user.uid);
    return;
  }

  if (profile.role === "student") {
    setUserPill(`${profile.displayName || profile.studentId} · 학생`);
    showOnly("student-dashboard");
    return;
  }

  await firebaseApi.signOut(auth);
  alert("계정 역할을 확인할 수 없습니다.");
}

if (!configured) {
  setMessage("firebase-status", "Firebase 설정 전: 화면 확인만 할 수 있습니다.");
} else {
  const [
    appModule,
    authModule,
    firestoreModule,
    functionsModule
  ] = await Promise.all([
    import("https://www.gstatic.com/firebasejs/11.10.0/firebase-app.js"),
    import("https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js"),
    import("https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js"),
    import("https://www.gstatic.com/firebasejs/11.10.0/firebase-functions.js")
  ]);
  firebaseApi = { ...authModule, ...firestoreModule, ...functionsModule };
  const app = appModule.initializeApp(firebaseConfig);
  auth = authModule.getAuth(app);
  db = firestoreModule.getFirestore(app);
  functions = functionsModule.getFunctions(app, functionsRegion);
  setMessage("firebase-status", "");

  authModule.onAuthStateChanged(auth, async user => {
    if (!user) {
      clearSessionUi();
      return;
    }
    try {
      await routeUser(user);
    } catch (error) {
      console.error(error);
      await authModule.signOut(auth);
      alert(friendlyError(error));
    }
  });
}
