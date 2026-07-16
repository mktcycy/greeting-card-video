/* 賀卡影片產生器 — 共用函式庫 (classic script, 全域 window.GC) */
(function () {
  "use strict";
  const GC = {};

  /* ---------- Toast / 提示 ---------- */
  let toastBox;
  GC.toast = function (msg, type = "ok", ms = 3800) {
    if (!toastBox) {
      toastBox = document.createElement("div");
      toastBox.className = "toasts";
      document.body.appendChild(toastBox);
    }
    const t = document.createElement("div");
    t.className = "toast " + type;
    t.textContent = msg;
    toastBox.appendChild(t);
    setTimeout(() => t.remove(), ms);
  };

  /* ---------- Google Drive 連結處理 ---------- */
  GC.extractDriveId = function (url) {
    if (!url) return null;
    let m = url.match(/\/file\/d\/([a-zA-Z0-9_-]+)/);
    if (m) return m[1];
    m = url.match(/[?&]id=([a-zA-Z0-9_-]+)/);
    if (m) return m[1];
    m = url.match(/\/d\/([a-zA-Z0-9_-]+)/);
    if (m) return m[1];
    return null;
  };
  // 轉直接下載連結（>約100MB 的檔案 Google 仍會跳確認頁，需再點一下）
  GC.driveDownloadUrl = function (shareUrl) {
    const id = GC.extractDriveId(shareUrl);
    return id ? `https://drive.google.com/uc?export=download&id=${id}` : shareUrl;
  };

  /* ---------- 檔名寬鬆比對 ---------- */
  // 去掉路徑、副檔名、瀏覽器加的 " (1)"、空白、大小寫
  GC.looseName = function (name) {
    if (!name) return "";
    let n = String(name).split(/[\\/]/).pop();      // 去路徑
    n = n.replace(/\.[^.]+$/, "");                   // 去副檔名
    n = n.replace(/\s*\(\d+\)\s*$/, "");             // 去 (1)(2)
    n = n.replace(/[\s_\-]+/g, "").toLowerCase();    // 去空白/底線/連字號、小寫
    return n;
  };
  GC.filesMatch = function (actual, expected) {
    return GC.looseName(actual) === GC.looseName(expected);
  };

  /* ---------- 字體載入 ---------- */
  GC.ensureFontsCss = function (href) {
    if (!href || document.querySelector(`link[data-gcfont]`)) return;
    const l = document.createElement("link");
    l.rel = "stylesheet";
    l.href = href;
    l.setAttribute("data-gcfont", "1");
    document.head.appendChild(l);
  };
  // 燒錄前強制載入「該段文字」需要的字形（解決 Canvas + Google Fonts 中文子集問題）
  GC.loadFontForText = async function (family, weight, sizePx, text) {
    if (!document.fonts || !text) return;
    const spec = `${weight || 400} ${Math.max(12, Math.round(sizePx))}px "${family}"`;
    try {
      await document.fonts.load(spec, text);
    } catch (e) {
      console.warn("font load failed", spec, e);
    }
  };

  /* ---------- Canvas 產生透明文字圖層 (原始解析度, WYSIWYG) ----------
     fields: [{ value, xf, yf, sizef, font, weight, color, align,
                stroke:{color,widthf}, shadow:{color,blurf,xf,yf} }] */
  GC.renderOverlay = async function (width, height, fields) {
    // 先確保所有欄位字形載入
    for (const f of fields) {
      if (!f.value) continue;
      await GC.loadFontForText(f.font, f.weight, f.sizef * height, f.value);
    }
    const cv = document.createElement("canvas");
    cv.width = width;
    cv.height = height;
    const ctx = cv.getContext("2d");
    ctx.clearRect(0, 0, width, height);

    for (const f of fields) {
      if (f.value == null || f.value === "") continue;
      const fontPx = Math.max(1, f.sizef * height);
      ctx.font = `${f.weight || 400} ${fontPx}px "${f.font}", "Noto Sans SC", sans-serif`;
      ctx.textAlign = f.align || "center";
      ctx.textBaseline = "middle";
      ctx.lineJoin = "round";
      const x = f.xf * width;
      const cy = f.yf * height;
      const lines = String(f.value).split("\n");
      const lh = fontPx * 1.18;
      const startY = cy - ((lines.length - 1) * lh) / 2;
      const strokeW = f.stroke && f.stroke.widthf ? f.stroke.widthf * height : 0;

      lines.forEach((line, i) => {
        const y = startY + i * lh;
        // 陰影（畫在描邊或填色上）
        if (f.shadow && f.shadow.color) {
          ctx.shadowColor = f.shadow.color;
          ctx.shadowBlur = (f.shadow.blurf || 0) * height;
          ctx.shadowOffsetX = (f.shadow.xf || 0) * width;
          ctx.shadowOffsetY = (f.shadow.yf || 0) * height;
        }
        if (strokeW > 0) {
          ctx.lineWidth = strokeW;
          ctx.strokeStyle = f.stroke.color;
          ctx.strokeText(line, x, y);        // 描邊(帶陰影)
          ctx.shadowColor = "transparent";   // 避免填色再疊一次陰影
          ctx.fillStyle = f.color;
          ctx.fillText(line, x, y);
        } else {
          ctx.fillStyle = f.color;
          ctx.fillText(line, x, y);          // 填色(帶陰影)
        }
        // reset shadow for next line
        ctx.shadowColor = "transparent";
        ctx.shadowBlur = 0;
        ctx.shadowOffsetX = 0;
        ctx.shadowOffsetY = 0;
      });
    }
    return await new Promise((res) => cv.toBlob(res, "image/png"));
  };

  /* ---------- 瀏覽器支援檢查 ---------- */
  GC.browserOK = function () {
    const ua = navigator.userAgent;
    const isChromium = /Chrome|Chromium|Edg/.test(ua) && !/OPR/.test(ua);
    return { ok: isChromium, isChromium };
  };

  /* ---------- ffmpeg.wasm 0.12 單執行緒 core（免 SharedArrayBuffer / COOP-COEP）----
     class 檔自我託管於 js/ffmpeg/（worker 需同源才能載入），core wasm 走 CDN。 */
  const FF = { inst: null, loaded: false, inputName: null, onProg: null,
    CORE: "https://unpkg.com/@ffmpeg/core@0.12.6/dist/umd" };
  GC.ffmpegLoaded = () => FF.loaded;

  async function toBlobURL(url, mime) {
    const buf = await (await fetch(url)).arrayBuffer();
    return URL.createObjectURL(new Blob([buf], { type: mime }));
  }
  async function fetchFile(file) { return new Uint8Array(await file.arrayBuffer()); }

  GC.ensureFFmpeg = async function () {
    if (FF.loaded) return FF.inst;
    let mod;
    try {
      mod = await import(new URL("js/ffmpeg/index.js", document.baseURI).href);
    } catch (e) {
      throw new Error("影像引擎載入失敗（請用 Chrome/Edge 並確認網路）");
    }
    FF.inst = new mod.FFmpeg();
    FF.inst.on("progress", ({ progress }) => { if (FF.onProg && progress >= 0 && progress <= 1) FF.onProg(progress); });
    await FF.inst.load({
      coreURL: await toBlobURL(`${FF.CORE}/ffmpeg-core.js`, "text/javascript"),
      wasmURL: await toBlobURL(`${FF.CORE}/ffmpeg-core.wasm`, "application/wasm"),
    });
    FF.loaded = true;
    return FF.inst;
  };

  // 寫入影片檔到虛擬檔案系統（同一支影片只需寫一次）
  GC.setInputVideo = async function (file) {
    const ff = await GC.ensureFFmpeg();
    if (FF.inputName) { try { await ff.deleteFile(FF.inputName); } catch (e) {} }
    FF.inputName = "input.mp4";
    await ff.writeFile(FF.inputName, await fetchFile(file));
  };

  // 用 overlay PNG 燒錄，回傳輸出 Blob(mp4)。可重複呼叫(換文字)不需重寫影片。
  GC.burn = async function (overlayBlob, onProgress) {
    const ff = FF.inst;
    if (!ff || !FF.inputName) throw new Error("尚未載入影片");
    await ff.writeFile("overlay.png", new Uint8Array(await overlayBlob.arrayBuffer()));
    FF.onProg = onProgress; if (onProgress) onProgress(0);
    try {
      await ff.exec([
        "-i", FF.inputName,
        "-i", "overlay.png",
        "-filter_complex", "[0:v][1:v]overlay=0:0:format=auto[v]",
        "-map", "[v]",
        "-map", "0:a?",          // 有音訊才帶
        "-c:v", "libx264",
        "-preset", "veryfast",
        "-pix_fmt", "yuv420p",
        "-c:a", "copy",
        "-movflags", "+faststart",
        "output.mp4",
      ]);
    } finally {
      try { await ff.deleteFile("overlay.png"); } catch (e) {}
      FF.onProg = null;
    }
    const data = await ff.readFile("output.mp4");
    try { await ff.deleteFile("output.mp4"); } catch (e) {}
    if (onProgress) onProgress(1);
    return new Blob([data.buffer || data], { type: "video/mp4" });
  };

  GC.freeInput = async function () {
    if (FF.inst && FF.inputName) {
      try { await FF.inst.deleteFile(FF.inputName); } catch (e) {}
      FF.inputName = null;
    }
  };

  /* ---------- 小工具 ---------- */
  GC.downloadBlob = function (blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  };
  GC.safeFileName = function (s) {
    return String(s).replace(/[\\/:*?"<>|]+/g, "_").replace(/\s+/g, "").slice(0, 60) || "output";
  };
  GC.readJSON = function (file) {
    return new Promise((res, rej) => {
      const r = new FileReader();
      r.onload = () => { try { res(JSON.parse(r.result)); } catch (e) { rej(e); } };
      r.onerror = rej;
      r.readAsText(file);
    });
  };

  window.GC = GC;
})();
