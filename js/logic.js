// 학습 흐름의 순수 로직: 화면·저장소에 의존하지 않는다 (node --test 대상)

export const unitKeyOf = (item) => `${item.subject}/${item.unit}/${item.subunit}`;

export function itemsInUnit(set, unitKey) {
  return set.items.filter((i) => unitKeyOf(i) === unitKey);
}

const newestFirst = (a, b) => b.exam_id.localeCompare(a.exam_id);

export function suneungSets(data, unitKey) {
  return data.sets
    .filter((s) => s.kind === "수능" && itemsInUnit(s, unitKey).length > 0)
    .sort(newestFirst);
}

// 수능 세트를 모두 맞히면 심화, 하나라도 틀리면 기본
export function nextStage(results) {
  return results.every((r) => r.correct) ? "심화" : "기본";
}

// 과목: 소단원 키의 첫 칸이 "영어"면 영어, 나머지(문학·독서와 작문·화법과 언어)는 국어
export const courseOf = (unitKey) => (unitKey.startsWith("영어/") ? "영어" : "국어");

// 분기 때 이어서 풀 최소 문항 수: 영어는 한 문항짜리 세트가 많아 3문항이 될 때까지 세트를 묶는다
export const FOLLOW_N = { 국어: 1, 영어: 3 };

// 같은 소단원·같은 난이도의 모의고사 세트 중 틀린 유형과 겹치는 세트를 먼저, 그다음 최신 시험 순으로
// 해당 소단원 문항이 n개 이상 될 때까지 고른다
export function pickFollowUps(data, unitKey, stage, wrongQtypes, doneSetIds, n) {
  const wrong = new Set(wrongQtypes);
  const candidates = data.sets
    .filter((s) => s.kind !== "수능" && !doneSetIds.has(s.set_id))
    .map((s) => ({ s, items: itemsInUnit(s, unitKey).filter((i) => i.level === stage) }))
    .filter(({ items }) => items.length > 0)
    .map(({ s, items }) => ({ s, hit: items.some((i) => wrong.has(i.qtype)) ? 1 : 0 }));
  candidates.sort((a, b) => b.hit - a.hit || newestFirst(a.s, b.s));
  // 여러 개를 고를 때는 시험이 겹치지 않는 세트를 먼저 채우고, 모자라면 나머지에서 순서대로
  const seen = new Set();
  const spread = [];
  const rest = [];
  for (const { s } of candidates) (seen.has(s.exam_id) ? rest : (seen.add(s.exam_id), spread)).push(s);
  const picked = [];
  let count = 0;
  for (const s of [...spread, ...rest]) {
    if (count >= n) break;
    picked.push(s);
    count += itemsInUnit(s, unitKey).length;
  }
  return picked;
}

export function pickFollowUp(data, unitKey, stage, wrongQtypes, doneSetIds) {
  return pickFollowUps(data, unitKey, stage, wrongQtypes, doneSetIds, 1)[0] ?? null;
}
