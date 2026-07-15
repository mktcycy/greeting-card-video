# 賀卡影片產生器 — Build Plan

## Goal
純前端(靜態) 賀卡短影片文字燒錄工具，部署 GitHub Pages。ffmpeg.wasm 單執行緒 + Canvas PNG overlay (WYSIWYG)。委託：qazandy(542348223)。

## Locked spec
- 公開 GitHub Pages；影片 1080p/≤60s/≤200MB；輸出 MP4 H.264 原解析度；音訊有才保留
- 單支流程(無批次/zip)；同片換名免重拖
- 字體 簡中：Google Fonts 5 種 + 燒錄前 document.fonts.load(text) 強制載入
- 介面 繁中；燒錄文字 簡中

## Files
- [x] task_plan.md
- [ ] templates.json (example, 1 template)
- [ ] css/app.css
- [ ] js/lib.js (ffmpeg loader, fonts, drive link, canvas render, utils, toast, steps)
- [ ] js/staff.js (index page: cards -> 4-step flow)
- [ ] js/editor.js (admin: upload, drag text boxes, style, drive link, import/export json)
- [ ] index.html (staff)
- [ ] editor.html (admin)
- [ ] README.md (admin guide + staff guide + limits)

## Key decisions
- positions/fontSize stored as normalized fractions of video W/H -> resolution independent WYSIWYG
- overlay: ffmpeg -i in -i overlay.png -filter_complex "[0:v][1:v]overlay=0:0[v]" -map "[v]" -map 0:a? -c:v libx264 -pix_fmt yuv420p -c:a copy
- ffmpeg 0.12 + @ffmpeg/core (single-thread) via toBlobURL from unpkg
- filename match: lenient (strip (1)/ext/case/spaces)
