'use strict';

// 開いたファイルは IndexedDB（この端末の中）にだけ保存する。外へは送らない。
const DB_NAME = 'html-viewer';
const STORE = 'files';
const KEEP = 30;

const $ = (id) => document.getElementById(id);
const home = $('home'), list = $('list'), empty = $('empty');
const listLabel = $('listLabel'), count = $('count');
const back = $('back'), title = $('title'), openBtn = $('openBtn'), fileInput = $('file');

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
  home.hidden = false;
  back.hidden = true;
  openBtn.hidden = false;
  title.textContent = 'HTML ビューアー';
  const all = (await getAll()).sort((a, b) => b.openedAt - a.openedAt);
  list.replaceChildren(...all.map((rec) => {
    const li = document.createElement('li');
    const open = document.createElement('button');
    open.className = 'open';
    const name = document.createElement('span');
    name.className = 'name';
    name.textContent = rec.name;
    const meta = document.createElement('span');
    meta.className = 'info';
    meta.textContent = `${fmtDate(rec.openedAt)} · ${fmtSize(rec.size)}`;
    open.append(name, meta);
    open.onclick = () => view(rec);
    const rm = document.createElement('button');
    rm.className = 'del';
    rm.textContent = '削除';
    rm.onclick = async () => { await del(rec.name); showList(); };
    li.append(open, rm);
    return li;
  }));
  list.hidden = listLabel.hidden = all.length === 0;
  empty.hidden = all.length !== 0;
  count.textContent = `${all.length} 件`;
}

async function view(rec) {
  rec.openedAt = Date.now();
  await put(rec);
  home.hidden = true;
  openBtn.hidden = true;
  back.hidden = false;
  title.textContent = rec.name;
  // 表示のたびに iframe を作り直す（中身の差し替えはブラウザの戻る履歴を増やすため）。
  // sandbox に allow-same-origin を付けないので、レポートの JS はビューアーの保存領域に触れない。
  const frame = document.createElement('iframe');
  frame.id = 'frame';
  frame.title = '表示中のページ';
  frame.setAttribute('sandbox', 'allow-scripts allow-popups allow-forms allow-modals');
  frame.srcdoc = rec.html;
  document.body.append(frame);
}

fileInput.onchange = async () => {
  const file = fileInput.files[0];
  fileInput.value = '';
  if (!file) return;
  const html = await file.text();
  const rec = { name: file.name, html, size: file.size, openedAt: Date.now() };
  await put(rec);
  await prune();
  view(rec);
};

back.onclick = () => showList();

if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js');

showList();
