/* 專員產出頁（簡化流程：下載 → 拖入 → 打名字 → 產出） */
(function () {
  "use strict";
  const $ = (s, r = document) => r.querySelector(s);

  let DATA = null, tpl = null, videoFile = null, loadedForVideo = null;
  let fieldVals = {}, busy = false;

  async function boot() {
    if (!GC.browserOK().ok) $("#browserWarn").classList.remove("hide");
    try {
      DATA = await fetch("templates.json?_=" + Date.now()).then((r) => r.json());
    } catch (e) {
      $("#home").innerHTML = `<div class="alert err">讀不到 templates.json，請確認檔案在網站根目錄。</div>`;
      return;
    }
    GC.ensureFontsCss(DATA.googleFontsHref);
    $("#monthTag").textContent = DATA.month || "";
    renderHome();
  }

  function renderHome() {
    $("#flow").classList.add("hide");
    $("#home").classList.remove("hide");
    const grid = $("#cards");
    grid.innerHTML = "";
    (DATA.templates || []).forEach((t) => {
      const c = document.createElement("button");
      c.className = "tplcard";
      c.innerHTML = `<img class="thumb" src="${esc(t.thumb || "")}" alt="" onerror="this.style.visibility='hidden'"><div class="body"><h3></h3><p></p></div>`;
      c.querySelector("h3").textContent = t.name || t.id;
      c.querySelector("p").textContent = t.desc || "";
      c.onclick = () => openTemplate(t);
      grid.appendChild(c);
    });
    if (!(DATA.templates || []).length) grid.innerHTML = `<div class="alert info">本月尚未設定任何範本。</div>`;
  }

  function openTemplate(t) {
    tpl = t; videoFile = null; loadedForVideo = null; fieldVals = {};
    (t.fields || []).forEach((f, i) => (fieldVals[i] = { value: f.default || "", color: f.color }));
    $("#home").classList.add("hide");
    $("#flow").classList.remove("hide");
    $("#flowTitle").textContent = t.name || t.id;
    $("#dlBtn").href = t.driveUrl || "#";
    $("#expectName").textContent = t.videoFile || "";
    buildInputs();
    $("#makeBlock").classList.add("hide");
    resetPreview();
    window.scrollTo(0, 0);
  }

  /* ---- 取得影片 ---- */
  function resetPreview() {
    const v = $("#pvVideo"); v.removeAttribute("src"); v.load();
    $("#pvWrap").classList.add("hide");
    $("#dropErr").classList.add("hide");
    $("#dropMsg").textContent = "把下載好的影片拖到這裡（或點這裡選檔案）";
  }
  function handleVideo(file) {
    if (!file) return;
    if (!/video\//.test(file.type) && !/\.(mp4|mov|webm|m4v)$/i.test(file.name)) {
      showErr("這看起來不是影片檔，請確認下載的檔案。"); return;
    }
    if (tpl.videoFile && !GC.filesMatch(file.name, tpl.videoFile)) {
      showErr(`這不是這個範本的影片。請確認你下載的是「${tpl.videoFile}」（你拖入的是「${file.name}」）。`); return;
    }
    const mb = file.size / 1048576;
    if (mb > 200) GC.toast(`影片 ${mb.toFixed(0)}MB 偏大，可能較慢或記憶體不足`, "warn", 5000);
    videoFile = file; loadedForVideo = null;
    const v = $("#pvVideo");
    v.src = URL.createObjectURL(file);
    v.onloadedmetadata = () => {
      $("#pvWrap").classList.remove("hide");
      $("#dropErr").classList.add("hide");
      $("#dropMsg").textContent = "✓ 影片已載入";
      layoutOverlay();
      const mk = $("#makeBlock"); mk.classList.remove("hide"); mk.classList.add("reveal");
      const first = $("#nameInputs input, #nameInputs textarea");
      if (first) first.focus();
      updateGate();
    };
  }
  function showErr(msg) { const e = $("#dropErr"); e.textContent = msg; e.classList.remove("hide"); }

  /* ---- 輸入（名字＝主要；賀語＋顏色＝更多設定）---- */
  function buildInputs() {
    const nameBox = $("#nameInputs"); nameBox.innerHTML = "";
    const adv = $("#advBody"); adv.innerHTML = "";
    (tpl.fields || []).forEach((f, i) => {
      const isName = f.type === "name";
      const label = f.label || (isName ? "名字" : "賀語");
      // 主要/賀語輸入
      const wrap = document.createElement("div"); wrap.className = "field";
      const control = (!isName && (f.default || "").length > 8)
        ? `<textarea rows="2" data-i="${i}" placeholder="${esc(f.placeholder || "")}"></textarea>`
        : `<input class="input ${isName ? "big-input" : ""}" data-i="${i}" placeholder="${esc(f.placeholder || (isName ? "請輸入名字" : ""))}">`;
      wrap.innerHTML = `<label class="${isName ? "req" : ""}">${esc(label)}</label>${control}`;
      (isName ? nameBox : adv).appendChild(wrap);
      const inp = wrap.querySelector("[data-i]");
      inp.value = fieldVals[i].value;
      inp.oninput = () => { fieldVals[i].value = inp.value; layoutOverlay(); updateGate(); };
      // 顏色（全放更多設定）
      const crow = document.createElement("div"); crow.className = "field";
      crow.innerHTML = `<label>${esc(label)}顏色</label><div class="row"><input type="color" class="swatch-input" data-ci="${i}" value="${toHex(f.color)}"><span class="muted">預設用範本顏色，不改就不用動</span></div>`;
      adv.appendChild(crow);
      crow.querySelector("[data-ci]").oninput = (e) => { fieldVals[i].color = e.target.value; layoutOverlay(); };
    });
    if (!adv.children.length) $("#advToggle").classList.add("hide");
    else $("#advToggle").classList.remove("hide");
  }
  function updateGate() {
    const ni = (tpl.fields || []).findIndex((f) => f.type === "name");
    const ok = ni < 0 || (fieldVals[ni] && fieldVals[ni].value.trim());
    $("#genBtn").disabled = !ok || busy || !videoFile;
  }

  function layoutOverlay() {
    const v = $("#pvVideo"), layer = $("#pvLayer");
    layer.innerHTML = "";
    const H = v.clientHeight || 1, W = v.clientWidth || 1;
    (tpl.fields || []).forEach((f, i) => {
      const val = fieldVals[i].value; if (!val) return;
      const d = document.createElement("div"); d.className = "tf"; d.textContent = val;
      d.style.left = f.xf * 100 + "%"; d.style.top = f.yf * 100 + "%";
      d.style.fontFamily = `"${f.font}","Noto Sans SC",sans-serif`;
      d.style.fontSize = f.sizef * H + "px"; d.style.fontWeight = f.weight || 400;
      d.style.color = fieldVals[i].color || f.color; d.style.textAlign = f.align || "center";
      if (f.stroke && f.stroke.widthf > 0) { d.style.webkitTextStroke = `${f.stroke.widthf * H}px ${f.stroke.color}`; d.style.paintOrder = "stroke fill"; }
      if (f.shadow && f.shadow.color) d.style.textShadow = `${(f.shadow.xf || 0) * W}px ${(f.shadow.yf || 0) * H}px ${(f.shadow.blurf || 0) * H}px ${f.shadow.color}`;
      layer.appendChild(d);
    });
  }

  /* ---- 產出 ---- */
  async function generate() {
    if (busy || !videoFile) return;
    const ni = (tpl.fields || []).findIndex((f) => f.type === "name");
    const nameVal = ni >= 0 ? fieldVals[ni].value.trim() : "";
    if (ni >= 0 && !nameVal) { GC.toast("請先輸入名字", "warn"); return; }
    busy = true; updateGate();
    const btn = $("#genBtn"); btn.innerHTML = `<span class="spinner"></span> 產出中…`;
    $("#prog").classList.remove("hide");
    setProg(0, "準備中…（第一次會先載入影像引擎，請稍候）");
    try {
      if (loadedForVideo !== videoFile.name || !GC.ffmpegLoaded()) {
        setProg(0, "載入影像引擎與影片…");
        await GC.setInputVideo(videoFile); loadedForVideo = videoFile.name;
      }
      setProg(0.05, "產生文字圖層…");
      const fields = (tpl.fields || []).map((f, i) => ({
        value: fieldVals[i].value, xf: f.xf, yf: f.yf, sizef: f.sizef, font: f.font,
        weight: f.weight, color: fieldVals[i].color || f.color, align: f.align, stroke: f.stroke, shadow: f.shadow,
      }));
      const overlay = await GC.renderOverlay(tpl.width, tpl.height, fields);
      setProg(0.1, "燒錄影片中…");
      const out = await GC.burn(overlay, (r) => setProg(0.1 + r * 0.88, "燒錄影片中… " + Math.round(r * 100) + "%"));
      setProg(1, "完成，開始下載");
      const fname = `${GC.safeFileName(tpl.name || tpl.id)}_${GC.safeFileName(nameVal || "output")}.mp4`;
      GC.downloadBlob(out, fname);
      GC.toast("完成並下載：" + fname, "ok", 5000);
    } catch (e) {
      console.error(e);
      GC.toast("產出失敗：" + (e.message || e), "err", 6000);
      setProg(0, "發生錯誤，請重試或改用 Chrome/Edge");
    } finally {
      busy = false; btn.innerHTML = "產出賀卡影片"; updateGate();
      setTimeout(() => $("#prog").classList.add("hide"), 1500);
    }
  }
  function setProg(r, label) { $("#progBar").style.width = Math.round(r * 100) + "%"; $("#progLabel").textContent = label || ""; }

  function toHex(c) {
    if (!c) return "#ffffff";
    if (/^#[0-9a-f]{6}$/i.test(c)) return c;
    if (/^#[0-9a-f]{3}$/i.test(c)) return "#" + c.slice(1).split("").map((x) => x + x).join("");
    return "#ffffff";
  }
  const esc = (s) => String(s || "").replace(/"/g, "&quot;").replace(/</g, "&lt;");

  function wire() {
    $("#backBtn").onclick = renderHome;
    const dz = $("#drop");
    dz.onclick = () => $("#fileInput").click();
    $("#fileInput").onchange = (e) => handleVideo(e.target.files[0]);
    ["dragenter", "dragover"].forEach((ev) => dz.addEventListener(ev, (e) => { e.preventDefault(); dz.classList.add("over"); }));
    ["dragleave", "drop"].forEach((ev) => dz.addEventListener(ev, (e) => { e.preventDefault(); dz.classList.remove("over"); }));
    dz.addEventListener("drop", (e) => handleVideo(e.dataTransfer.files[0]));
    $("#advToggle").onclick = () => { $("#advToggle").classList.toggle("open"); $("#advBody").classList.toggle("hide"); };
    $("#genBtn").onclick = generate;
    window.addEventListener("resize", () => { if (tpl && videoFile) layoutOverlay(); });
  }

  document.addEventListener("DOMContentLoaded", () => { wire(); boot(); });
})();
