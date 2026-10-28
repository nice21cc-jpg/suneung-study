// 채점 결과를 교사 구글 시트(Apps Script 웹앱)로 보낸다.
// 보내지 못한 행은 브라우저 저장소에 두었다가 다음 채점 때 다시 보낸다.
const KEY = "pendingRows";

export function createLogger({ url, storage, fetchFn }) {
  let memory = [];          // 저장소를 쓸 수 없을 때(사생활 보호 모드 등) 대신 쓰는 큐
  let sending = false;

  const read = () => {
    try {
      return JSON.parse(storage.getItem(KEY) || "[]");
    } catch {
      return memory;
    }
  };
  const write = (rows) => {
    memory = rows;
    try {
      storage.setItem(KEY, JSON.stringify(rows));
    } catch {
      /* 메모리 큐만 사용 */
    }
  };

  const enqueue = (row) => write([...read(), row]);

  async function flushQueue() {
    const rows = read();
    if (sending || !url || rows.length === 0) return 0;
    sending = true;
    try {
      // Apps Script는 CORS 응답을 주지 않으므로 no-cors + text/plain으로 보낸다(응답은 읽지 못함)
      await fetchFn(url, {
        method: "POST",
        mode: "no-cors",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify({ rows }),
      });
      write(read().slice(rows.length)); // 보내는 동안 새로 쌓인 행은 남긴다
      return rows.length;
    } catch {
      return 0;
    } finally {
      sending = false;
    }
  }

  return { enqueue, flushQueue, pending: read, logResult: (row) => (enqueue(row), flushQueue()) };
}
