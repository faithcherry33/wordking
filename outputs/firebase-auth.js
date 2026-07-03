import { firebaseConfig } from "./firebase-config.js";

const $ = id => document.getElementById(id);
const configured = firebaseConfig.apiKey && !firebaseConfig.apiKey.startsWith("YOUR_");
const STUDENT_SESSION_KEY = "wordkingStudentSession";
  const DEMO_STUDENT = {
  studentId: "judge01",
  password: "wordking123",
  displayName: "심사용 학생",
  teacherId: "demo-teacher"
};

let auth;
let db;
let stopStudentList;
let stopLearningList;
let firebaseApi = {};
let studentLoginInProgress = false;
let studentLoginLocked = false;
let teacherStudents = [];
let teacherLearningAttempts = [];

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
  const detail = code ? ` (${code})` : "";
  if (code.includes("popup-closed")) return "Google 로그인 창이 닫혔습니다.";
  if (code.includes("not-found")) return "학생 ID 또는 비밀번호가 맞지 않습니다.";
  if (code.includes("already-exists")) return "이미 사용 중인 학생 ID입니다.";
  if (code.includes("admin-restricted-operation")) return "Firebase에서 익명 로그인이 꺼져 있습니다. Authentication의 로그인 방법에서 익명을 사용 설정해 주세요.";
  if (code.includes("too-many-requests")) return "로그인 요청이 잠시 제한되었습니다. 버튼을 반복해서 누르지 말고 10~30분 뒤 다시 시도해 주세요.";
  if (code.includes("permission-denied")) return `권한이 없습니다. Firestore 규칙 게시 상태를 확인해 주세요.${detail}`;
  if (code.includes("unavailable")) return `Firebase 연결이 불안정합니다. 잠시 뒤 다시 시도하세요.${detail}`;
  if (code.includes("internal")) return `Firebase 내부 오류입니다. firebase-config.js의 projectId/authDomain이 Firebase 콘솔 SDK 값과 정확히 같은지 확인해 주세요.${detail}`;
  return `${error?.message || "처리 중 오류가 발생했습니다."}${detail}`;
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
  if (stopLearningList) {
    stopLearningList();
    stopLearningList = null;
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
    authUid: profile.authUid || "",
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
  if (firebaseConfig.authDomain && firebaseConfig.projectId && !firebaseConfig.authDomain.includes(firebaseConfig.projectId)) {
    alert(`firebase-config.js의 authDomain과 projectId가 서로 맞지 않아 보입니다.\nprojectId: ${firebaseConfig.projectId}\nauthDomain: ${firebaseConfig.authDomain}`);
    return;
  }
  try {
    localStorage.removeItem(STUDENT_SESSION_KEY);
    if (auth.currentUser?.isAnonymous) await firebaseApi.signOut(auth);
    const provider = new firebaseApi.GoogleAuthProvider();
    provider.setCustomParameters({ prompt: "select_account" });
    await firebaseApi.signInWithPopup(auth, provider);
  } catch (error) {
    console.error("teacherGoogleLogin failed", error);
    alert(friendlyError(error));
  }
};

window.studentPasswordLogin = async event => {
  event.preventDefault();
  if (studentLoginLocked) return;
  if (!configured) {
    setMessage("student-login-message", "Firebase 설정값을 먼저 입력해야 합니다.", "error");
    return;
  }

  const studentId = normalizeStudentId($("student-login-id").value);
  const password = $("student-login-password").value;
  const submitButton = event.submitter || event.target.querySelector('button[type="submit"]');
  if (!/^[a-z0-9_-]{4,24}$/.test(studentId)) {
    setMessage("student-login-message", "학생 ID는 영문 소문자, 숫자, -, _로 4~24자여야 합니다.", "error");
    return;
  }

  studentLoginLocked = true;
  if (submitButton) submitButton.disabled = true;
  setMessage("student-login-message", "로그인하고 있습니다. 버튼을 다시 누르지 마세요.");
  try {
        if (studentId === DEMO_STUDENT.studentId && password === DEMO_STUDENT.password) {
      const profile = {
        role: "student",
        studentId: DEMO_STUDENT.studentId,
        displayName: DEMO_STUDENT.displayName,
        teacherId: DEMO_STUDENT.teacherId,
        demo: true
      };

      studentLoginInProgress = true;
      let studentUser = auth.currentUser;

      if (studentUser && !studentUser.isAnonymous) {
        await firebaseApi.signOut(auth);
        studentUser = null;
      }

      if (!studentUser) {
        const credential = await firebaseApi.signInAnonymously(auth);
        studentUser = credential.user;
      }

      profile.authUid = studentUser.uid;

      try {
  await firebaseApi.setDoc(
    firebaseApi.doc(db, "studentSessions", studentUser.uid),
    {
      ...profile,
      lastLoginAt: firebaseApi.serverTimestamp()
    },
    { merge: true }
  );
} catch (sessionError) {
  console.warn("Demo student session was not saved to Firestore.", sessionError);
}

saveStudentSession(profile);
studentLoginInProgress = false;
$("student-login-password").value = "";
setMessage("student-login-message", "");
showStudentDashboard(profile);
return;
    }
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
    studentLoginInProgress = true;
    let studentUser = auth.currentUser;
    if (studentUser && !studentUser.isAnonymous) {
      await firebaseApi.signOut(auth);
      studentUser = null;
    }
    if (!studentUser) {
      const credential = await firebaseApi.signInAnonymously(auth);
      studentUser = credential.user;
    }
    profile.authUid = studentUser.uid;
    await firebaseApi.setDoc(
      firebaseApi.doc(db, "studentSessions", studentUser.uid),
      {
        ...profile,
        lastLoginAt: firebaseApi.serverTimestamp()
      },
      { merge: true }
    );
    saveStudentSession(profile);
    studentLoginInProgress = false;
    $("student-login-password").value = "";
    setMessage("student-login-message", "");
    showStudentDashboard(profile);
  } catch (error) {
    studentLoginInProgress = false;
    setMessage("student-login-message", friendlyError(error), "error");
  } finally {
    studentLoginLocked = false;
    if (submitButton) submitButton.disabled = false;
  }
};

window.appLogout = async () => {
  localStorage.removeItem(STUDENT_SESSION_KEY);
  if (auth?.currentUser?.isAnonymous) {
    clearSessionUi();
    return;
  }
  if (auth?.currentUser) await firebaseApi.signOut(auth);
  else clearSessionUi();
};

function dateKey(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function weekKey(date = new Date()) {
  const monday = new Date(date);
  const day = monday.getDay() || 7;
  monday.setDate(monday.getDate() - day + 1);
  return dateKey(monday);
}

function challengeType(mode) {
  if (mode === "dictionaryChallenge") return "dictionary";
  if (mode === "inferenceChallenge") return "inference";
  return "";
}

window.saveStageResult = async stage => {
  const type = challengeType(stage.mode);
  const user = auth?.currentUser;
  if (!user?.isAnonymous) return;

  try {
    const sessionSnapshot = await firebaseApi.getDoc(firebaseApi.doc(db, "studentSessions", user.uid));
    if (!sessionSnapshot.exists()) return;
    const session = sessionSnapshot.data();
    const total = Number(stage.total) || 0;
    const correct = Number(stage.correct) || 0;
    const rate = total ? Math.round(correct / total * 100) : 0;
    const results = (stage.results || []).map(result => ({
      questionId: String(result.questionId || ""),
      level: String(result.level || ""),
      word: String(result.word || ""),
      correct: Boolean(result.correct),
      selectedDefinition: String(result.selectedDefinition || ""),
      correctDefinition: String(result.definition || "")
    }));
    const common = {
      teacherId: session.teacherId,
      studentUid: user.uid,
      studentId: session.studentId,
      displayName: session.displayName,
      mode: String(stage.mode || ""),
      correct,
      total,
      rate,
      dateKey: dateKey(),
      weekKey: weekKey(),
      completedAt: firebaseApi.serverTimestamp()
    };
    const writes = [
      firebaseApi.addDoc(
        firebaseApi.collection(db, "teachers", session.teacherId, "learningAttempts"),
        { ...common, results }
      )
    ];
    if (type) {
      writes.push(firebaseApi.addDoc(
        firebaseApi.collection(db, "teachers", session.teacherId, "rankingAttempts"),
        { ...common, challengeType: type }
      ));
    }
    await Promise.all(writes);
  } catch (error) {
    console.error("saveStageResult failed", error);
  }
};

function bestByStudent(attempts) {
  const best = new Map();
  attempts.forEach(attempt => {
    const previous = best.get(attempt.studentId);
    if (!previous || attempt.rate > previous.rate ||
      (attempt.rate === previous.rate && attempt.correct > previous.correct)) {
      best.set(attempt.studentId, attempt);
    }
  });
  return [...best.values()]
    .sort((a, b) => b.rate - a.rate || b.correct - a.correct || a.displayName.localeCompare(b.displayName, "ko"))
    .slice(0, 3);
}

function rankingHtml(rows) {
  if (!rows.length) return '<p class="ranking-empty">아직 도전 기록이 없습니다.</p>';
  const medals = ["금메달", "은메달", "동메달"];
  return rows.map((row, index) =>
    `<div class="ranking-item"><span><b>${medals[index]}</b> ${escapeText(row.displayName)}</span><strong>${row.rate}%</strong></div>`
  ).join("");
}

async function loadRankings(teacherId) {
  ["dictionary-daily-ranking", "dictionary-weekly-ranking", "inference-daily-ranking", "inference-weekly-ranking"]
    .forEach(id => $(id).innerHTML = '<p class="ranking-empty">불러오는 중입니다.</p>');

  try {
    const snapshot = await firebaseApi.getDocs(
      firebaseApi.collection(db, "teachers", teacherId, "rankingAttempts")
    );
    const attempts = snapshot.docs.map(item => item.data());
    const today = dateKey();
    const week = weekKey();
    const categories = ["dictionary", "inference"];

    categories.forEach(type => {
      const typeAttempts = attempts.filter(item => item.challengeType === type);
      $(`${type}-daily-ranking`).innerHTML = rankingHtml(
        bestByStudent(typeAttempts.filter(item => item.dateKey === today))
      );
      $(`${type}-weekly-ranking`).innerHTML = rankingHtml(
        bestByStudent(typeAttempts.filter(item => item.weekKey === week))
      );
    });
  } catch (error) {
    const message = `<p class="ranking-empty">${escapeText(friendlyError(error))}</p>`;
    ["dictionary-daily-ranking", "dictionary-weekly-ranking", "inference-daily-ranking", "inference-weekly-ranking"]
      .forEach(id => $(id).innerHTML = message);
  }
}

window.openRankings = async () => {
  const user = auth?.currentUser;
  if (!user) {
    alert("로그인이 필요합니다.");
    return;
  }

  let teacherId = user.uid;
  if (user.isAnonymous) {
    const sessionSnapshot = await firebaseApi.getDoc(firebaseApi.doc(db, "studentSessions", user.uid));
    if (!sessionSnapshot.exists()) {
      alert("학생 로그인 정보를 확인할 수 없습니다.");
      return;
    }
    teacherId = sessionSnapshot.data().teacherId;
  }

  showOnly("rankings");
  await loadRankings(teacherId);
};

window.backFromRankings = () => {
  if (auth?.currentUser?.isAnonymous) showStudentDashboard(readStudentSession() || {});
  else showOnly("teacher-dashboard");
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
    teacherStudents = snapshot.docs.map(studentDoc => studentDoc.data());
    renderTeacherOverview();
  }, error => {
    $("teacher-student-list").innerHTML =
      `<tr><td colspan="5" class="empty-row">${escapeText(friendlyError(error))}</td></tr>`;
  });

  stopLearningList = firebaseApi.onSnapshot(
    firebaseApi.collection(db, "teachers", teacherUid, "learningAttempts"),
    snapshot => {
      teacherLearningAttempts = snapshot.docs.map(attemptDoc => ({
        id: attemptDoc.id,
        ...attemptDoc.data()
      }));
      renderTeacherOverview();
    },
    error => {
      console.error("learningAttempts listener failed", error);
    }
  );
}

function studentSummary(studentId) {
  const attempts = teacherLearningAttempts
    .filter(attempt => attempt.studentId === studentId)
    .sort((a, b) => {
      const aTime = a.completedAt?.toMillis?.() || 0;
      const bTime = b.completedAt?.toMillis?.() || 0;
      return aTime - bTime;
    });
  const results = attempts.flatMap(attempt =>
    (attempt.results || []).map(result => ({
      ...result,
      mode: attempt.mode,
      completedAt: attempt.completedAt
    }))
  );
  const correct = results.filter(result => result.correct).length;
  const rate = results.length ? Math.round(correct / results.length * 100) : 0;
  const histories = new Map();

  results.forEach(result => {
    const key = result.questionId || `${result.level}:${result.word}:${result.correctDefinition}`;
    if (!histories.has(key)) histories.set(key, []);
    histories.get(key).push(result);
  });

  let firstTry = 0;
  let corrected = 0;
  let repeatedWrong = 0;
  const repeatedWords = new Map();

  histories.forEach(history => {
    if (history[0]?.correct) firstTry++;
    const firstCorrectIndex = history.findIndex(item => item.correct);
    if (firstCorrectIndex > 0 && history.slice(0, firstCorrectIndex).some(item => !item.correct)) corrected++;
    const wrongCount = history.filter(item => !item.correct).length;
    if (wrongCount >= 2) {
      repeatedWrong++;
      const word = history[0]?.word || "알 수 없음";
      repeatedWords.set(word, (repeatedWords.get(word) || 0) + wrongCount);
    }
  });

  const levels = ["level1", "level2", "level3"].map(level => {
    const levelResults = results.filter(result => result.level === level);
    const levelCorrect = levelResults.filter(result => result.correct).length;
    return {
      level,
      total: levelResults.length,
      rate: levelResults.length ? Math.round(levelCorrect / levelResults.length * 100) : null
    };
  });

  return {
    attempts,
    results,
    correct,
    total: results.length,
    rate,
    firstTry,
    corrected,
    repeatedWrong,
    repeatedWords: [...repeatedWords.entries()].sort((a, b) => b[1] - a[1]),
    levels,
    challengeJoined: attempts.some(attempt =>
      attempt.mode === "dictionaryChallenge" || attempt.mode === "inferenceChallenge"
    )
  };
}

function renderTeacherOverview() {
  const rows = teacherStudents.map(student => {
    const summary = studentSummary(student.studentId);
    return `<tr>
      <td><button class="student-link" onclick="showStudentStats('${escapeText(student.studentId)}')">${escapeText(student.displayName)}</button><div class="student-id">${escapeText(student.studentId)}</div></td>
      <td>${summary.total ? `${summary.rate}%` : "-"}</td>
      <td>${summary.firstTry}</td>
      <td>${summary.corrected}</td>
      <td>${summary.repeatedWrong}</td>
    </tr>`;
  });
  $("teacher-student-list").innerHTML = rows.length
    ? rows.join("")
    : '<tr><td colspan="5" class="empty-row">아직 만든 학생 계정이 없습니다.</td></tr>';

  const summaries = teacherStudents.map(student => studentSummary(student.studentId));
  const totalAnswers = summaries.reduce((sum, item) => sum + item.total, 0);
  const totalCorrect = summaries.reduce((sum, item) => sum + item.correct, 0);
  const participants = summaries.filter(item => item.total > 0).length;
  $("teacher-student-count").textContent = `${teacherStudents.length}명`;
  $("stats-student-count").textContent = `${participants}명`;
  $("stats-class-rate").textContent = totalAnswers ? `${Math.round(totalCorrect / totalAnswers * 100)}%` : "-";
  $("stats-challenge-count").textContent = `${summaries.filter(item => item.challengeJoined).length}명`;
  $("stats-review-count").textContent = `${summaries.filter(item => item.repeatedWrong > 0).length}명`;
}

window.showStudentStats = studentId => {
  const student = teacherStudents.find(item => item.studentId === studentId);
  if (!student) return;
  const summary = studentSummary(studentId);
  const levelNames = { level1: "1단계", level2: "2단계", level3: "3단계" };
  const modeNames = {
    level1: "연습 1단계",
    level2: "연습 2단계",
    level3: "연습 3단계",
    review: "오답 복습",
    dictionaryChallenge: "1·2단계 오늘의 도전",
    inferenceChallenge: "3단계 오늘의 도전"
  };
  const levelCards = summary.levels.map(level =>
    `<div class="stat">${levelNames[level.level]} 정답률<b>${level.rate === null ? "-" : `${level.rate}%`}</b><span class="student-id">${level.total}문항</span></div>`
  ).join("");
  const words = summary.repeatedWords.length
    ? summary.repeatedWords.slice(0, 10).map(([word, count]) => `<li><b>${escapeText(word)}</b> · ${count}회 오답</li>`).join("")
    : "<li>반복해서 틀린 단어가 없습니다.</li>";
  const recent = summary.attempts.length
    ? summary.attempts.slice(-5).reverse().map(attempt => {
        const date = attempt.completedAt?.toDate?.().toLocaleString("ko-KR") || "저장 중";
        return `<li>${escapeText(date)} · ${escapeText(modeNames[attempt.mode] || attempt.mode)} · ${attempt.correct}/${attempt.total} (${attempt.rate}%)</li>`;
      }).join("")
    : "<li>아직 학습 기록이 없습니다.</li>";

  $("student-detail").classList.remove("hidden");
  $("student-detail").innerHTML = `
    <h3>${escapeText(student.displayName)} 학생 상세 기록</h3>
    <p class="sub">학생 ID: ${escapeText(student.studentId)}</p>
    <div class="stats">
      <div class="stat">전체 정답률<b>${summary.total ? `${summary.rate}%` : "-"}</b></div>
      <div class="stat">한 번에 맞힌 문제<b>${summary.firstTry}</b></div>
      <div class="stat">틀렸다가 맞힌 문제<b>${summary.corrected}</b></div>
      <div class="stat">반복 오답 문제<b>${summary.repeatedWrong}</b></div>
    </div>
    <div class="stats">${levelCards}</div>
    <div class="result-groups">
      <section class="result-group bad"><h3>반복해서 틀리는 단어</h3><ol class="result-list">${words}</ol></section>
      <section class="result-group"><h3>최근 STAGE 기록</h3><ol class="result-list">${recent}</ol></section>
    </div>`;
};

async function ensureLocalTeacherProfile(user) {
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
  const profile = await ensureLocalTeacherProfile(user);
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
  setMessage("firebase-status", "학생 계정으로 로그인하면 문제 풀이 결과가 Firebase에 저장됩니다.");
  
  authModule.onAuthStateChanged(auth, async user => {
    if (!user) {
      if (studentLoginInProgress) return;
      localStorage.removeItem(STUDENT_SESSION_KEY);
      clearSessionUi();
      return;
    }
    if (user.isAnonymous) {
      if (studentLoginInProgress) return;
      if (!readStudentSession()) {
        clearSessionUi();
        return;
      }
      try {
        const sessionSnapshot = await firestoreModule.getDoc(
          firestoreModule.doc(db, "studentSessions", user.uid)
        );
        if (!sessionSnapshot.exists()) {
          await authModule.signOut(auth);
          clearSessionUi();
          return;
        }
        const profile = sessionSnapshot.data();
        saveStudentSession({ ...profile, authUid: user.uid });
        showStudentDashboard(profile);
      } catch (error) {
        console.error(error);
        await authModule.signOut(auth);
        alert(friendlyError(error));
      }
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
