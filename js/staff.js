/* 專員產出頁 */
(function () {
  "use strict";
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const SWATCHES = ["#FFFFFF", "#000000", "#F7D774", "#D4433B", "#B4232A", "#1E9E6A", "#2D6CDF", "#E9569B"];

  let DATA = null;      // templates.json
  let tpl = null;       // 目前範本
  let videoFile = null; // 已拖入的影片 File
  let loadedForVideo = null; // 已寫入 ffmpeg 的檔名(避免重複)
  let fieldVals = {};   // idx -> {value,color}
  let busy = false;

  async function boot() {
    const b = GC.browserOK();
    if (!b.ok) $("#browserWarn").classList.remove("hide");
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
      c.innerHTML =
        `<img class="thumb" src="${t.thumb || ""}" alt="" onerror="this.style.visibility='hidden'">` +
        `<div class="body"><h3></h3><p></p></div>`;
      c.querySelector("h3").textContent = t.name || t.id;
      c.querySelector("p").textContent = t.desc || "";
      c.onclick = () => openTemplate(t);
      grid.appendChild(c);
    });
    if (!(DATA.templates || []).length)
      grid.innerHTML = `<div class="alert info">本月尚未設定任何範本。</div>`;
  }

  function openTemplate(t) {
    tpl = t;
    videoFile = null;
    loadedForVideo = null;
    fieldVals = {};
    (t.fields || []).forEach((f, i) => (fieldVals[i] = { value: f.default || "", color: f.color }));
    $("#home").classList.add("hide");
    $("#flow").classList.remove("hide");
    $("#flowTitle").textContent = t.name || t.id;
    $("#dlBtn").href = t.driveUrl || "#";
    $("#dlFileName").textContent = t.videoFile || "";
    $("#expectName").textContent = t.videoFile || "";
    buildInputs();
    resetPreview();
    setStep(1);
    window.scrollTo(0, 0);
  }

  function setStep(n) {
    [1, 2, 3, 4].forEach((i) => {
      const el = $("#step" + i);
      el.classList.toggle("active", i === n);
      el.classList.toggle("done", i < n);
    });
  }

  /* ---- Step 2: 拖入影片 ---- */
  function resetPreview() {
    const v = $("#pvVideo");
    v.removeAttribute("src");
    v.load();
    $("#pvWrap").classList.add("hide");
    $("#dropMsg").textContent = "把下載好的影片拖到這裡，或點擊選擇檔案";
  }
  function handleVideo(file) {
    if (!file) return;
    if (!/video\//.test(file.type) && !/\.(mp4|mov|webm|m4v)$/i.test(file.name)) {
      GC.toast("這看起來不是影片檔，請確認檔案", "err");
      return;
    }
    // 檔名比對
    if (tpl.videoFile && !GC.filesMatch(file.name, tpl.videoFile)) {
      showDropError(`這不是本範本的影片。請確認你下載的是「${tpl.videoFile}」（你拖入的是「${file.name}」）`);
      return;
    }
    // 大小檢查
    const mb = file.size / 1048576;
    if (mb > 200) GC.toast(`影片 ${mb.toFixed(0)}MB 偏大，瀏覽器可能記憶體不足或很慢`, "warn", 5200);
    videoFile = file;
    loadedForVideo = null; // 需要重新寫入 ffmpeg
    const url = URL.createObjectURL(file);
    const v = $("#pvVideo");
    v.src = url;
    v.onloadedmetadata = () => {
      $("#pvWrap").classList.remove("hide");
      $("#dropErr").classList.add("hide");
      layoutOverlay();
      setStep(3);
      GC.toast("影片已載入，接著輸入文字", "ok");
    };
  }
  function showDropError(msg) {
    const e = $("#dropErr");
    e.textContent = msg;
    e.classList.remove("hide");
  }

  /* ---- Step 3: 動態輸入 + 即時預覽 ---- */
  function buildInputs() {
    const box = $("#inputs");
    box.innerHTML = "";
    (tpl.fields || []).forEach((f, i) => {
      const wrap = document.createElement("div");
      wrap.className = "field";
      const isName = f.type === "name";
      wrap.innerHTML =
        `<label class="${isName ? "req" : ""}">${f.label || (isName ? "名字" : "賀語")}</label>` +
        `<div class="row">` +
        (f.type === "greeting" && (f.default || "").length > 8
          ? `<textarea rows="2" data-i="${i}" placeholder="${f.placeholder || ""}"></textarea>`
          : `<input class="input" data-i="${i}" placeholder="${f.placeholder || ""}">`) +
        `<input type="color" class="swatch-input" data-ci="${i}" value="${toHex(f.color)}" title="文字顏色">` +
        `</div>`;
      box.appendChild(wrap);
      const inp = wrap.querySelector("[data-i]");
      inp.value = fieldVals[i].value;
      inp.oninput = () => { fieldVals[i].value = inp.value; layoutOverlay(); updateGate(); };
      const col = wrap.querySelector("[data-ci]");
      col.oninput = () => { fieldVals[i].color = col.value; layoutOverlay(); };
    });
    updateGate();
  }
  function updateGate() {
    const nameIdx = (tpl.fields || []).findIndex((f) => f.type === "name");
    const ok = nameIdx < 0 || (fieldVals[nameIdx] && fieldVals[nameIdx].value.trim());
    $("#genBtn").disabled = !ok || busy || !videoFile;
    if (videoFile && ok) setStep(4);
    else if (videoFile) setStep(3);
  }

  // 在預覽影片上以 HTML 疊字（依比例換算，WYSIWYG）
  function layoutOverlay() {
    const v = $("#pvVideo");
    const layer = $("#pvLayer");
    layer.innerHTML = "";
    const H = v.clientHeight || 1;
    const W = v.clientWidth || 1;
    (tpl.fields || []).forEach((f, i) => {
      const val = fieldVals[i].value;
      if (!val) return;
      const d = document.createElement("div");
      d.className = "tf";
      d.textContent = val;
      const fontPx = f.sizef * H;
      d.style.left = f.xf * 100 + "%";
      d.style.top = f.yf * 100 + "%";
      d.style.fontFamily = `"${f.font}","Noto Sans SC",sans-serif`;
      d.style.fontSize = fontPx + "px";
      d.style.fontWeight = f.weight || 400;
      d.style.color = fieldVals[i].color || f.color;
      d.style.textAlign = f.align || "center";
      if (f.stroke && f.stroke.widthf > 0) {
        const sw = f.stroke.widthf * H;
        d.style.webkitTextStroke = `${sw}px ${f.stroke.color}`;
        d.style.paintOrder = "stroke fill";
      }
      if (f.shadow && f.shadow.color) {
        d.style.textShadow = `${(f.shadow.xf || 0) * W}px ${(f.shadow.yf || 0) * H}px ${(f.shadow.blurf || 0) * H}px ${f.shadow.color}`;
      }
      layer.appendChild(d);
    });
  }

  /* ---- Step 4: 產出 ---- */
  async function generate() {
    if (busy || !videoFile) return;
    const nameIdx = (tpl.fields || []).findIndex((f) => f.type === "name");
    const nameVal = nameIdx >= 0 ? fieldVals[nameIdx].value.trim() : "";
    if (nameIdx >= 0 && !nameVal) { GC.toast("請先輸入名字", "warn"); return; }
    busy = true;
    updateGate();
    const btn = $("#genBtn");
    btn.innerHTML = `<span class="spinner"></span> 產出中…`;
    $("#prog").classList.remove("hide");
    setProg(0, "準備中…（第一次會先載入影像引擎，請稍候）");
    try {
      if (loadedForVideo !== videoFile.name || !GC.ffmpegLoaded()) {
        setProg(0, "載入影像引擎與影片…");
        await GC.setInputVideo(videoFile);
        loadedForVideo = videoFile.name;
      }
      setProg(0.05, "產生文字圖層…");
      const fields = (tpl.fields || []).map((f, i) => ({
        value: fieldVals[i].value, xf: f.xf, yf: f.yf, sizef: f.sizef,
        font: f.font, weight: f.weight, color: fieldVals[i].color || f.color,
        align: f.align, stroke: f.stroke, shadow: f.shadow,
      }));
      const overlay = await GC.renderOverlay(tpl.width, tpl.height, fields);
      setProg(0.1, "燒錄影片中…");
      const out = await GC.burn(overlay, (r) => setProg(0.1 + r * 0.88, "燒錄影片中… " + Math.round(r * 100) + "%"));
      setProg(1, "完成，開始下載");
      const fname = `${GC.safeFileName(tpl.name || tpl.id)}_${GC.safeFileName(nameVal || "output")}.mp4`;
      GC.downloadBlob(out, fname);
      GC.toast("已完成並下載：" + fname, "ok", 5000);
    } catch (e) {
      console.error(e);
      GC.toast("產出失敗：" + (e.message || e), "err", 6000);
      setProg(0, "發生錯誤，請重試或換 Chrome/Edge");
    } finally {
      busy = false;
      btn.innerHTML = "產出賀卡影片";
      updateGate();
      setTimeout(() => $("#prog").classList.add("hide"), 1500);
    }
  }
  function setProg(r, label) {
    $("#progBar").style.width = Math.round(r * 100) + "%";
    $("#progLabel").textContent = label || "";
  }

  function toHex(c) {
    if (!c) return "#ffffff";
    if (/^#([0-9a-f]{6})$/i.test(c)) return c;
    if (/^#([0-9a-f]{3})$/i.test(c)) return "#" + c.slice(1).split("").map((x) => x + x).join("");
    return "#ffffff";
  }

  /* ---- events ---- */
  function wire() {
    $("#backBtn").onclick = renderHome;
    const dz = $("#drop");
    dz.onclick = () => $("#fileInput").click();
    $("#fileInput").onchange = (e) => handleVideo(e.target.files[0]);
    ["dragenter", "dragover"].forEach((ev) =>
      dz.addEventListener(ev, (e) => { e.preventDefault(); dz.classList.add("over"); }));
    ["dragleave", "drop"].forEach((ev) =>
      dz.addEventListener(ev, (e) => { e.preventDefault(); dz.classList.remove("over"); }));
    dz.addEventListener("drop", (e) => handleVideo(e.dataTransfer.files[0]));
    $("#genBtn").onclick = generate;
    window.addEventListener("resize", () => { if (tpl && videoFile) layoutOverlay(); });
  }

  document.addEventListener("DOMContentLoaded", () => { wire(); boot(); });
})();
