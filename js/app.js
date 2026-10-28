// 화면 렌더링과 이벤트. 학습 흐름 판단은 logic.js, 결과 전송은 logger.js가 맡는다.
import { itemsInUnit, nextStage, pickFollowUp, suneungSets } from "./logic.js";
import { createLogger } from "./logger.js";
import { APPS_SCRIPT_URL } from "./config.js";

const SUBJECTS = [
  { name: "화법과 언어", units: ["화법", "언어"] },
  { name: "독서와 작문", units: ["독서", "작문"] },
  { name: "문학", units: ["문학"] },
];
const app = document.getElementById("app");
const safeStorage = (() => {
  try { return window.localStorage; } catch { return { getItem: () => null, setItem: () => {} }; }
})();
const logger = createLogger({ url: APPS_SCRIPT_URL, storage: safeStorage, fetchFn: (...a) => fetch(...a) });

let data = null;
let student = null;
let session = null; // 한 단원을 푸는 동안의 상태

// ---------- 공통 ----------
const h = (tag, attrs = {}, ...children) => {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === "onclick") el.addEventListener("click", v);
    else if (k === "text") el.textContent = v;
    else if (v !== false && v != null) el.setAttribute(k, v === true ? "" : v);
  }
  for (const c of children.flat()) if (c != null) el.append(c);
  return el;
};
const show = (...nodes) => { app.replaceChildren(...nodes); window.scrollTo(0, 0); };
const go = (hash) => { location.hash = hash; };
const enc = (s) => encodeURIComponent(s);

function loadStudent() {
  try { return JSON.parse(safeStorage.getItem("student") || "null"); } catch { return null; }
}
function saveStudent(s) {
  try { safeStorage.setItem("student", JSON.stringify(s)); } catch { /* 이번 접속에서만 기억 */ }
}
function renderWho() {
  document.getElementById("who").textContent = student ? `${student.반}반 ${student.번호}번 ${student.이름}` : "";
}

// ---------- 시작 ----------
function startView() {
  const s = student || {};
  const field = (label, name, type = "text") =>
    h("label", {}, label, h("input", { name, type, required: true, value: s[label] || "", autocomplete: "off" }));
  const form = h("div", { class: "form" }, field("반", "ban", "number"), field("번호", "num", "number"), field("이름", "name"));
  const submit = h("button", { class: "btn", type: "submit" }, "시작하기");
  const wrap = h("form", {}, form, submit);
  wrap.addEventListener("submit", (e) => {
    e.preventDefault();
    const f = new FormData(wrap);
    const next = { 반: String(f.get("ban")).trim(), 번호: String(f.get("num")).trim(), 이름: String(f.get("name")).trim() };
    if (!next.반 || !next.번호 || !next.이름) return;
    student = next;
    saveStudent(student);
    renderWho();
    go("#/units");
  });
  show(h("section", { class: "card narrow" },
    h("h1", { text: "수능 국어 기출 자습" }),
    h("p", { class: "sub", text: "반·번호·이름을 입력하면 풀이 결과가 선생님께 전달됩니다." }),
    wrap));
}

// ---------- 단원 ----------
function unitsView() {
  const sections = SUBJECTS.map(({ name, units }) => {
    const buttons = [];
    for (const unit of units) {
      const subs = data.units.filter((u) => u.subject === name && u.unit === unit);
      if (!subs.length) {
        buttons.push(h("button", { class: "unit", disabled: true }, unit, h("small", { text: "준비 중" })));
        continue;
      }
      for (const u of subs) {
        const key = `${u.subject}/${u.unit}/${u.subunit}`;
        const n = suneungSets(data, key).length;
        buttons.push(h("button", { class: "unit", disabled: n === 0, onclick: () => go(`#/u/${enc(key)}`) },
          h("span", { class: "unit-path", text: `${u.unit} › ` }), u.subunit,
          h("small", { text: n ? `수능 기출 ${n}세트` : "준비 중" })));
      }
    }
    return h("div", { class: "subject" }, h("h2", { text: name }), h("div", { class: "units" }, buttons));
  });
  show(h("section", {}, h("h1", { text: "단원 선택" }),
    h("p", { class: "sub", text: "2022 개정 교육과정(2028학년도 수능) 기준 단원입니다." }), sections));
}

// ---------- 개념 ----------
function conceptView(key) {
  const u = data.units.find((x) => `${x.subject}/${x.unit}/${x.subunit}` === key);
  if (!u) return go("#/units");
  show(h("section", { class: "card narrow" },
    h("div", { class: "unit-path", text: `${u.subject} › ${u.unit}` }),
    h("h1", { text: u.subunit }),
    h("h2", { text: "성취기준" }),
    u.standards.map((c) => h("div", { class: "std" }, h("code", { text: c }), data.standards[c] || "")),
    h("h2", { text: "수능 출제 경향" }),
    h("p", { class: "trend", text: u.trend }),
    h("h2", { text: "핵심 키워드" }),
    h("div", { class: "chips" }, u.keywords.map((k) => h("span", { class: "chip", text: k }))),
    h("h2", { text: "학습 포인트" }),
    h("ul", { class: "points" }, u.points.map((p) => h("li", { text: p }))),
    h("div", { class: "row", style: "margin-top:20px" },
      h("button", { class: "btn", onclick: () => startSession(key) }, "수능 문제 풀기"),
      h("button", { class: "btn ghost", onclick: () => go("#/units") }, "단원 목록"))));
}

// ---------- 풀이 ----------
function startSession(key) {
  session = { key, suneung: suneungSets(data, key), idx: 0, done: new Set(), history: [] };
  if (!session.suneung.length) return show(h("p", { class: "empty", text: "이 단원의 수능 기출이 아직 없습니다." }));
  beginSet(session.suneung[0], "수능");
}

function beginSet(set, stage) {
  session.set = set;
  session.stage = stage;
  session.items = itemsInUnit(set, session.key);
  session.pos = 0;
  session.results = [];
  session.done.add(set.set_id);
  renderQuestion();
}

function renderQuestion() {
  const { set, stage, items, pos } = session;
  const item = items[pos];
  let picked = null;
  const choiceBtns = [1, 2, 3, 4, 5].map((n) =>
    h("button", { class: "choice", "aria-pressed": "false", "aria-label": `${n}번`, onclick: () => pick(n) }, "①②③④⑤"[n - 1]));
  const grade = h("button", { class: "btn", disabled: true, onclick: () => check() }, "채점하기");
  const panel = h("div", { class: "question" },
    h("img", { src: item.q_img, alt: `${set.exam_title} ${item.q_no}번 문제` }),
    h("div", { class: "choices" }, choiceBtns),
    h("div", { class: "row" }, grade),
    h("div", { class: "meta", text: `문항 유형: ${item.qtype}` }));

  function pick(n) {
    picked = n;
    choiceBtns.forEach((b, i) => b.setAttribute("aria-pressed", String(i + 1 === n)));
    grade.disabled = false;
  }
  function check() {
    const correct = picked === item.answer;
    choiceBtns.forEach((b, i) => {
      b.disabled = true;
      if (i + 1 === item.answer) b.classList.add("correct");
      else if (i + 1 === picked) b.classList.add("wrong");
    });
    grade.remove();
    session.results.push({ item_id: item.item_id, correct, qtype: item.qtype });
    session.history.push({ stage, source: `${set.exam_title} ${item.q_no}번`, correct, qtype: item.qtype });
    logger.logResult({
      시각: new Date().toLocaleString("ko-KR"), 반: student.반, 번호: student.번호, 이름: student.이름,
      과목: item.subject, 단원: item.unit, 소단원: item.subunit, 단계: stage, 시험명: set.exam_title,
      문항: item.q_no, 고른답: picked, 정답: item.answer, 정오: correct ? "O" : "X",
    });
    const last = session.pos === session.items.length - 1;
    panel.prepend(h("div", { class: `feedback ${correct ? "ok" : "bad"}`,
      text: correct ? "정답입니다!" : `아쉬워요. 정답은 ${"①②③④⑤"[item.answer - 1]}입니다.` }));
    panel.append(h("div", { class: "row", style: "margin-top:12px" },
      h("button", { class: "btn", onclick: () => (last ? finishSet() : (session.pos++, renderQuestion())) },
        last ? "세트 마치기" : "다음 문항")));
  }

  const stageLabel = { 수능: "수능 기출", 기본: "기본 문제", 심화: "심화 문제" }[stage];
  show(
    h("div", { class: "crumb" },
      h("span", { class: "stage", text: stageLabel }),
      h("span", { text: session.key.split("/").slice(1).join(" › ") }),
      h("span", { text: set.source }),
      h("span", { text: `${pos + 1} / ${items.length}` })),
    h("div", { class: "solve" },
      set.set_img ? h("div", { class: "passage" }, h("img", { src: set.set_img, alt: "지문" })) : null,
      panel));
}

function finishSet() {
  if (session.stage === "수능") {
    const stage = nextStage(session.results);
    const wrongTypes = session.results.filter((r) => !r.correct).map((r) => r.qtype);
    const follow = pickFollowUp(data, session.key, stage, wrongTypes, session.done);
    const msg = stage === "심화"
      ? "수능 세트를 모두 맞혔어요! 같은 주제의 심화 문제에 도전해 볼까요?"
      : "틀린 문항이 있어요. 같은 주제의 기본 문제로 개념을 다시 확인해 봅시다.";
    if (follow) {
      return show(h("section", { class: "card narrow" }, h("p", { class: "notice", text: msg }),
        h("button", { class: "btn", onclick: () => beginSet(follow, stage) }, `${stage} 문제 풀기`)));
    }
  }
  summaryView();
}

function summaryView() {
  const nextSuneung = session.suneung[session.idx + 1];
  const wrong = session.history.filter((r) => !r.correct);
  const qtypes = [...new Set(wrong.map((r) => r.qtype))];
  const moreStage = session.stage === "수능" ? "기본" : session.stage;
  const more = pickFollowUp(data, session.key, moreStage, qtypes, session.done);
  show(h("section", { class: "card narrow" },
    h("h1", { text: "학습 결과" }),
    h("p", { class: "sub", text: `${session.key.split("/").slice(1).join(" › ")} · ${session.history.length}문항 중 ${session.history.length - wrong.length}문항 정답` }),
    h("ul", { class: "result-list" }, session.history.map((r) =>
      h("li", {}, h("span", { text: `[${r.stage}] ${r.source}` }),
        h("span", { class: `mark ${r.correct ? "ok" : "bad"}`, text: r.correct ? "O" : "X" })))),
    qtypes.length ? h("p", { class: "notice", text: `다시 볼 문항 유형: ${qtypes.join(", ")}` }) : null,
    h("div", { class: "row", style: "margin-top:16px" },
      nextSuneung ? h("button", { class: "btn", onclick: () => { session.idx++; beginSet(nextSuneung, "수능"); } }, "다음 수능 세트") : null,
      more ? h("button", { class: "btn ghost", onclick: () => beginSet(more, moreStage) }, "같은 단계 더 풀기") : null,
      h("button", { class: "btn ghost", onclick: () => go(`#/u/${enc(session.key)}`) }, "개념 다시 보기"),
      h("button", { class: "btn ghost", onclick: () => go("#/units") }, "다른 단원"))));
}

// ---------- 라우팅 ----------
function route() {
  if (!student) return startView();
  const m = location.hash.match(/^#\/u\/(.+)$/);
  if (m) return conceptView(decodeURIComponent(m[1]));
  if (location.hash === "#/start") return startView();
  return unitsView();
}

async function main() {
  student = loadStudent();
  renderWho();
  try {
    data = await (await fetch("data/korean.json")).json();
  } catch {
    return show(h("p", { class: "empty", text: "문제 데이터를 불러오지 못했습니다. 잠시 후 새로고침해 주세요." }));
  }
  window.addEventListener("hashchange", route);
  window.addEventListener("online", () => logger.flushQueue());
  logger.flushQueue();
  route();
}

main();
