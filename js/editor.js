/* 範本編輯頁（管理者用） */
(function () {
  "use strict";
  const $ = (s, r = document) => r.querySelector(s);
  const SW = ["#FFFFFF", "#000000", "#F7D774", "#D4433B", "#B4232A", "#1E9E6A", "#2D6CDF", "#E9569B"];
  const FONTS_DEFAULT = [
    { family: "Noto Sans SC", label: "思源黑體(簡)" },
    { family: "Noto Serif SC", label: "思源宋體(簡)" },
    { family: "Ma Shan Zheng", label: "馬善政毛筆" },
    { family: "ZCOOL KuaiLe", label: "站酷快樂體" },
    { family: "Long Cang", label: "龍藏草書" },
  ];
  const FONTS_HREF = "https://fonts.googleapis.com/css2?family=Noto+Sans+SC:wght@400;500;700;900&family=Noto+Serif+SC:wght@400;700;900&family=Ma+Shan+Zheng&family=ZCOOL+KuaiLe&family=Long+Cang&display=swap";

  let meta = { month: "", fonts: FONTS_DEFAULT, googleFontsHref: FONTS_HREF };
  let templates = [];         // 全部範本
  let cur = null;             // 目前編輯中的範本
  let sel = -1;               // 選取的文字框
  let videoURL = null;

  function blankTemplate() {
    return { id: "tpl-" + Date.now().toString(36), name: "", desc: "", thumb: "",
      driveUrl: "", videoFile: "", width: 0, height: 0, fields: [] };
  }
  function blankField(type) {
    return { type, label: type === "name" ? "收件人名字" : "賀語",
      default: type === "name" ? "" : "新春快樂 · 萬事如意", placeholder: "",
      xf: 0.5, yf: 0.5, sizef: 0.1, font: "Ma Shan Zheng", weight: 700,
      color: "#F7D774", align: "center",
      stroke: { color: "#7A1F1F", widthf: 0.004 },
      shadow: { color: "#000000", blurf: 0.006, xf: 0, yf: 0.004 } };
  }

  async function boot() {
    GC.ensureFontsCss(FONTS_HREF);
    cur = blankTemplate();
    fillFontSelect();
    renderAll();
    wire();
    loadPublishSettings();
    await loadLive();       // 自動載入目前線上的 templates.json（免手動匯入）
    restoreDraftPrompt();   // 若有未發布草稿，提示還原
  }

  // 開啟編輯頁時自動抓現行 templates.json
  async function loadLive() {
    try {
      const j = await fetch("templates.json?_=" + Date.now()).then((r) => (r.ok ? r.json() : null));
      if (j) {
        meta.month = j.month || meta.month;
        meta.fonts = j.fonts || meta.fonts;
        meta.googleFontsHref = j.googleFontsHref || meta.googleFontsHref;
        templates = j.templates || [];
        $("#mMonth").value = meta.month;
        renderTemplateList();
        GC.toast(`已自動載入目前線上範本（${templates.length} 個）`, "ok");
      }
    } catch (e) { /* 首次部署可能還沒有檔案，忽略 */ }
  }

  /* ---- 草稿自動保存（localStorage）---- */
  function saveDraft() {
    try { localStorage.setItem("gcv_draft", JSON.stringify({ month: $("#mMonth").value, fonts: meta.fonts, googleFontsHref: meta.googleFontsHref, templates })); } catch (e) {}
  }
  function restoreDraftPrompt() {
    let d; try { d = JSON.parse(localStorage.getItem("gcv_draft") || "null"); } catch (e) {}
    if (d && d.templates && JSON.stringify(d.templates) !== JSON.stringify(templates)) {
      $("#draftBar").classList.remove("hide");
      $("#draftRestore").onclick = () => {
        templates = d.templates; meta.month = d.month || meta.month;
        $("#mMonth").value = meta.month; renderTemplateList();
        $("#draftBar").classList.add("hide"); GC.toast("已還原未發布草稿", "ok");
      };
      $("#draftDismiss").onclick = () => $("#draftBar").classList.add("hide");
    }
  }

  /* ---- 一鍵發布到 GitHub（免手動放根目錄）---- */
  function buildJSON() {
    meta.month = $("#mMonth").value.trim();
    return { month: meta.month, note: "由範本編輯頁匯出/發布。座標/字級/描邊/陰影皆為相對影片尺寸的比例。",
      fonts: meta.fonts, googleFontsHref: meta.googleFontsHref, templates };
  }
  function pgCfg() {
    return { owner: $("#pgOwner").value.trim(), repo: $("#pgRepo").value.trim(),
      branch: $("#pgBranch").value.trim() || "main", path: $("#pgPath").value.trim() || "templates.json",
      token: $("#pgToken").value.trim() };
  }
  function savePublishSettings() {
    const c = pgCfg();
    localStorage.setItem("gcv_pub", JSON.stringify({ owner: c.owner, repo: c.repo, branch: c.branch, path: c.path }));
    if ($("#pgRemember").checked) localStorage.setItem("gcv_tok", c.token);
    else localStorage.removeItem("gcv_tok");
  }
  function loadPublishSettings() {
    try {
      const s = JSON.parse(localStorage.getItem("gcv_pub") || "null");
      if (s) { $("#pgOwner").value = s.owner || "mktcycy"; $("#pgRepo").value = s.repo || "greeting-card-video"; $("#pgBranch").value = s.branch || "main"; $("#pgPath").value = s.path || "templates.json"; }
      const t = localStorage.getItem("gcv_tok");
      if (t) { $("#pgToken").value = t; $("#pgRemember").checked = true; }
    } catch (e) {}
  }
  function clearToken() { localStorage.removeItem("gcv_tok"); $("#pgToken").value = ""; $("#pgRemember").checked = false; GC.toast("已清除本機 token", "ok"); }

  async function publish() {
    const c = pgCfg();
    if (!c.owner || !c.repo || !c.token) { GC.toast("請填 GitHub 帳號、repo 與 token", "warn"); return; }
    if (!templates.length && !confirm("目前沒有任何範本，確定要發布（會清空線上範本）？")) return;
    savePublishSettings();
    const btn = $("#pgPublish"); btn.disabled = true; btn.innerHTML = `<span class="spinner"></span> 發布中…`;
    const api = `https://api.github.com/repos/${c.owner}/${c.repo}/contents/${encodeURIComponent(c.path)}`;
    const H = { Authorization: "Bearer " + c.token, Accept: "application/vnd.github+json" };
    const content = btoa(unescape(encodeURIComponent(JSON.stringify(buildJSON(), null, 2))));
    try {
      let sha;
      const g = await fetch(`${api}?ref=${encodeURIComponent(c.branch)}`, { headers: H });
      if (g.ok) sha = (await g.json()).sha;         // 已存在→更新；404→新建
      const put = await fetch(api, { method: "PUT", headers: H,
        body: JSON.stringify({ message: "更新 templates.json（範本編輯頁）", content, branch: c.branch, sha }) });
      if (put.ok) {
        saveDraft();
        GC.toast("✓ 已發布到網站！GitHub Pages 約幾十秒後自動更新", "ok", 6000);
      } else {
        const e = await put.json().catch(() => ({}));
        const msg = put.status === 401 ? "token 無效或過期" : put.status === 403 ? "token 權限不足（需該 repo 的 contents 寫入權）" : put.status === 404 ? "找不到 repo/branch，請確認設定" : (e.message || put.status);
        GC.toast("發布失敗：" + msg, "err", 7000);
      }
    } catch (e) { GC.toast("發布失敗：" + e.message, "err", 6000); }
    finally { btn.disabled = false; btn.textContent = "發布到網站"; }
  }

  /* ---- 影片上傳 ---- */
  function onVideo(file) {
    if (!file) return;
    if (videoURL) URL.revokeObjectURL(videoURL);
    videoURL = URL.createObjectURL(file);
    const v = $("#edVideo");
    v.src = videoURL;
    v.onloadedmetadata = () => {
      cur.width = v.videoWidth;
      cur.height = v.videoHeight;
      cur.videoFile = file.name;
      $("#mVideoFile").value = file.name;
      $("#resTag").textContent = `${v.videoWidth}×${v.videoHeight}`;
      $("#stageWrap").classList.remove("hide");
      // 自動擷取縮圖
      v.currentTime = Math.min(0.5, (v.duration || 1) / 3);
    };
    v.onseeked = () => { if (!cur.thumb) captureThumb(); };
  }
  function captureThumb() {
    const v = $("#edVideo");
    const c = document.createElement("canvas");
    const w = 480, h = Math.round((v.videoHeight / v.videoWidth) * 480) || 270;
    c.width = w; c.height = h;
    c.getContext("2d").drawImage(v, 0, 0, w, h);
    cur.thumb = c.toDataURL("image/jpeg", 0.72);
    GC.toast("已自動擷取縮圖", "ok");
  }

  /* ---- 文字框 ---- */
  function addField(type) {
    if (!cur.width) { GC.toast("請先上傳影片", "warn"); return; }
    cur.fields.push(blankField(type));
    sel = cur.fields.length - 1;
    renderStage(); renderFieldList(); renderProps();
  }
  function delField() {
    if (sel < 0) return;
    cur.fields.splice(sel, 1); sel = -1;
    renderStage(); renderFieldList(); renderProps();
  }

  function renderStage() {
    const layer = $("#edLayer");
    layer.innerHTML = "";
    const H = $("#edVideo").clientHeight || 1, W = $("#edVideo").clientWidth || 1;
    cur.fields.forEach((f, i) => {
      const d = document.createElement("div");
      d.className = "edbox" + (i === sel ? " sel" : "");
      d.textContent = f.default || (f.type === "name" ? "〔名字〕" : "〔賀語〕");
      d.style.left = f.xf * 100 + "%";
      d.style.top = f.yf * 100 + "%";
      d.style.fontFamily = `"${f.font}","Noto Sans SC",sans-serif`;
      d.style.fontSize = f.sizef * H + "px";
      d.style.fontWeight = f.weight;
      d.style.color = f.color;
      d.style.textAlign = f.align;
      if (f.stroke && f.stroke.widthf > 0) {
        d.style.webkitTextStroke = `${f.stroke.widthf * H}px ${f.stroke.color}`;
        d.style.paintOrder = "stroke fill";
      }
      if (f.shadow && f.shadow.color)
        d.style.textShadow = `${(f.shadow.xf || 0) * W}px ${(f.shadow.yf || 0) * H}px ${(f.shadow.blurf || 0) * H}px ${f.shadow.color}`;
      d.onmousedown = (e) => startDrag(e, i);
      layer.appendChild(d);
    });
  }
  function startDrag(e, i) {
    e.preventDefault();
    sel = i; renderFieldList(); renderProps();
    const stage = $("#edVideo"), rect = stage.getBoundingClientRect();
    const move = (ev) => {
      const x = (ev.clientX - rect.left) / rect.width;
      const y = (ev.clientY - rect.top) / rect.height;
      cur.fields[i].xf = Math.min(1, Math.max(0, x));
      cur.fields[i].yf = Math.min(1, Math.max(0, y));
      renderStage();
    };
    const up = () => { document.removeEventListener("mousemove", move); document.removeEventListener("mouseup", up); };
    document.addEventListener("mousemove", move);
    document.addEventListener("mouseup", up);
  }

  function renderFieldList() {
    const box = $("#fieldList");
    box.innerHTML = "";
    cur.fields.forEach((f, i) => {
      const r = document.createElement("div");
      r.className = "fieldrow" + (i === sel ? " sel" : "");
      r.innerHTML = `<span class="tag">${f.type === "name" ? "名字" : "賀語"}</span><span></span>`;
      r.querySelector("span:last-child").textContent = f.label || f.default || "(未命名)";
      r.onclick = () => { sel = i; renderStage(); renderFieldList(); renderProps(); };
      box.appendChild(r);
    });
    if (!cur.fields.length) box.innerHTML = `<div class="muted">尚無文字框，點上方按鈕新增。</div>`;
  }

  function renderProps() {
    const p = $("#props");
    if (sel < 0) { p.innerHTML = `<div class="muted">選一個文字框來編輯樣式，或新增文字框。</div>`; return; }
    const f = cur.fields[sel];
    const fontOpts = meta.fonts.map((o) => `<option value="${o.family}" ${o.family === f.font ? "selected" : ""}>${o.label}</option>`).join("");
    p.innerHTML = `
      <div class="field"><label>欄位類型</label>
        <select data-k="type"><option value="name" ${f.type === "name" ? "selected" : ""}>名字欄位（專員必填）</option>
        <option value="greeting" ${f.type === "greeting" ? "selected" : ""}>固定賀語（可預填）</option></select></div>
      <div class="field"><label>欄位標題</label><input class="input" data-k="label" value="${esc(f.label)}"></div>
      <div class="field"><label>預設文字</label><input class="input" data-k="default" value="${esc(f.default)}"></div>
      <div class="field"><label>字體</label><select data-k="font">${fontOpts}</select></div>
      <div class="grid2">
        <div class="field"><label>字級 <span class="mono" id="szv">${(f.sizef*100).toFixed(1)}%</span></label>
          <input type="range" min="1" max="30" step="0.5" value="${f.sizef*100}" data-k="sizef"></div>
        <div class="field"><label>粗細</label><select data-k="weight">
          ${[400,500,700,900].map(w=>`<option value="${w}" ${f.weight==w?"selected":""}>${w}</option>`).join("")}</select></div>
      </div>
      <div class="field"><label>對齊</label><select data-k="align">
        ${["center","left","right"].map(a=>`<option value="${a}" ${f.align==a?"selected":""}>${a}</option>`).join("")}</select></div>
      <div class="field"><label>文字顏色</label><div class="row"><input type="color" data-k="color" value="${f.color}"><input class="input mono" data-k="color" value="${f.color}"></div>
        <div class="swatches">${SW.map(c=>`<span class="sw" style="background:${c}" data-sw="color" data-c="${c}"></span>`).join("")}</div></div>
      <div class="grid2">
        <div class="field"><label>描邊顏色</label><input type="color" data-k="stroke.color" value="${f.stroke.color}"></div>
        <div class="field"><label>描邊粗細 <span class="mono">${(f.stroke.widthf*100).toFixed(2)}%</span></label>
          <input type="range" min="0" max="2" step="0.1" value="${f.stroke.widthf*100}" data-k="stroke.widthf"></div>
      </div>
      <div class="grid2">
        <div class="field"><label>陰影顏色</label><input type="color" data-k="shadow.color" value="${f.shadow.color}"></div>
        <div class="field"><label>陰影模糊 <span class="mono">${(f.shadow.blurf*100).toFixed(2)}%</span></label>
          <input type="range" min="0" max="3" step="0.1" value="${f.shadow.blurf*100}" data-k="shadow.blurf"></div>
      </div>
      <div class="grid2">
        <div class="field"><label>陰影 X <span class="mono">${((f.shadow.xf||0)*100).toFixed(1)}%</span></label>
          <input type="range" min="-5" max="5" step="0.2" value="${(f.shadow.xf||0)*100}" data-k="shadow.xf"></div>
        <div class="field"><label>陰影 Y <span class="mono">${((f.shadow.yf||0)*100).toFixed(1)}%</span></label>
          <input type="range" min="-5" max="5" step="0.2" value="${(f.shadow.yf||0)*100}" data-k="shadow.yf"></div>
      </div>
      <button class="btn" data-act="delField" style="color:var(--brand)">刪除此文字框</button>`;
    // wire property controls
    p.querySelectorAll("[data-k]").forEach((el) => {
      el.oninput = () => setProp(el.dataset.k, el.type === "range" ? +el.value : el.value, el);
    });
    p.querySelectorAll("[data-sw]").forEach((el) => {
      el.onclick = () => setProp(el.dataset.sw, el.dataset.c);
    });
    p.querySelector('[data-act="delField"]').onclick = delField;
  }
  function setProp(key, val, srcEl) {
    const f = cur.fields[sel];
    // range 存成比例(除以100)
    if (["sizef", "stroke.widthf", "shadow.blurf", "shadow.xf", "shadow.yf"].includes(key)) val = val / 100;
    if (key.includes(".")) { const [a, b] = key.split("."); f[a][b] = val; }
    else f[key] = val;
    renderStage(); renderFieldList();
    // 若改的是需要重繪整個 props 的（type），重繪；其餘只更新舞台避免游標跳動
    if (key === "type") renderProps();
    else if (srcEl && srcEl.previousElementSibling && srcEl.parentElement) {
      const lbl = srcEl.closest(".field") && srcEl.closest(".field").querySelector(".mono");
      // 更新旁邊數值顯示
      const map = { "sizef": (f.sizef*100).toFixed(1)+"%", "stroke.widthf": (f.stroke.widthf*100).toFixed(2)+"%",
        "shadow.blurf": (f.shadow.blurf*100).toFixed(2)+"%", "shadow.xf": ((f.shadow.xf||0)*100).toFixed(1)+"%",
        "shadow.yf": ((f.shadow.yf||0)*100).toFixed(1)+"%" };
      if (lbl && map[key] != null) lbl.textContent = map[key];
    }
    // 同步 color 的 text 與 color input
    if (key === "color") document.querySelectorAll('[data-k="color"]').forEach((e) => (e.value = val));
  }

  /* ---- 範本清單 / 匯入匯出 ---- */
  function saveTemplate() {
    if (!cur.width) { GC.toast("請先上傳影片", "warn"); return; }
    cur.name = $("#mName").value.trim();
    cur.desc = $("#mDesc").value.trim();
    cur.driveUrl = $("#mDrive").value.trim();
    if (!cur.name) { GC.toast("請填範本名稱", "warn"); return; }
    if (!cur.driveUrl) { GC.toast("請填 Google Drive 分享連結", "warn"); return; }
    const idx = templates.findIndex((t) => t.id === cur.id);
    if (idx >= 0) templates[idx] = deep(cur); else templates.push(deep(cur));
    saveDraft();
    GC.toast("已儲存到清單（可按『發布到網站』一鍵更新，或匯出）", "ok");
    renderTemplateList();
  }
  function newTemplate() {
    cur = blankTemplate(); sel = -1;
    $("#mName").value = ""; $("#mDesc").value = ""; $("#mDrive").value = ""; $("#mVideoFile").value = "";
    $("#resTag").textContent = ""; $("#stageWrap").classList.add("hide");
    if (videoURL) { URL.revokeObjectURL(videoURL); videoURL = null; }
    $("#edVideo").removeAttribute("src");
    renderStage(); renderFieldList(); renderProps();
  }
  function editTemplate(id) {
    const t = templates.find((x) => x.id === id);
    if (!t) return;
    cur = deep(t); sel = -1;
    $("#mName").value = cur.name; $("#mDesc").value = cur.desc; $("#mDrive").value = cur.driveUrl;
    $("#mVideoFile").value = cur.videoFile; $("#resTag").textContent = cur.width ? `${cur.width}×${cur.height}` : "";
    GC.toast("已載入範本，重新上傳同一支影片即可預覽定位", "ok", 4200);
    $("#stageWrap").classList.add("hide");
    renderStage(); renderFieldList(); renderProps();
  }
  function delTemplate(id) {
    templates = templates.filter((t) => t.id !== id);
    saveDraft();
    renderTemplateList();
  }
  function renderTemplateList() {
    const box = $("#tplList");
    box.innerHTML = "";
    templates.forEach((t) => {
      const r = document.createElement("div");
      r.className = "fieldrow";
      r.innerHTML = `<span class="tag">${t.width}×${t.height}</span><span style="flex:1"></span>
        <button class="btn" data-e="1">編輯</button><button class="btn" data-d="1" style="color:var(--brand)">刪</button>`;
      r.querySelector("span:nth-child(2)").textContent = t.name || t.id;
      r.querySelector("[data-e]").onclick = () => editTemplate(t.id);
      r.querySelector("[data-d]").onclick = () => delTemplate(t.id);
      box.appendChild(r);
    });
    if (!templates.length) box.innerHTML = `<div class="muted">尚無範本。設定好一個後按「儲存到清單」。</div>`;
  }
  async function importJSON(file) {
    try {
      const j = await GC.readJSON(file);
      meta.month = j.month || meta.month;
      meta.fonts = j.fonts || meta.fonts;
      meta.googleFontsHref = j.googleFontsHref || meta.googleFontsHref;
      templates = j.templates || [];
      $("#mMonth").value = meta.month;
      fillFontSelect();
      saveDraft();
      renderTemplateList();
      GC.toast(`已匯入 ${templates.length} 個範本`, "ok");
    } catch (e) { GC.toast("匯入失敗：JSON 格式錯誤", "err"); }
  }
  function exportJSON() {
    meta.month = $("#mMonth").value.trim();
    const out = { month: meta.month, note: "由範本編輯頁匯出。座標/字級/描邊/陰影皆為相對影片尺寸的比例。",
      fonts: meta.fonts, googleFontsHref: meta.googleFontsHref, templates };
    GC.downloadBlob(new Blob([JSON.stringify(out, null, 2)], { type: "application/json" }), "templates.json");
    GC.toast("已匯出 templates.json，放回網站根目錄即完成更新", "ok", 5000);
  }
  function driveHelper() {
    const raw = $("#mDrive").value.trim();
    const id = GC.extractDriveId(raw);
    if (!id) { GC.toast("看不出檔案 ID，請貼「檔案的分享連結」", "warn"); return; }
    $("#driveDirect").textContent = GC.driveDownloadUrl(raw);
    $("#driveDirectWrap").classList.remove("hide");
  }

  /* ---- utils ---- */
  const deep = (o) => JSON.parse(JSON.stringify(o));
  const esc = (s) => String(s || "").replace(/"/g, "&quot;").replace(/</g, "&lt;");
  function fillFontSelect() {}
  function renderAll() { renderStage(); renderFieldList(); renderProps(); renderTemplateList(); }

  function wire() {
    $("#edFile").onchange = (e) => onVideo(e.target.files[0]);
    const dz = $("#edDrop");
    dz.onclick = () => $("#edFile").click();
    ["dragenter", "dragover"].forEach((ev) => dz.addEventListener(ev, (e) => { e.preventDefault(); dz.classList.add("over"); }));
    ["dragleave", "drop"].forEach((ev) => dz.addEventListener(ev, (e) => { e.preventDefault(); dz.classList.remove("over"); }));
    dz.addEventListener("drop", (e) => onVideo(e.dataTransfer.files[0]));
    $("#addName").onclick = () => addField("name");
    $("#addGreet").onclick = () => addField("greeting");
    $("#saveTpl").onclick = saveTemplate;
    $("#newTpl").onclick = newTemplate;
    $("#recapThumb").onclick = () => { cur.thumb = ""; captureThumb(); };
    $("#importBtn").onclick = () => $("#importFile").click();
    $("#importFile").onchange = (e) => importJSON(e.target.files[0]);
    $("#exportBtn").onclick = exportJSON;
    $("#driveHelpBtn").onclick = driveHelper;
    $("#pgPublish").onclick = publish;
    $("#pgClearTok").onclick = clearToken;
    $("#pgToggle").onclick = () => { $("#pgToggle").classList.toggle("open"); $("#pgBody").classList.toggle("hide"); };
    window.addEventListener("resize", renderStage);
  }

  document.addEventListener("DOMContentLoaded", boot);
})();
