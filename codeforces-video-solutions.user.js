// ==UserScript==
// @name         Codeforces Video Solutions
// @namespace    https://github.com/suraj-xd/codeforces-video-solutions
// @version      1.0.0
// @description  YouTube walkthroughs beside Codeforces problems, with a player, refresh, and a home-page library.
// @author       suraj-xd
// @license      MIT
// @homepageURL  https://github.com/suraj-xd/codeforces-video-solutions
// @supportURL   https://github.com/suraj-xd/codeforces-video-solutions/issues
// @downloadURL  https://raw.githubusercontent.com/suraj-xd/codeforces-video-solutions/main/codeforces-video-solutions.user.js
// @updateURL    https://raw.githubusercontent.com/suraj-xd/codeforces-video-solutions/main/codeforces-video-solutions.user.js
// @match        https://codeforces.com/*
// @match        https://*.codeforces.com/*
// @grant        GM_xmlhttpRequest
// @grant        GM_getValue
// @grant        GM_setValue
// @connect      www.youtube.com
// @run-at       document-idle
// @noframes
// ==/UserScript==

(function () {
  'use strict';

  const VERSION = '1.0.0';
  const CACHE_TTL = 6 * 60 * 60 * 1000;
  const STORAGE_KEY = 'cf-video-solutions-v1';
  const HOST_ID = 'cf-video-solutions';
  const normalize = (s) => String(s || '').replace(/\s+/g, ' ').trim();
  const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const textOf = (obj) => normalize(typeof obj === 'string' ? obj : obj?.simpleText || obj?.content || obj?.runs?.map((r) => r.text).join(''));

  function problemFromUrl(url, title = '') {
    let path;
    try { path = new URL(url, 'https://codeforces.com').pathname; } catch { return null; }
    const match = path.match(/^\/problemset\/problem\/(\d+)\/([A-Za-z]\d*)\/?$/)
      || path.match(/^\/(?:contest|gym)\/(\d+)\/problem\/([A-Za-z]\d*)\/?$/)
      || path.match(/^\/group\/[^/]+\/contest\/(\d+)\/problem\/([A-Za-z]\d*)\/?$/);
    if (!match) return null;
    const [, contest, rawIndex] = match;
    const index = rawIndex.toUpperCase();
    return { id: contest + index, contest, index, title: normalize(title).replace(/^[A-Za-z]\d*\.\s*/, ''), path };
  }

  function problemFromInput(input) {
    const value = normalize(input);
    if (/^https?:\/\//i.test(value)) {
      try {
        const url = new URL(value);
        if (!/(^|\.)codeforces\.com$/.test(url.hostname)) return null;
        return problemFromUrl(url.href);
      } catch { return null; }
    }
    const m = value.match(/^(\d{1,7})\s*[-/]?\s*([A-Za-z]\d*)\b\s*(.*)$/);
    if (!m) return null;
    return problemFromUrl(`/problemset/problem/${m[1]}/${m[2]}`, m[3]);
  }

  // Read data, never execute scripts from the search page.
  function extractInitialData(html) {
    const pattern = /(?:var\s+ytInitialData\s*=|window\[\s*["']ytInitialData["']\s*\]\s*=|(?:^|[;>\s])ytInitialData\s*=)\s*/g;
    let match;
    while ((match = pattern.exec(html))) {
      const start = match.index + match[0].length;
      if (html[start] !== '{') continue;
      let depth = 0, inString = false, escaped = false;
      for (let i = start; i < html.length; i++) {
        const c = html[i];
        if (inString) {
          if (escaped) escaped = false;
          else if (c === '\\') escaped = true;
          else if (c === '"') inString = false;
        } else if (c === '"') inString = true;
        else if (c === '{') depth++;
        else if (c === '}' && --depth === 0) {
          try { return JSON.parse(html.slice(start, i + 1)); } catch { break; }
        }
      }
    }
    throw new Error('YouTube did not return readable search results. Try Refresh or Search YouTube.');
  }

  function videosFromData(data) {
    const found = new Map();
    function add(v) {
      if (/^[A-Za-z0-9_-]{11}$/.test(v.id || '') && v.title && !found.has(v.id)) found.set(v.id, v);
    }
    function visit(obj) {
      if (!obj || typeof obj !== 'object') return;
      if (obj.adSlotRenderer || obj.promotedSparklesWebRenderer || obj.promotedVideoRenderer) return;
      const r = obj.videoRenderer;
      if (r) add({ id: r.videoId, title: textOf(r.title), channel: textOf(r.ownerText || r.longBylineText),
        views: textOf(r.viewCountText), duration: textOf(r.lengthText), published: textOf(r.publishedTimeText) });
      const v = obj.lockupViewModel;
      if (v?.contentType === 'LOCKUP_CONTENT_TYPE_VIDEO') {
        const meta = v.metadata?.lockupMetadataViewModel;
        const parts = (meta?.metadata?.contentMetadataViewModel?.metadataRows || [])
          .flatMap((row) => (row.metadataParts || []).map((part) => textOf(part.text)));
        add({ id: v.contentId, title: textOf(meta?.title), channel: parts[0] || '',
          views: parts.find((p) => /views/i.test(p)) || '', duration: '', published: '' });
      }
      for (const value of Object.values(obj)) if (value && typeof value === 'object') visit(value);
    }
    visit(data);
    return [...found.values()];
  }

  function viewCount(value) {
    const match = String(value).replace(/,/g, '').match(/([\d.]+)\s*([KMB])?/i);
    return match ? Number(match[1]) * ({ K: 1e3, M: 1e6, B: 1e9 }[match[2]?.toUpperCase()] || 1) : 0;
  }

  function rankVideos(videos, problem) {
    const idPattern = new RegExp(`\\b${escapeRegex(problem.contest)}[\\s\\-./]*${escapeRegex(problem.index)}\\b`, 'i');
    const name = normalize(problem.title).toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
    return videos.map((v, order) => {
      const title = v.title.toLowerCase();
      const exactId = idPattern.test(title);
      const normalizedTitle = title.replace(/[^\p{L}\p{N}]+/gu, ' ');
      const exactTitle = name.length >= 4 && new RegExp(`(?:^| )${escapeRegex(name)}(?: |$)`, 'i').test(normalizedTitle);
      const codeforces = /\b(codeforces|cf)\b/i.test(title);
      const relevant = exactId || (exactTitle && codeforces);
      const score = (exactId ? 100 : 0) + (exactTitle ? 40 : 0) + (codeforces ? 10 : 0)
        + (/solution|explanation|editorial|walkthrough|explain|tutorial/i.test(title) ? 8 : 0)
        + Math.min(6, Math.log10(1 + viewCount(v.views))) - order * 0.01;
      return { ...v, score, relevant, reason: exactId ? 'Problem ID match' : 'Problem title match' };
    }).filter((v) => v.relevant).sort((a, b) => b.score - a.score).slice(0, 8);
  }

  function searchUrl(problem) {
    const query = normalize(`Codeforces ${problem.id} ${problem.title} solution`);
    return `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}&hl=en`;
  }

  function readStore() {
    try {
      const s = GM_getValue(STORAGE_KEY, {});
      return { recent: Array.isArray(s.recent) ? s.recent : [], cache: s.cache || {} };
    } catch { return { recent: [], cache: {} }; }
  }

  function saveStore(store) {
    try { GM_setValue(STORAGE_KEY, store); } catch { /* Discovery still works without storage. */ }
  }

  function remember(problem) {
    const store = readStore();
    store.recent = [problem, ...store.recent.filter((p) => p.id !== problem.id)].slice(0, 12);
    saveStore(store);
  }

  function cacheKey(problem) { return normalize(`${problem.id} ${problem.title}`).toLowerCase(); }

  function cachedResult(problem) {
    const entry = readStore().cache[cacheKey(problem)];
    return entry && Date.now() - entry.time < CACHE_TTL && Array.isArray(entry.videos) ? entry : null;
  }

  function cacheResult(problem, videos) {
    const store = readStore();
    store.cache[cacheKey(problem)] = { time: Date.now(), videos };
    store.cache = Object.fromEntries(Object.entries(store.cache).sort((a, b) => b[1].time - a[1].time).slice(0, 24));
    saveStore(store);
  }

  function fetchVideos(problem) {
    return new Promise((resolve, reject) => {
      if (typeof GM_xmlhttpRequest !== 'function') {
        reject(new Error('Install this script in Tampermonkey to enable video discovery.')); return;
      }
      GM_xmlhttpRequest({
        method: 'GET', url: searchUrl(problem), anonymous: true, timeout: 20000,
        onload(response) {
          if (response.status !== 200) {
            reject(new Error(`YouTube returned HTTP ${response.status}. Try Refresh or Search YouTube.`)); return;
          }
          try { resolve(rankVideos(videosFromData(extractInitialData(response.responseText)), problem)); }
          catch (error) { reject(error); }
        },
        onerror() { reject(new Error('Could not reach YouTube. Check your connection, then Refresh.')); },
        ontimeout() { reject(new Error('YouTube took too long. Try Refresh or Search YouTube.')); },
      });
    });
  }

  const CSS = `
    :host{display:block;margin:0 0 22px;color:#17223b;font:14px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color-scheme:light}
    *{box-sizing:border-box}button,input,select{font:inherit}button,a,summary,input,select{-webkit-tap-highlight-color:transparent}
    button,summary,select{cursor:pointer}button,a{touch-action:manipulation}button:disabled{opacity:.55;cursor:wait}
    button:focus-visible,a:focus-visible,summary:focus-visible,input:focus-visible,select:focus-visible{outline:3px solid #7598ff;outline-offset:3px}
    .card{background:#fff;border:1px solid #dce2ed;border-radius:12px;overflow:hidden;box-shadow:0 3px 12px #1d35520a}
    header{padding:17px 16px 14px;border-bottom:1px solid #e9edf5;background:linear-gradient(135deg,#f1f5ff,#fff)}
    .eyebrow{color:#526383;font-size:10px;font-weight:750;letter-spacing:1.5px;text-transform:uppercase}
    h2{font-size:19px;line-height:1.3;margin:6px 0;color:#17223b;letter-spacing:-.35px}p{margin:6px 0}
    .context{font-size:12px;color:#526078;overflow-wrap:anywhere}.body{padding:14px 16px}.subtle{font-size:12px;color:#5e6b80}
    summary{font-size:13px;font-weight:650;padding:12px 16px;list-style:none;display:flex;align-items:center;justify-content:space-between}
    summary::-webkit-details-marker{display:none}summary::after{content:'⌄';font-size:18px;color:#5e6b80}details[open]>summary::after{content:'⌃'}
    details[open]>summary{border-bottom:1px solid #eef1f7}button{border:1px solid #d9e0ed;border-radius:7px;background:white;color:#25436e;padding:7px 10px;font-weight:600}
    .primary{background:#275ddd;color:white;border-color:#275ddd}.toolbar{display:flex;gap:8px;align-items:center;justify-content:space-between;margin:12px 0 8px}
    a{color:#2458c4;text-decoration:none}a:hover{text-decoration:underline}.toolbar a{font-size:12px}.status{font-size:12px;color:#526078;margin-bottom:10px}
    .status.error{color:#a7382b}.badge{font-size:10px;font-weight:750;letter-spacing:1px;text-transform:uppercase;color:#2b6a4f;margin:3px 0 8px}
    .watch{display:block;text-align:left;padding:0;border:0;width:100%;background:none;color:inherit;border-radius:8px;overflow:hidden}
    .thumb{position:relative;aspect-ratio:16/9;background:#e9eef7;overflow:hidden;border-radius:8px}.thumb img{width:100%;height:100%;object-fit:cover;display:block}
    .play{position:absolute;inset:0;display:grid;place-items:center;font-size:32px;color:white;text-shadow:0 2px 8px #000;background:#0001}
    .duration{position:absolute;bottom:6px;right:6px;background:#121c2be8;color:white;padding:1px 5px;font-size:11px;border-radius:3px}
    .video-title{font-size:13px;font-weight:650;margin:9px 0 4px;line-height:1.45;overflow-wrap:anywhere}.meta{font-size:11px;color:#5e6b80;margin:4px 0;font-weight:400}
    .more{margin-top:14px}label{display:block;font-size:12px;font-weight:600;margin:5px 0}select,input{width:100%;border:1px solid #d6deec;background:white;color:#17223b;padding:8px;border-radius:6px;min-width:0}
    select{font-size:12px}form{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:7px;margin:7px 0 12px}form input{font-size:12px}.recent{display:grid;gap:7px;margin:10px 0}
    .recent button{text-align:left;font-size:12px;font-weight:500}.clear{font-size:11px;padding:3px 6px;font-weight:400}.foot{border-top:1px solid #edf0f6;padding-top:10px;margin-top:14px;font-size:10px;color:#627089}
    dialog{padding:0;border:1px solid #dce2ed;border-radius:14px;max-width:900px;width:calc(100vw - 32px);max-height:calc(100dvh - 32px);background:white;color:#17223b;box-shadow:0 24px 90px #0005;overflow:auto}
    dialog::backdrop{background:#111c34b8}.dialog-head{display:flex;align-items:center;gap:16px;justify-content:space-between;padding:16px 20px}.dialog-head h2{font-size:17px;margin:0}
    .dialog-body{padding:0 20px 20px}.player{width:100%;aspect-ratio:16/9;min-height:210px;background:#111827;border:0;border-radius:8px;display:block}.dialog-foot{display:flex;gap:12px;align-items:center;flex-wrap:wrap;margin-top:12px;font-size:12px}
    [hidden]{display:none!important}@media(max-width:600px){dialog{width:calc(100vw - 16px)}.dialog-body{padding:0 12px 16px}.dialog-head{padding:12px}.player{min-height:210px}}
    @media(prefers-reduced-motion:no-preference){button{transition:background .15s}button:hover{filter:brightness(.97)}}
  `;

  function el(tag, attrs = {}, ...children) {
    const node = document.createElement(tag);
    for (const [key, value] of Object.entries(attrs)) {
      if (key.startsWith('on')) node.addEventListener(key.slice(2), value);
      else if (key === 'className') node.className = value;
      else node.setAttribute(key, value);
    }
    for (const child of children) if (child != null) node.append(child instanceof Node ? child : document.createTextNode(String(child)));
    return node;
  }

  function mount() {
    if (document.getElementById(HOST_ID)) return;
    const problem = problemFromUrl(location.href, document.querySelector('.problem-statement .title')?.textContent);
    const home = /^\/(?:home|index)?\/?$/.test(location.pathname);
    if (!problem && !home) return;
    const sidebar = document.querySelector('#sidebar');
    const parent = sidebar || document.querySelector('#pageContent') || document.querySelector('main');
    if (!parent) return;

    const host = el('section', { id: HOST_ID, 'data-version': VERSION });
    parent.prepend(host);
    const root = host.attachShadow({ mode: 'open' });
    root.append(el('style', {}, CSS));
    let current = problem, requestVersion = 0, loadedKey = '', currentVideos = [];
    if (problem) remember(problem);

    const context = el('p', { className: 'context' }, problem ? `${problem.id} · ${problem.title || 'Codeforces problem'}` : 'Walkthroughs for the problems you’re practicing');
    const header = el('header', {}, el('div', { className: 'eyebrow' }, 'Codeforces · YouTube'), el('h2', {}, 'Solution videos'), context);
    const status = el('p', { className: 'status', role: 'status', 'aria-live': 'polite' });
    const results = el('div', { id: 'results' });
    const searchLink = el('a', { target: '_blank', rel: 'noopener noreferrer' }, 'Search YouTube ↗');
    const refresh = el('button', { type: 'button', onclick: () => load(true), 'aria-label': 'Refresh solution videos' }, '↻ Refresh');
    const toolbar = el('div', { className: 'toolbar' }, refresh, searchLink);
    const content = el('div', { className: 'body' }, status, results, toolbar,
      el('p', { className: 'foot' }, 'Ranked by problem match, then views. Video quality isn’t guaranteed.'));
    const details = el('details', {}, el('summary', {}, 'Find a walkthrough'), content);
    details.addEventListener('toggle', () => { if (details.open && current && loadedKey !== cacheKey(current)) load(false); });
    const card = el('div', { className: 'card' }, header);
    root.append(card);

    const dialogTitle = el('h2', { id: 'dialog-title' }, 'Video walkthrough');
    const playerSlot = el('div');
    const dialogSelect = el('select', { 'aria-label': 'Choose another walkthrough' });
    const external = el('a', { target: '_blank', rel: 'noopener noreferrer' }, 'Watch on YouTube ↗');
    const dialog = el('dialog', { 'aria-labelledby': 'dialog-title' },
      el('div', { className: 'dialog-head' }, dialogTitle, el('button', { type: 'button', onclick: () => dialog.close(), 'aria-label': 'Close video dialog' }, '✕')),
      el('div', { className: 'dialog-body' }, playerSlot, el('label', { for: 'dialog-select' }, 'Other walkthroughs'), dialogSelect,
        el('div', { className: 'dialog-foot' }, external, el('span', { className: 'subtle' }, 'If playback is unavailable here, open YouTube.'))));
    dialogSelect.id = 'dialog-select';
    dialog.addEventListener('close', () => playerSlot.replaceChildren());
    dialog.addEventListener('click', (e) => {
      const r = dialog.getBoundingClientRect();
      if (e.target === dialog && (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom)) dialog.close();
    });
    root.append(dialog);

    function openVideo(index) {
      const video = currentVideos[index];
      if (!video) return;
      dialogTitle.textContent = video.title;
      external.href = `https://www.youtube.com/watch?v=${video.id}`;
      dialogSelect.replaceChildren(...currentVideos.map((v, i) => el('option', { value: i }, `${i + 1}. ${v.title}`)));
      dialogSelect.value = String(index);
      playerSlot.replaceChildren(el('iframe', { className: 'player', title: video.title,
        src: `https://www.youtube-nocookie.com/embed/${video.id}?rel=0`,
        allow: 'autoplay; encrypted-media; picture-in-picture; fullscreen', allowfullscreen: '',
        referrerpolicy: 'strict-origin-when-cross-origin' }));
      if (!dialog.open) dialog.showModal();
    }
    dialogSelect.addEventListener('change', () => openVideo(Number(dialogSelect.value)));

    function renderVideos(videos) {
      currentVideos = videos;
      results.replaceChildren();
      if (!videos.length) {
        results.append(el('p', { className: 'subtle' }, 'No confident matches yet. Try Refresh, or search YouTube for a contest-wide editorial.'));
        return;
      }
      const top = videos[0];
      const thumb = el('div', { className: 'thumb' },
        el('img', { src: `https://i.ytimg.com/vi/${top.id}/mqdefault.jpg`, alt: '', loading: 'lazy', referrerpolicy: 'no-referrer' }),
        el('span', { className: 'play', 'aria-hidden': 'true' }, '▶'));
      if (top.duration) thumb.append(el('span', { className: 'duration' }, top.duration));
      results.append(el('div', { className: 'badge' }, 'Top match'),
        el('button', { type: 'button', className: 'watch', onclick: () => openVideo(0), 'aria-label': `Watch ${top.title}` }, thumb,
          el('div', { className: 'video-title' }, top.title), el('p', { className: 'meta' }, [top.channel, top.views].filter(Boolean).join(' · '))),
        el('p', { className: 'meta' }, top.reason));
      if (videos.length > 1) {
        const select = el('select', { id: 'other-videos', 'aria-label': 'Other solution videos' },
          el('option', { value: '' }, `Choose from ${videos.length - 1} more videos…`),
          ...videos.slice(1).map((v, i) => el('option', { value: i + 1 }, `${v.title} — ${v.channel}`)));
        select.addEventListener('change', () => { if (select.value !== '') { openVideo(Number(select.value)); select.value = ''; } });
        results.append(el('div', { className: 'more' }, el('label', { for: 'other-videos' }, 'More walkthroughs'), select));
      }
    }

    async function load(force = false) {
      if (!current) return;
      const p = { ...current }, key = cacheKey(p), version = ++requestVersion;
      if (dialog.open) dialog.close();
      loadedKey = key;
      context.textContent = `${p.id} · ${p.title || 'Codeforces problem'}`;
      searchLink.href = searchUrl(p);
      status.className = 'status';
      results.replaceChildren();
      refresh.disabled = true;
      status.textContent = 'Finding matching walkthroughs…';
      try {
        const cached = !force && cachedResult(p);
        const videos = cached ? cached.videos : await fetchVideos(p);
        if (version !== requestVersion || !host.isConnected) return;
        if (!cached) cacheResult(p, videos);
        renderVideos(videos);
        status.textContent = `${videos.length} matching video${videos.length === 1 ? '' : 's'}${cached ? ' · cached' : ' · just updated'}`;
      } catch (error) {
        if (version !== requestVersion || !host.isConnected) return;
        loadedKey = '';
        currentVideos = [];
        status.className = 'status error';
        status.textContent = error.message;
      } finally { if (version === requestVersion) refresh.disabled = false; }
    }

    if (home) {
      const input = el('input', { id: 'problem-input', placeholder: '4A Watermelon or problem URL', autocomplete: 'off', maxlength: '250', required: '' });
      const help = el('p', { className: 'subtle', role: 'status' });
      const recent = el('div', { className: 'recent' });
      function choose(p) {
        current = p;
        remember(p);
        input.value = `${p.id} ${p.title}`.trim();
        help.textContent = '';
        const wasOpen = details.open;
        details.open = true;
        if (wasOpen) load(false);
        renderRecent();
      }
      function renderRecent() {
        const entries = readStore().recent;
        recent.replaceChildren(...entries.slice(0, 6).map((p) => el('button', { type: 'button', onclick: () => choose(p) }, `${p.id} · ${p.title || 'Codeforces problem'}`)));
        if (!entries.length) recent.append(el('p', { className: 'subtle' }, 'Problems you visit will appear here. Or enter one above.'));
      }
      const form = el('form', { onsubmit: (e) => {
        e.preventDefault();
        const p = problemFromInput(input.value);
        if (!p) { help.textContent = 'Enter a problem ID such as 4A, or a Codeforces problem URL.'; return; }
        const saved = readStore().recent.find((item) => item.id === p.id);
        choose(!p.title && saved ? saved : p);
      } }, input, el('button', { type: 'submit', className: 'primary' }, 'Find'));
      const clear = el('button', { type: 'button', className: 'clear', onclick: () => {
        requestVersion++;
        loadedKey = '';
        current = null;
        currentVideos = [];
        if (dialog.open) dialog.close();
        details.open = false;
        results.replaceChildren();
        status.textContent = '';
        refresh.disabled = false;
        input.value = '';
        context.textContent = 'Walkthroughs for the problems you’re practicing';
        saveStore({ recent: [], cache: {} });
        renderRecent();
      } }, 'Clear library');
      card.append(el('div', { className: 'body' }, el('label', { for: 'problem-input' }, 'Find a problem’s videos'), form, help,
        el('div', { className: 'toolbar' }, el('strong', { className: 'subtle' }, 'Recent problems'), clear), recent));
      renderRecent();
    }
    card.append(details);
    status.textContent = 'Open to search YouTube for this problem.';
    if (current) searchLink.href = searchUrl(current);
    else { toolbar.hidden = true; details.hidden = true; }
    if (home) {
      const observer = new MutationObserver(() => { toolbar.hidden = !current; details.hidden = !current; });
      observer.observe(context, { childList: true });
    }
  }

  const api = { problemFromUrl, problemFromInput, extractInitialData, videosFromData, rankVideos, viewCount, searchUrl };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else mount();
})();
