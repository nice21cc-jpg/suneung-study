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

// 같은 소단원·같은 난이도의 모의고사 세트 중 틀린 유형과 겹치는 세트를 먼저, 그다음 최신 시험 순
export function pickFollowUp(data, unitKey, stage, wrongQtypes, doneSetIds) {
  const wrong = new Set(wrongQtypes);
  const candidates = data.sets
    .filter((s) => s.kind !== "수능" && !doneSetIds.has(s.set_id))
    .map((s) => ({ s, items: itemsInUnit(s, unitKey).filter((i) => i.level === stage) }))
    .filter(({ items }) => items.length > 0)
    .map(({ s, items }) => ({ s, hit: items.some((i) => wrong.has(i.qtype)) ? 1 : 0 }));
  candidates.sort((a, b) => b.hit - a.hit || newestFirst(a.s, b.s));
  return candidates.length ? candidates[0].s : null;
}
