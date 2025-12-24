// 题库检索 + 我的答案保存（localStorage）
// 数据文件：questions.json（由 build_questions.py 生成或手工维护）

const LS_KEY = "myAnswers_v1"; // { [id]: { myAnswer, updatedAt } }

function loadMyAnswers() {
  try { return JSON.parse(localStorage.getItem(LS_KEY) || "{}"); }
  catch { return {}; }
}

function saveMyAnswers(obj) {
  localStorage.setItem(LS_KEY, JSON.stringify(obj));
}

function escapeHtml(s) {
  return (s ?? "").toString()
    .replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;").replaceAll("'", "&#039;");
}

function highlightText(text, query) {
  if (!query) return escapeHtml(text);
  // 简单高亮：按空格分词，对每个词做不区分大小写替换
  let safe = escapeHtml(text);
  const terms = query.trim().split(/\s+/).filter(Boolean).slice(0, 8);
  for (const t of terms) {
    const re = new RegExp(t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "ig");
    safe = safe.replace(re, (m) => `<span class="hl">${m}</span>`);
  }
  return safe;
}

async function loadQuestions() {
  const res = await fetch("./questions.json");
  if (!res.ok) throw new Error("无法加载 questions.json");
  return await res.json();
}

function uniq(arr) { return [...new Set(arr)].filter(Boolean); }

function renderModuleOptions(modules) {
  const sel = document.getElementById("moduleFilter");
  const current = sel.value;
  sel.innerHTML = '<option value="">全部模块</option>' + modules.map(m => `<option value="${escapeHtml(m)}">${escapeHtml(m)}</option>`).join("");
  sel.value = modules.includes(current) ? current : "";
}

function typeLabel(t){
  return ({single:"单选",multi:"多选",short:"简答",case:"案例",practice:"实操"}[t] || "其他");
}

function makeItem(q, active, query){
  const head = `#${q.number ?? ""} ${q.module ? "· "+q.module : ""}`;
  const preview = (q.stem || "").slice(0, 80).replace(/\s+/g," ").trim();
  return `
    <div class="item ${active ? "active":""}" data-id="${escapeHtml(q.id)}">
      <div class="muted">${escapeHtml(head)}</div>
      <div style="margin-top:6px"><span class="badge">${typeLabel(q.type)}</span>
        <span>${highlightText(preview, query)}${preview.length>=80?"…":""}</span>
      </div>
    </div>
  `;
}

function renderDetail(q, myState){
  const sources = (q.source || []).map(s => `- ${s.file}${(s.page!=null)?(" · p."+s.page):""}`).join("\n");
  const my = (myState[q.id]?.myAnswer) ?? (q.myAnswer ?? "");
  const updatedAt = myState[q.id]?.updatedAt || q.updatedAt || "";
  return `
    <div class="pill" style="justify-content:space-between;align-items:flex-start">
      <div>
        <span class="badge">${typeLabel(q.type)}</span>
        <span class="k">题号</span> ${escapeHtml(q.number ?? "")}
        ${q.module ? ` · <span class="k">模块</span> ${escapeHtml(q.module)}` : ""}
      </div>
      <div class="muted">我的答案更新时间：${escapeHtml(updatedAt || "—")}</div>
    </div>

    <div class="hr"></div>

    <div class="k">原题</div>
    <div class="stem" style="margin-top:8px">${escapeHtml(q.stem || "")}</div>

    ${q.options ? `
      <div class="hr"></div>
      <div class="k">选项</div>
      <div class="stem" style="margin-top:8px">${escapeHtml(q.options)}</div>
    ` : ""}

    <div class="hr"></div>
    <div class="k">标准/参考答案</div>
    <div class="answer" style="margin-top:8px">${escapeHtml(q.standardAnswer || "（暂无）")}</div>

    <div class="hr"></div>
    <div class="k">我的答案（可编辑，自动保存）</div>
    <textarea id="myAnswer" placeholder="在这里写你的答案…">${escapeHtml(my)}</textarea>
    <div class="row" style="margin-top:10px">
      <button id="copyStem">复制题干</button>
      <button id="copyStd">复制标准答案</button>
      <button id="clearMine">清空我的答案</button>
      <span class="muted">来源：\n${escapeHtml(sources || "—")}</span>
    </div>
  `;
}

function download(filename, text) {
  const blob = new Blob([text], {type: "application/json;charset=utf-8"});
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

(async function main(){
  const qInput = document.getElementById("q");
  const listEl = document.getElementById("list");
  const detailEl = document.getElementById("detail");
  const statsEl = document.getElementById("stats");
  const resultCountEl = document.getElementById("resultCount");
  const typeFilterEl = document.getElementById("typeFilter");
  const moduleFilterEl = document.getElementById("moduleFilter");
  const exportBtn = document.getElementById("exportBtn");
  const importBtn = document.getElementById("importBtn");
  const importFile = document.getElementById("importFile");

  const questions = await loadQuestions();
  const modules = uniq(questions.map(q => q.module));
  renderModuleOptions(modules);

  const myState = loadMyAnswers();
  let activeId = null;

  const fuse = new Fuse(questions, {
    keys: [
      {name: "stem", weight: 0.65},
      {name: "standardAnswer", weight: 0.20},
      {name: "module", weight: 0.10},
      {name: "number", weight: 0.05},
    ],
    threshold: 0.38,
    ignoreLocation: true,
    minMatchCharLength: 2,
    includeScore: true,
  });

  function getFilteredResults(query){
    let base = [];
    if (!query.trim()) base = questions.map(q => ({item:q, score: 0}));
    else base = fuse.search(query).slice(0, 200);

    const typeVal = typeFilterEl.value;
    const modVal = moduleFilterEl.value;

    const filtered = base.map(x => x.item).filter(q => {
      if (typeVal && q.type !== typeVal) return false;
      if (modVal && q.module !== modVal) return false;
      return true;
    });

    return filtered;
  }

  function renderList(items, query){
    listEl.innerHTML = items.map(q => makeItem(q, q.id===activeId, query)).join("") || '<div class="muted">没有结果</div>';
    resultCountEl.textContent = items.length ? `共 ${items.length} 题` : "";
  }

  function setActive(id){
    activeId = id;
    const q = questions.find(x => x.id === id);
    if (!q) return;
    detailEl.innerHTML = renderDetail(q, myState);

    const ta = document.getElementById("myAnswer");
    ta.addEventListener("input", () => {
      myState[id] = { myAnswer: ta.value, updatedAt: new Date().toISOString() };
      saveMyAnswers(myState);
      // 更新时间显示
      const m = detailEl.querySelector(".muted");
      if (m) m.textContent = "我的答案更新时间：" + myState[id].updatedAt;
    });

    document.getElementById("copyStem").onclick = async () => {
      await navigator.clipboard.writeText(q.stem || "");
      alert("已复制题干");
    };
    document.getElementById("copyStd").onclick = async () => {
      await navigator.clipboard.writeText(q.standardAnswer || "");
      alert("已复制标准答案");
    };
    document.getElementById("clearMine").onclick = () => {
      ta.value = "";
      myState[id] = { myAnswer: "", updatedAt: new Date().toISOString() };
      saveMyAnswers(myState);
    };
  }

  function refresh(){
    const query = qInput.value || "";
    const items = getFilteredResults(query);
    // 如果当前 active 不在列表里，自动切到第一题
    renderList(items, query);
    if (items.length && (!activeId || !items.some(x => x.id === activeId))) {
      setActive(items[0].id);
      renderList(items, query);
    }
    statsEl.textContent = `题库：${questions.length} 题；已保存我的答案：${Object.keys(myState).length} 题`;
  }

  listEl.addEventListener("click", (e) => {
    const el = e.target.closest(".item");
    if (!el) return;
    setActive(el.dataset.id);
    refresh();
  });

  qInput.addEventListener("input", refresh);
  typeFilterEl.addEventListener("change", refresh);
  moduleFilterEl.addEventListener("change", refresh);

  exportBtn.addEventListener("click", () => {
    download("myAnswers.json", JSON.stringify(myState, null, 2));
  });

  importBtn.addEventListener("click", () => importFile.click());
  importFile.addEventListener("change", async () => {
    const f = importFile.files?.[0];
    if (!f) return;
    const text = await f.text();
    try {
      const obj = JSON.parse(text);
      // 合并导入（覆盖同 id）
      for (const [k,v] of Object.entries(obj)) myState[k] = v;
      saveMyAnswers(myState);
      alert("导入成功！");
      refresh();
    } catch (err) {
      alert("导入失败：不是合法 JSON");
    } finally {
      importFile.value = "";
    }
  });

  // 初次渲染
  refresh();
})();
