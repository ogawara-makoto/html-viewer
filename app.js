'use strict';

// 開いたファイルは IndexedDB（この端末の中）にだけ保存する。外へは送らない。
const DB_NAME = 'html-viewer';
const STORE = 'files';
const KEEP = 30;

const $ = (id) => document.getElementById(id);
const home = $('home'), list = $('list'), empty = $('empty');
const back = $('back'), title = $('title'), openBtn = $('openBtn'), fileInput = $('file');
const answerBar = $('answerBar'), answerMsg = $('answerMsg'), answerSave = $('answerSave'), answerClose = $('answerClose');
let current = null; // 表示中のファイルの記録

// ---- 明暗の切り替え（OS に合わせる → 明るい → 暗い）。表示中のページにも伝える
const themeBtn = $('themeBtn'), THEME_KEY = 'hv-theme', MODES = ['auto', 'light', 'dark'];
const THEME_ICON = {
  auto: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8"/><path d="M12 4a8 8 0 0 1 0 16z" fill="currentColor"/></svg>',
  light: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>',
  dark: '<svg viewBox="0 0 24 24"><path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z"/></svg>',
};
const THEME_LABEL = { auto: '表示: OS に合わせる', light: '表示: 明るい', dark: '表示: 暗い' };
let theme = localStorage.getItem(THEME_KEY) || 'auto';
function applyTheme() {
  if (theme === 'auto') document.documentElement.removeAttribute('data-theme');
  else document.documentElement.setAttribute('data-theme', theme);
  themeBtn.innerHTML = THEME_ICON[theme];
  themeBtn.setAttribute('aria-label', THEME_LABEL[theme]);
  themeBtn.title = THEME_LABEL[theme];
  document.getElementById('frame')?.contentWindow.postMessage({ type: 'html-viewer:theme', mode: theme }, '*');
}
themeBtn.onclick = () => {
  theme = MODES[(MODES.indexOf(theme) + 1) % MODES.length];
  localStorage.setItem(THEME_KEY, theme);
  applyTheme();
};
applyTheme();

// ---- 一覧の見せ方：ファイル名ではなくページの題と、種類（答える／読む）のアイコン
const KIND_ICON = {
  answer: '<svg class="kind answer" viewBox="0 0 24 24" aria-label="答える"><path d="M4 20h4L19 9l-4-4L4 16z"/></svg>',
  read: '<svg class="kind" viewBox="0 0 24 24" aria-label="読む"><path d="M6 3h8l4 4v14H6z"/><path d="M14 3v4h4M9 12h6M9 16h6"/></svg>',
};
function describe(html) {
  const t = /<title[^>]*>([^<]*)<\/title>/i.exec(html);
  const title = t ? t[1].replace(/\s+/g, ' ').trim() : '';
  const kind = html.includes('HTML-VIEWER-ANSWER:BEGIN') ? 'answer' : 'read';
  return { title, kind };
}
const isPending = (rec) => rec.kind === 'answer' && !(rec.answer && rec.answer.sharedAt);

const dbReady = new Promise((resolve, reject) => {
  const req = indexedDB.open(DB_NAME, 1);
  req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: 'name' });
  req.onsuccess = () => resolve(req.result);
  req.onerror = () => reject(req.error);
});

async function tx(mode, fn) {
  const db = await dbReady;
  return new Promise((resolve, reject) => {
    const t = db.transaction(STORE, mode);
    const result = fn(t.objectStore(STORE));
    t.oncomplete = () => resolve(result && 'result' in result ? result.result : undefined);
    t.onerror = () => reject(t.error);
  });
}

const getAll = () => tx('readonly', (s) => s.getAll());
const put = (rec) => tx('readwrite', (s) => s.put(rec));
const del = (name) => tx('readwrite', (s) => s.delete(name));

async function prune() {
  const all = await getAll();
  all.sort((a, b) => b.openedAt - a.openedAt);
  for (const rec of all.slice(KEEP)) await del(rec.name);
}

function fmtDate(ms) {
  const d = new Date(ms);
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getMonth() + 1}/${d.getDate()} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

function fmtSize(n) {
  return n < 1024 * 1024 ? `${Math.ceil(n / 1024)} KB` : `${(n / 1024 / 1024).toFixed(1)} MB`;
}

async function showList() {
  document.getElementById('frame')?.remove();
  current = null;
  answerBar.hidden = true;
  home.hidden = false;
  back.hidden = true;
  openBtn.hidden = false;
  title.textContent = '';
  const all = (await getAll()).map((rec) => (rec.kind ? rec : Object.assign(rec, describe(rec.html))));
  // 答える物（まだ返事を保存していない物）を上にまとめ、その中は新しい順
  all.sort((a, b) => (isPending(b) - isPending(a)) || (b.openedAt - a.openedAt));
  list.replaceChildren(...all.map((rec) => {
    const li = document.createElement('li');
    const open = document.createElement('button');
    open.className = 'open';
    const name = document.createElement('span');
    name.className = 'name';
    name.textContent = rec.title || rec.name;
    const meta = document.createElement('span');
    meta.className = 'info';
    meta.textContent = `${fmtDate(rec.openedAt)} · ${fmtSize(rec.size)}`;
    if (rec.answer && !rec.answer.sharedAt) {
      const badge = document.createElement('span');
      badge.className = 'badge';
      badge.title = '返事が未保存';
      badge.innerHTML = '<svg viewBox="0 0 24 24"><path d="M4 20h4L19 9l-4-4L4 16z"/></svg>';
      meta.append(badge);
    }
    const text = document.createElement('span');
    text.className = 'text';
    text.append(name, meta);
    open.insertAdjacentHTML('beforeend', KIND_ICON[rec.kind]);
    open.append(text);
    open.onclick = () => view(rec);
    const rm = document.createElement('button');
    rm.className = 'del';
    rm.setAttribute('aria-label', '削除');
    rm.innerHTML = '<svg viewBox="0 0 24 24"><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/></svg>';
    rm.onclick = async () => { await del(rec.name); showList(); };
    li.append(open, rm);
    return li;
  }));
  list.hidden = all.length === 0;
  empty.hidden = all.length !== 0;
}

async function view(rec) {
  rec.openedAt = Date.now();
  await put(rec);
  home.hidden = true;
  openBtn.hidden = true;
  back.hidden = false;
  title.textContent = rec.title || rec.name;
  // 表示のたびに iframe を作り直す（中身の差し替えはブラウザの戻る履歴を増やすため）。
  // sandbox に allow-same-origin を付けないので、表示した HTML のスクリプトはビューアーの保存領域に触れない。
  const frame = document.createElement('iframe');
  frame.id = 'frame';
  frame.title = '表示中のページ';
  frame.setAttribute('sandbox', 'allow-scripts allow-popups allow-forms allow-modals');
  frame.srcdoc = rec.html;
  // 返事を返す仕組みを持つページは、この合図を受けた時だけ返事をビューアーへ渡す。
  frame.onload = () => {
    frame.contentWindow.postMessage({ type: 'html-viewer:hello', v: 1 }, '*');
    frame.contentWindow.postMessage({ type: 'html-viewer:theme', mode: theme }, '*');
  };
  current = rec;
  showAnswer();
  document.body.append(frame);
}

// ---- ページから届いた返事を <ファイル名>.answer.txt にして保存させる
// 共有シートは利用者のタップの中でしか開けないので、受け取ったら帯を出し、帯のボタンで開く。

const answerName = (rec) => `${rec.name}.answer.txt`;

function showAnswer(note) {
  const a = current && current.answer;
  answerBar.hidden = !a;
  if (!a) return;
  answerMsg.textContent = note || (a.sharedAt ? `✓ ${fmtDate(a.sharedAt)}` : '');
}

window.addEventListener('message', async (e) => {
  const frame = document.getElementById('frame');
  if (!frame || e.source !== frame.contentWindow || !current) return;
  const d = e.data;
  if (!d || d.type !== 'html-viewer:answer' || typeof d.text !== 'string' || !d.text.trim()) return;
  current.answer = { text: d.text, at: Date.now() };
  await put(current);
  showAnswer();
});

function download(file) {
  const url = URL.createObjectURL(file);
  const a = document.createElement('a');
  a.href = url;
  a.download = file.name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

answerSave.onclick = async () => {
  const rec = current;
  if (!rec || !rec.answer) return;
  const file = new File([rec.answer.text], answerName(rec), { type: 'text/plain' });
  try {
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      await navigator.share({ files: [file] });
    } else {
      download(file);
    }
  } catch (err) {
    if (err && err.name === 'AbortError') return; // 共有シートを閉じただけ
    showAnswer(`⚠ ${err && err.name || err}`);
    download(file);
  }
  rec.answer.sharedAt = Date.now();
  await put(rec);
  showAnswer();
};

answerClose.onclick = () => { answerBar.hidden = true; };

async function onPick(input) {
  const file = input.files[0];
  input.value = '';
  if (!file) return;
  const html = await file.text();
  const rec = { name: file.name, html, size: file.size, openedAt: Date.now(), ...describe(html) };
  await put(rec);
  await prune();
  view(rec);
}
fileInput.onchange = () => onPick(fileInput);
$('file2').onchange = () => onPick($('file2'));

back.onclick = () => showList();

if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js');

showList();
