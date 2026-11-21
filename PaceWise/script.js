/* =====================================================
   PaceWise - script.js
   Plain JavaScript. No libraries, no internet needed.

   Sections:
   1. Data and settings
   2. Small helper functions
   3. Saving and loading (localStorage)
   4. Drawing the screens (DOM)
   5. Tasks and steps
   6. Today's Plan and Small Wins
   7. Focus timer
   8. Mood check-in
   9. Settings, backup, restore, clear
   10. Start-up: connecting events
   ===================================================== */

/* ---------- 1. Data and settings ---------- */
const KEY = 'pacewise_data';   // name used in localStorage
const MAX_TODAY = 3;           // Today's Plan limit
// The saved mood codes stay the same (old backups still work). Only the words and faces we show are new.
const MOODS = { ':D': 'Amazing', ':)': 'Good', ':|': 'Okay', ':(': 'Tired', ":'(": 'Overwhelmed' };
const FACES = { ':D': '😄', ':)': '🙂', ':|': '😐', ':(': '😴', ":'(": '😣' };
const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const RING_LENGTH = 565.5;     // length of the timer circle (2 x 3.14 x radius 90)

// Which screen each sidebar link opens, and which card to scroll to (if any)
const NAV = {
  today: { screen: 'today' }, tasks: { screen: 'tasks' }, progress: { screen: 'progress' }, settings: { screen: 'settings' },
  focus: { screen: 'today', card: 'focusCard' }, wins: { screen: 'today', card: 'winsCard' }, mood: { screen: 'today', card: 'moodCard' }
};

// A fresh, empty data object
const blank = () => ({ tasks: [], wins: [], moods: {}, sessions: [], work: 25, brk: 5, name: '' });

let S = blank();          // S holds ALL saved data
let filter = 'all';       // status filter: all / pending / done / due
let query = '';           // search text
let subject = '';         // subject filter ('' means all)
let showAllWins = false;  // Small Wins: false = latest 3 today, true = the whole week
let editTaskId = null;    // id of the task being edited
let editStepKey = null;   // 'taskId:stepId' of the step being edited
let msgTimer;             // timer that hides the message

// Timer state (not saved; the timer only runs while the page is open)
let tm = null;            // setInterval id (null = not running)
let endAt = 0;            // clock time (ms) when the running timer reaches 0
let phase = 'work';       // 'work' or 'break'
let longBreak = false;    // true when the break is the long one
let left = 25 * 60;       // seconds left on the timer

const openToday = new Set();   // tasks expanded in Today
const openStep = new Set();    // tasks whose "add step" form is open

/* ---------- 2. Small helper functions ---------- */
const $ = s => document.querySelector(s);
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

// Date -> 'YYYY-MM-DD' (local time)
function dkey(t) {
  const d = new Date(t);
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}
const todayKey = () => dkey(Date.now());

// The last n days as 'YYYY-MM-DD', oldest first, ending today
function lastDays(n) {
  const out = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    out.push(dkey(d));
  }
  return out;
}

// Make text safe before putting it inside HTML
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// Show a short message (type: 'ok' or 'err')
function msg(text, type) {
  const m = $('#msg');
  m.textContent = text;
  m.className = type || 'ok';
  m.style.display = 'block';
  clearTimeout(msgTimer);
  msgTimer = setTimeout(() => { m.style.display = 'none'; }, 3000);
}

/* ---------- 3. Saving and loading ---------- */

// Clean any data (from localStorage or a backup file) so the app cannot crash on it.
// Returns a good data object, or null if the data is not a PaceWise backup.
function normalize(d) {
  if (!d || typeof d !== 'object' || !Array.isArray(d.tasks)) return null;
  const out = blank();
  const isDay = v => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v);

  d.tasks.forEach(t => {
    if (!t || typeof t.name !== 'string' || !t.name.trim()) return;
    out.tasks.push({
      id: String(t.id || uid()),
      name: t.name.trim().slice(0, 60),
      subject: typeof t.subject === 'string' ? t.subject.trim().slice(0, 30) : '',
      due: isDay(t.due) ? t.due : '',
      today: !!t.today,
      done: !!t.done,
      steps: (Array.isArray(t.steps) ? t.steps : [])
        .filter(s => s && typeof s.text === 'string' && s.text.trim())
        .map(s => ({ id: String(s.id || uid()), text: s.text.trim().slice(0, 80), done: !!s.done }))
    });
  });

  // Keep the "only 3 tasks in Today" rule even for restored files
  let active = 0;
  out.tasks.forEach(t => {
    if (t.today && !t.done) { active++; if (active > MAX_TODAY) t.today = false; }
  });

  out.wins = (Array.isArray(d.wins) ? d.wins : [])
    .filter(w => w && typeof w.text === 'string' && Number.isFinite(w.ts))
    .map(w => ({ id: String(w.id || uid()), type: String(w.type || 'step'), text: w.text.slice(0, 120), ts: w.ts, ref: String(w.ref || '') }));

  out.sessions = (Array.isArray(d.sessions) ? d.sessions : [])
    .filter(x => x && Number.isFinite(x.ts) && Number.isFinite(x.min))
    .map(x => ({ ts: x.ts, min: x.min }));

  if (d.moods && typeof d.moods === 'object') {
    Object.keys(d.moods).forEach(k => {
      const v = d.moods[k];
      if (isDay(k) && v && MOODS[v.m]) out.moods[k] = { m: v.m, note: typeof v.note === 'string' ? v.note.slice(0, 80) : '' };
    });
  }

  if (typeof d.name === 'string') out.name = d.name.trim().slice(0, 20);   // older backups have no name
  if (Number.isInteger(d.work) && d.work >= 1 && d.work <= 90) out.work = d.work;
  if (Number.isInteger(d.brk) && d.brk >= 1 && d.brk <= 30) out.brk = d.brk;
  return out;
}

function loadData() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const d = normalize(JSON.parse(raw));
      if (!d) throw new Error('bad data');
      S = d;
    }
  } catch (e) {
    S = blank();
    msg('Saved data could not be read. Starting fresh.', 'err');
  }
  left = S.work * 60;
}

function saveData() {
  try { localStorage.setItem(KEY, JSON.stringify(S)); }
  catch (e) { msg('Could not save data in this browser.', 'err'); }
}

/* ---------- 4. Drawing the screens (DOM) ---------- */

// Open a screen (Today / Tasks / Progress / Settings). Links like Focus or Mood open Today and scroll to that card.
function showTab(name) {
  const target = NAV[name];
  document.querySelectorAll('.screen').forEach(s => s.classList.toggle('on', s.id === target.screen));
  document.querySelectorAll('#tabs button').forEach(b => {
    const on = b.dataset.go === name;
    b.classList.toggle('on', on);
    if (on) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current');
  });
  renderAll();
  if (target.card) document.getElementById(target.card).scrollIntoView({ behavior: 'smooth', block: 'center' });
  else window.scrollTo(0, 0);
}

// Due date helpers: '' (nothing), 'soon' (today to 2 days away) or 'over' (past)
function dueState(t) {
  if (t.done || !t.due) return '';
  const d = Math.round((new Date(t.due + 'T00:00') - new Date(todayKey() + 'T00:00')) / 864e5);
  return d < 0 ? 'over' : d <= 2 ? 'soon' : '';
}
function dueLabel(t) {
  const s = dueState(t);
  if (s === 'over') return 'Overdue';
  if (s === 'soon') return 'Due soon';
  return t.due ? 'Due ' + new Date(t.due + 'T00:00').toLocaleDateString('en', { month: 'short', day: 'numeric' }) : '';
}
const stepCount = t => [t.steps.filter(s => s.done).length, t.steps.length];

// Small chips under a task name: subject and due date
function tagsHtml(t) {
  const subjectTag = t.subject ? `<span class="tag">${esc(t.subject)}</span>` : '';
  const dueTag = t.due ? `<span class="tag ${dueState(t)}">${dueLabel(t)}</span>` : '';
  return subjectTag + dueTag;
}

// Progress bar with a "3/5 steps" label (used in Today and Tasks)
function meterHtml(t) {
  const [d, n] = stepCount(t);
  const pct = t.done ? 100 : n ? Math.round(d / n * 100) : 0;
  const label = n ? d + '/' + n + ' steps' : (t.done ? 'Done' : 'No steps yet');
  return `<div class="meterRow"><div class="meter"><i style="width:${pct}%"></i></div><span>${label}</span></div>`;
}

// HTML for the steps of one task. manage = true shows Edit / Remove (Tasks screen only)
function stepsHtml(t, manage) {
  if (!t.steps.length) return manage ? '' : '<li class="mut">No steps yet</li>';
  return t.steps.map(s => {
    if (manage && editStepKey === t.id + ':' + s.id) {
      return `<li><form class="stepEdit" data-t="${t.id}" data-s="${s.id}" novalidate>
        <input type="text" name="s" value="${esc(s.text)}" maxlength="80" aria-label="Edit step">
        <button class="link ac" type="submit">Save</button>
        <button class="link mut" type="button" data-act="cancelstep" data-id="${t.id}">Cancel</button></form></li>`;
    }
    const circle = `<button type="button" class="circle ${s.done ? 'on' : ''}" data-act="step" data-id="${t.id}" data-s="${s.id}" aria-label="${s.done ? 'Mark step as not done' : 'Mark step as done'}"></button>`;
    const tools = manage
      ? `<span class="stepTools"><button type="button" data-act="editstep" data-id="${t.id}" data-s="${s.id}">Edit</button><button type="button" data-act="delstep" data-id="${t.id}" data-s="${s.id}">Remove</button></span>`
      : '';
    return `<li>${circle}<span class="stxt ${s.done ? 'dim' : ''}">${esc(s.text)}</span>${tools}</li>`;
  }).join('');
}

// Greeting, date and the four stat tiles at the top of Today (all worked out from saved data)
function renderHeader() {
  const hour = new Date().getHours();
  const part = hour < 12 ? 'morning' : hour < 18 ? 'afternoon' : 'evening';
  $('#greeting').textContent = 'Good ' + part + (S.name ? ', ' + S.name : '') + '!';
  $('#todayDate').textContent = new Date().toLocaleDateString('en', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });

  const planned = S.tasks.filter(t => t.today);
  const stepsToday = S.wins.filter(w => w.type === 'step' && dkey(w.ts) === todayKey()).length;
  const mood = S.moods[todayKey()];
  const tiles = [
    ['i-check', planned.filter(t => t.done).length + ' / ' + planned.length, "Today's tasks done"],
    ['i-star', stepsToday, 'Steps completed today'],
    ['i-timer', todayRounds(), 'Focus sessions completed'],
    ['i-smile', mood ? MOODS[mood.m] : 'Not set', "Today's mood"]
  ];
  $('#statRow').innerHTML = tiles.map(t =>
    `<div class="stat"><span class="sico"><svg class="icon"><use href="#${t[0]}"></use></svg></span><div><b>${t[1]}</b><span>${t[2]}</span></div></div>`
  ).join('');
}

// Today's Plan: the tasks the student picked for today
function renderToday() {
  const L = S.tasks.filter(t => t.today);
  $('#planCount').textContent = L.filter(t => t.done).length + ' / ' + L.length + ' tasks';
  $('#todayList').innerHTML = L.length ? L.map((t, i) => {
    const open = openToday.has(t.id);
    const meta = [t.subject, dueLabel(t)].filter(Boolean).join(' · ');
    return `<li class="planItem ${t.done ? 'dim' : ''}">
      <span class="num">${i + 1}</span>
      <div class="pmain"><button type="button" class="pname" data-act="open" data-id="${t.id}" aria-expanded="${open}">${esc(t.name)}</button>${meta ? '<small>' + esc(meta) + '</small>' : ''}${meterHtml(t)}</div>
      <button type="button" class="check ${t.done ? 'on' : ''}" data-act="toggle" data-id="${t.id}" aria-label="${t.done ? 'Mark task as not done' : 'Mark task as done'}"></button>
      <button type="button" class="chev" data-act="open" data-id="${t.id}" aria-expanded="${open}" aria-label="Show or hide steps"><svg class="icon"><use href="#i-down"></use></svg></button>
      ${open ? `<ul class="steps">${stepsHtml(t, false)}<li><button type="button" class="link mut" data-act="untoday" data-id="${t.id}">Remove from Today</button></li></ul>` : ''}
    </li>`;
  }).join('') : '<li class="empty">Nothing here yet. Open Tasks and tap Add to Today (up to 3).</li>';
}

// Small Wins: latest 3 of today, or every win from the last 7 days after "View all"
function renderWins() {
  const weekStart = lastDays(7)[0];
  const today = S.wins.filter(w => dkey(w.ts) === todayKey()).reverse();       // newest first
  const week = S.wins.filter(w => dkey(w.ts) >= weekStart).reverse();           // 'YYYY-MM-DD' text compares in date order
  const shown = showAllWins ? week : today.slice(0, 3);
  $('#winsList').innerHTML = shown.length ? shown.map(winHtml).join('') : '<li class="empty">No wins yet. Your first small step counts.</li>';
  $('#winsAllBtn').hidden = !showAllWins && week.length <= shown.length;       // hide the button when there is nothing more to show
  $('#winsAllBtn').textContent = showAllWins ? 'Show less' : 'View all';
  $('#winsSub').textContent = showAllWins ? 'Everything from the last 7 days.' : 'Celebrate every step forward.';
}

function winHtml(w) {
  const time = new Date(w.ts).toLocaleTimeString('en', { hour: 'numeric', minute: '2-digit' });
  const day = dkey(w.ts) === todayKey() ? '' : DAY_NAMES[new Date(w.ts).getDay()].slice(0, 3) + ' ';
  const icon = w.type === 'round' ? 'i-timer' : 'i-check';
  return `<li class="win ${esc(w.type)}"><span class="wico"><svg class="icon"><use href="#${icon}"></use></svg></span><div class="wtxt">${esc(w.text)}<small>${day}${time}</small></div></li>`;
}

// Mood card: highlight today's face and show a kind message
function renderMood() {
  const cur = S.moods[todayKey()];
  document.querySelectorAll('#moods button').forEach(b => b.classList.toggle('on', !!cur && b.dataset.m === cur.m));
  $('#moodHint').innerHTML = '<svg class="icon"><use href="#i-heart"></use></svg>' + (cur ? 'Thanks for checking in. You matter.' : 'Tap a face to save how you feel today.');
  if (document.activeElement !== $('#moodNote')) $('#moodNote').value = cur ? cur.note || '' : '';
}

// Fill the subject drop-down with the subjects that exist
function renderSubjects() {
  const subs = [...new Set(S.tasks.map(t => t.subject).filter(Boolean))].sort((a, b) => a.localeCompare(b));
  if (subject && !subs.includes(subject)) subject = '';
  const sel = $('#subjectFilter');
  sel.innerHTML = '<option value="">All subjects</option>' + subs.map(s => `<option value="${esc(s)}">${esc(s)}</option>`).join('');
  sel.value = subject;
}

function renderTasks() {
  renderSubjects();
  let L = S.tasks.slice();
  if (filter === 'pending') L = L.filter(t => !t.done);
  else if (filter === 'done') L = L.filter(t => t.done);
  else if (filter === 'due') L = L.filter(t => dueState(t));
  if (subject) L = L.filter(t => t.subject === subject);
  if (query) L = L.filter(t => (t.name + ' ' + t.subject).toLowerCase().includes(query));
  document.querySelectorAll('#filters button').forEach(b => b.classList.toggle('on', b.dataset.f === filter));

  const emptyText = S.tasks.length ? 'No tasks match.' : 'No tasks yet. Type a task above and tap +.';
  $('#taskList').innerHTML = L.length ? L.map(t => {
    // Edit mode: show a small form instead of the normal row
    if (editTaskId === t.id) {
      return `<li class="task"><form class="editForm" data-id="${t.id}" novalidate>
        <input type="text" name="n" value="${esc(t.name)}" maxlength="60" aria-label="Task name">
        <div class="more"><input type="text" name="sub" value="${esc(t.subject)}" maxlength="30" placeholder="Subject (optional)" aria-label="Subject"><input type="date" name="due" value="${esc(t.due)}" aria-label="Due date"></div>
        <div class="tools"><button type="submit" class="ac">Save</button><button type="button" data-act="canceledit" data-id="${t.id}">Cancel</button></div></form></li>`;
    }
    const tags = tagsHtml(t);
    return `<li class="task ${t.done ? 'dim' : ''}">
      <div class="trow"><div class="tmain"><b>${esc(t.name)}</b>${tags ? '<div class="tags">' + tags + '</div>' : ''}</div>${t.done ? '' : `<button type="button" class="todayBtn" data-act="today" data-id="${t.id}">${t.today ? 'In Today ✓' : 'Add to Today'}</button>`}</div>
      ${meterHtml(t)}
      <ul class="steps">${stepsHtml(t, !t.done)}</ul>
      ${t.done ? '' : `<button type="button" class="link ac addStep" data-act="stepform" data-id="${t.id}" aria-expanded="${openStep.has(t.id)}">+ Add step</button>
      <form class="stepForm" data-form="${t.id}" ${openStep.has(t.id) ? '' : 'hidden'} novalidate><input type="text" name="s" maxlength="80" placeholder="Describe a small step" aria-label="New step"><button class="plus sm" type="submit" aria-label="Save step">+</button></form>`}
      <div class="tools"><button type="button" data-act="done" data-id="${t.id}">${t.done ? 'Reopen' : 'Mark done'}</button><button type="button" data-act="edit" data-id="${t.id}">Edit</button><button type="button" data-act="del" data-id="${t.id}">Delete</button></div></li>`;
  }).join('') : `<li class="empty">${emptyText}</li>`;
}

// Add up the last 7 days. Used by the This Week card AND the Progress screen, so it lives in one place.
function weekTotals() {
  const days = lastDays(7);
  const mins = k => S.sessions.filter(x => dkey(x.ts) === k).reduce((a, x) => a + x.min, 0);   // focus minutes on day k
  const count = (k, type) => S.wins.filter(x => x.type === type && dkey(x.ts) === k).length;   // wins of one type on day k
  const sum = f => days.reduce((a, k) => a + f(k), 0);
  return {
    days, mins,
    tasks: sum(k => count(k, 'task')),
    steps: sum(k => count(k, 'step')),
    minutes: sum(mins),
    sessions: S.sessions.filter(x => days.includes(dkey(x.ts))).length
  };
}

// Draw the 7-day bar chart of focus minutes into one element (small or large)
function drawBars(box, w) {
  const max = Math.max(1, ...w.days.map(w.mins));
  box.innerHTML = w.days.map(k => {
    const m = w.mins(k), isToday = k === todayKey();
    const height = m ? Math.max(12, Math.round(m / max * 100)) : 5;          // percent of the chart height
    const dayName = DAY_NAMES[new Date(k + 'T00:00').getDay()];
    return `<div class="col ${isToday ? 'now' : ''}" title="${dayName}: ${m} min"><div class="track"><i class="${isToday ? 'now' : m ? 'on' : ''}" style="height:${height}%"></i></div>${dayName[0]}</div>`;
  }).join('');
}

// "This Week" card on Today
function renderWeek() {
  const w = weekTotals();
  drawBars($('#miniBars'), w);
  $('#miniStats').innerHTML = `<div><span>Steps completed</span><b>${w.steps}</b></div><div><span>Focus sessions</span><b>${w.sessions}</b></div>`;
}

// Progress screen: weekly summary, best day, bar chart and the mood week
function renderProgress() {
  const w = weekTotals();
  $('#stats').innerHTML = [['Tasks done', w.tasks], ['Steps done', w.steps], ['Focus minutes', w.minutes], ['Focus sessions', w.sessions]]
    .map(a => `<div><b>${a[1]}</b><span>${a[0]}</span></div>`).join('');

  // Best day = the day with the most focus minutes
  let best = null;
  w.days.forEach(k => { const m = w.mins(k); if (m > 0 && (!best || m > best.m)) best = { k, m }; });
  $('#bestDay').textContent = best
    ? 'Best day: ' + DAY_NAMES[new Date(best.k + 'T00:00').getDay()] + ' (' + best.m + ' min)'
    : 'Best day: finish a focus round to see it here.';

  drawBars($('#bars'), w);

  // One face for each of the last 7 days
  $('#moodWeek').innerHTML = w.days.map(k => {
    const v = S.moods[k], day = DAY_NAMES[new Date(k + 'T00:00').getDay()];
    const label = v ? day + ': ' + MOODS[v.m] + (v.note ? '. ' + v.note : '') : day + ': no mood saved';
    return `<div class="mday" title="${esc(label)}" aria-label="${esc(label)}"><span class="mface ${v ? '' : 'none'}">${v ? FACES[v.m] : '-'}</span>${day[0]}</div>`;
  }).join('');
}

function renderAll() { renderHeader(); renderToday(); renderWins(); renderMood(); renderWeek(); renderTasks(); renderProgress(); }

/* ---------- 5. Tasks and steps ---------- */

// Live hint while typing a task name
function checkNameLive() {
  const v = $('#taskName').value.trim();
  $('#nameHint').textContent = v && v.length < 3 ? 'Use at least 3 characters.' : '';
}

// Check a task. Returns an error text, or '' if everything is fine.
// skipId = the task being edited (so it does not clash with itself)
// keepDue = the old due date, which may stay even if it is already past
function validateTask(name, due, skipId, keepDue) {
  if (!name) return 'Please type a task name.';
  if (name.length < 3) return 'Task name needs at least 3 characters.';
  if (name.length > 60) return 'Keep the task name under 60 characters.';
  if (S.tasks.some(t => t.id !== skipId && !t.done && t.name.toLowerCase() === name.toLowerCase())) return 'This task is already on your list.';
  if (due && due < todayKey() && due !== keepDue) return 'The due date is already past. Pick today or a later date.';
  return '';
}

function addTask(e) {
  e.preventDefault();
  const name = $('#taskName').value.trim(), due = $('#taskDue').value;
  const err = validateTask(name, due);
  if (err) return msg(err, 'err');
  S.tasks.push({ id: uid(), name, subject: $('#taskSubject').value.trim(), due, steps: [], today: false, done: false });
  e.target.reset();
  $('#nameHint').textContent = '';
  saveData(); renderAll(); msg('Task added.');
}

// Save the inline edit form of a task (name, subject, due date)
function saveTaskEdit(form) {
  const t = S.tasks.find(x => x.id === form.dataset.id);
  if (!t) return;
  const name = form.querySelector('[name=n]').value.trim();
  const sub = form.querySelector('[name=sub]').value.trim();
  const due = form.querySelector('[name=due]').value;
  const err = validateTask(name, due, t.id, t.due);
  if (err) return msg(err, 'err');
  t.name = name; t.subject = sub; t.due = due;
  editTaskId = null;
  saveData(); renderAll(); msg('Task updated.');
}

function addStep(form) {
  const t = S.tasks.find(x => x.id === form.dataset.form);
  if (!t) return;
  const text = form.querySelector('input').value.trim();
  if (!text) return msg('Type a small step first.', 'err');
  if (text.length > 80) return msg('Keep the step under 80 characters.', 'err');
  t.steps.push({ id: uid(), text, done: false });
  syncDone(t);
  saveData(); renderAll(); msg('Step added.');
  focusField('[data-form="' + t.id + '"] input');
}

function saveStepEdit(form) {
  const t = S.tasks.find(x => x.id === form.dataset.t);
  const s = t && t.steps.find(x => x.id === form.dataset.s);
  if (!s) return;
  const text = form.querySelector('input').value.trim();
  if (!text) return msg('A step cannot be empty.', 'err');
  if (text.length > 80) return msg('Keep the step under 80 characters.', 'err');
  s.text = text;
  editStepKey = null;
  saveData(); renderAll(); msg('Step updated.');
}

// Put the cursor in a field after the screen is redrawn
function focusField(selector) {
  const el = document.querySelector(selector);
  if (el) el.focus();
}

// Mark a whole task done, or reopen it
function toggleTask(t) {
  if (t.done) return reopenTask(t);
  t.done = true;
  t.steps.forEach(s => { s.done = true; });
  addWin('task', 'Finished task: ' + t.name, t.id);
  msg('Task complete. Nice work!');
}

function reopenTask(t) {
  t.done = false;
  // A task with every step ticked would look finished, so start the steps again
  if (t.steps.length && t.steps.every(s => s.done)) t.steps.forEach(s => { s.done = false; });
  removeWin('task', t.id);
  keepTodayLimit(t);
}

function toggleStep(t, sid) {
  const s = t.steps.find(x => x.id === sid);
  if (!s) return;
  s.done = !s.done;
  if (s.done) addWin('step', 'Finished step: ' + s.text, s.id);
  else removeWin('step', s.id);     // un-ticking removes the win, so stats stay honest
  syncDone(t);
}

function removeStep(t, sid) {
  t.steps = t.steps.filter(x => x.id !== sid);
  removeWin('step', sid);
  syncDone(t);
}

// Make the task's "done" match its steps (all steps ticked = task done)
function syncDone(t) {
  if (!t.steps.length) return;
  const all = t.steps.every(x => x.done);
  if (all && !t.done) {
    t.done = true;
    addWin('task', 'Finished task: ' + t.name, t.id);
    msg('Task complete. Nice work!');
  } else if (!all && t.done) {
    t.done = false;
    removeWin('task', t.id);
    keepTodayLimit(t);
  }
}

/* ---------- 6. Today's Plan and Small Wins ---------- */
const activeToday = () => S.tasks.filter(x => x.today && !x.done).length;

function toggleToday(t) {
  if (t.today) { t.today = false; return; }
  if (activeToday() >= MAX_TODAY) return msg('Today already has 3 tasks. Finish or remove one first.', 'err');
  t.today = true;
  msg('Added to Today.');
}

// If reopening a task would put 4 tasks in Today, take it out of Today
function keepTodayLimit(t) {
  if (t.today && activeToday() > MAX_TODAY) {
    t.today = false;
    msg('Today already has 3 tasks, so this one was moved out of Today.', 'err');
  }
}

function addWin(type, text, ref) { S.wins.push({ id: uid(), type, text, ts: Date.now(), ref: ref || '' }); }
function removeWin(type, ref) { S.wins = S.wins.filter(w => !(w.type === type && w.ref === ref)); }

/* ---------- Search and filters ---------- */
function searchTasks() {
  query = $('#searchBox').value.trim().toLowerCase();
  renderTasks();
}
function filterSubject() {
  subject = $('#subjectFilter').value;
  renderTasks();
}

/* ---------- Clicks inside the Today list and the Task list ---------- */
function listClick(e) {
  const b = e.target.closest('[data-act]');
  if (!b) return;
  const t = S.tasks.find(x => x.id === b.dataset.id);
  if (!t) return;
  const a = b.dataset.act;

  // Actions that only change what is shown (nothing to save)
  if (a === 'open') { if (!openToday.delete(t.id)) openToday.add(t.id); return renderToday(); }
  if (a === 'stepform') {
    if (!openStep.delete(t.id)) openStep.add(t.id);
    renderTasks();
    return focusField('[data-form="' + t.id + '"] input');
  }
  if (a === 'edit') { editTaskId = t.id; editStepKey = null; renderTasks(); return focusField('.editForm [name=n]'); }
  if (a === 'canceledit') { editTaskId = null; return renderTasks(); }
  if (a === 'editstep') { editStepKey = t.id + ':' + b.dataset.s; renderTasks(); return focusField('.stepEdit input'); }
  if (a === 'cancelstep') { editStepKey = null; return renderTasks(); }

  // Actions that change the data
  if (a === 'toggle') toggleTask(t);
  else if (a === 'done') toggleTask(t);
  else if (a === 'step') toggleStep(t, b.dataset.s);
  else if (a === 'delstep') removeStep(t, b.dataset.s);
  else if (a === 'today') toggleToday(t);
  else if (a === 'untoday') t.today = false;
  else if (a === 'del') {
    if (!confirm('Delete this task?')) return;
    S.tasks = S.tasks.filter(x => x !== t);
    openToday.delete(t.id); openStep.delete(t.id);
  }
  saveData(); renderAll();
}

// Form submits inside the Task list: add step, edit step, edit task
function taskListSubmit(e) {
  e.preventDefault();
  const f = e.target;
  if (f.matches('.stepForm')) addStep(f);
  else if (f.matches('.stepEdit')) saveStepEdit(f);
  else if (f.matches('.editForm')) saveTaskEdit(f);
}

/* ---------- 7. Focus timer ---------- */
// Length of the current phase in seconds
const phaseSeconds = () => phase === 'work' ? S.work * 60 : (longBreak ? S.brk * 3 : S.brk) * 60;
const todayRounds = () => S.sessions.filter(x => dkey(x.ts) === todayKey()).length;
const clockText = () => String(Math.floor(left / 60)).padStart(2, '0') + ':' + String(left % 60).padStart(2, '0');

// Redraw everything about the timer: numbers, circle, labels and the main button
function updateClock() {
  $('#clock').textContent = clockText();
  $('#phase').textContent = phase === 'work' ? 'Focus' : (longBreak ? 'Long break' : 'Break');
  $('#ringBar').style.strokeDashoffset = RING_LENGTH * (1 - Math.min(1, left / phaseSeconds()));   // circle shrinks as time runs out

  // "Focus Round 2 of 4" while working, and what comes next below the buttons
  const round = todayRounds() % 4 + 1;
  $('#roundPill').textContent = phase === 'work' ? 'Focus Round ' + round + ' of 4' : (longBreak ? 'Long break' : 'Short break');
  if (phase === 'work') {
    const nextIsLong = round === 4;                                   // finishing round 4 gives the long break
    $('#nextUp').innerHTML = '<svg class="icon"><use href="#i-cup"></use></svg>Upcoming ' + (nextIsLong ? 'long break' : 'break') + ': ' + (nextIsLong ? S.brk * 3 : S.brk) + ' min';
  } else {
    $('#nextUp').innerHTML = '<svg class="icon"><use href="#i-timer"></use></svg>Next: Focus ' + S.work + ' min';
  }

  $('#startBtn').textContent = tm ? 'Pause' : (left < phaseSeconds() ? 'Resume' : 'Start');
  document.title = tm ? clockText() + ' - PaceWise' : 'PaceWise';   // see the time from another tab
}

function startTimer() {
  if (tm) return;
  if (left <= 0) left = phaseSeconds();
  endAt = Date.now() + left * 1000;     // use the real clock so the time stays correct
  tm = setInterval(tick, 500);
  updateClock();
}

function pauseTimer() {
  if (tm) {
    left = Math.max(0, Math.ceil((endAt - Date.now()) / 1000));
    clearInterval(tm); tm = null;
  }
  updateClock();
}

// The main button: Start/Resume when stopped, Pause when running
function startOrPause() {
  if (tm) pauseTimer(); else startTimer();
}

function resetTimer() {
  pauseTimer();
  phase = 'work'; longBreak = false;
  left = S.work * 60;
  updateClock();
}

// Skip to the next phase. A skipped focus round is NOT saved, so it never counts as a win.
function skipPhase() {
  pauseTimer();
  phase = phase === 'work' ? 'break' : 'work';
  longBreak = false;
  left = phaseSeconds();
  updateClock();
  msg(phase === 'break' ? 'Skipped to a break. This round was not counted.' : 'Back to focus time.');
}

function tick() {
  left = Math.max(0, Math.ceil((endAt - Date.now()) / 1000));
  if (left <= 0) endRound(); else updateClock();
}

function endRound() {
  clearInterval(tm); tm = null;
  if (phase === 'work') {
    S.sessions.push({ ts: Date.now(), min: S.work });
    addWin('round', 'Finished a ' + S.work + '-minute round', '');
    longBreak = todayRounds() % 4 === 0;      // every 4th round today = long break
    phase = 'break';
    left = phaseSeconds();
    msg(longBreak ? 'Four rounds done! Take a longer break.' : 'Round done. Take a short break.');
    saveData(); renderAll();
  } else {
    phase = 'work'; longBreak = false;
    left = phaseSeconds();
    msg('Break is over. Ready for the next round?');
  }
  updateClock();
}

/* ---------- 8. Mood check-in ---------- */
function saveMood(e) {
  const b = e.target.closest('[data-m]');
  if (!b) return;
  const old = S.moods[todayKey()];
  S.moods[todayKey()] = { m: b.dataset.m, note: old ? old.note : '' };
  saveData(); renderAll(); msg('Mood saved.');
}

function saveNote(e) {
  e.preventDefault();
  const cur = S.moods[todayKey()];
  if (!cur) return msg('Pick a mood first, then add a note.', 'err');
  const note = $('#moodNote').value.trim();
  if (note.length > 80) return msg('Keep the note under 80 characters.', 'err');
  cur.note = note;
  saveData(); renderAll(); msg(note ? 'Note saved.' : 'Note cleared.');
}

/* ---------- 9. Settings, backup, restore, clear ---------- */
function readMinutes() {
  const wTxt = $('#workMin').value, bTxt = $('#brkMin').value;
  const w = Number(wTxt), b = Number(bTxt);
  if (wTxt === '' || !Number.isInteger(w) || w < 1 || w > 90) return { err: 'Work minutes must be a whole number from 1 to 90.' };
  if (bTxt === '' || !Number.isInteger(b) || b < 1 || b > 30) return { err: 'Break minutes must be a whole number from 1 to 30.' };
  return { w, b };
}
function checkSettingsLive() { $('#setHint').textContent = readMinutes().err || ''; }

function saveSettings(e) {
  e.preventDefault();
  const r = readMinutes();
  if (r.err) return msg(r.err, 'err');
  const wasFull = left === phaseSeconds();       // was the timer untouched?
  S.work = r.w; S.brk = r.b;
  S.name = $('#userName').value.trim().slice(0, 20);
  if (!tm && wasFull) left = phaseSeconds();
  if (left > phaseSeconds()) left = phaseSeconds();
  saveData(); renderAll(); updateClock();
  msg(tm || !wasFull ? 'Settings saved. New times start with the next round.' : 'Settings saved.');
}

function initForms() {
  $('#userName').value = S.name;
  $('#workMin').value = S.work;
  $('#brkMin').value = S.brk;
  $('#setHint').textContent = '';
}

function backupData() {
  try {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([JSON.stringify(S, null, 2)], { type: 'application/json' }));
    a.download = 'pacewise-backup-' + todayKey() + '.json';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    msg('Backup file saved.');
  } catch (err) { msg('Backup failed in this browser.', 'err'); }
}

function restoreData(e) {
  const f = e.target.files[0];
  if (!f) return;
  const r = new FileReader();
  r.onload = () => {
    try {
      const d = normalize(JSON.parse(r.result));
      if (!d) throw new Error('bad file');
      if (!confirm('Replace your current data with this backup?')) return;
      pauseTimer();
      S = d;
      phase = 'work'; longBreak = false; left = S.work * 60;
      editTaskId = null; editStepKey = null; openToday.clear(); openStep.clear();
      saveData(); initForms(); renderAll(); updateClock(); msg('Data restored.');
    } catch (err) { msg('This file is not a valid PaceWise backup.', 'err'); }
  };
  r.onerror = () => msg('Could not read the file.', 'err');
  r.readAsText(f);
  e.target.value = '';      // lets the same file be chosen again later
}

function clearData() {
  if (!confirm('Delete ALL tasks, wins, moods, and settings? This cannot be undone.')) return;
  pauseTimer();
  S = blank();
  phase = 'work'; longBreak = false; left = S.work * 60;
  filter = 'all'; query = ''; subject = '';
  $('#searchBox').value = '';
  editTaskId = null; editStepKey = null; openToday.clear(); openStep.clear();
  saveData(); initForms(); renderAll(); updateClock(); msg('All data cleared.');
}

/* ---------- 10. Start-up: connect every event ---------- */
document.addEventListener('DOMContentLoaded', () => {
  loadData();
  initForms();

  // Navigation: any element with data-go="..." (sidebar, tab bar, "View full progress") opens that screen
  document.addEventListener('click', e => { const b = e.target.closest('[data-go]'); if (b) showTab(b.dataset.go); });

  // Today screen shortcuts
  $('#addTaskBtn').addEventListener('click', () => { showTab('tasks'); $('#taskName').focus(); });
  $('#goTasksBtn').addEventListener('click', () => { showTab('tasks'); msg('Tap Add to Today on a task (up to 3).'); });
  $('#winsAllBtn').addEventListener('click', () => { showAllWins = !showAllWins; renderWins(); });

  // Tasks screen
  $('#taskForm').addEventListener('submit', addTask);
  $('#taskName').addEventListener('input', checkNameLive);
  $('#moreBtn').addEventListener('click', () => {
    const m = $('#moreFields');
    m.hidden = !m.hidden;
    $('#moreBtn').setAttribute('aria-expanded', String(!m.hidden));
  });
  $('#searchBox').addEventListener('input', searchTasks);
  $('#subjectFilter').addEventListener('change', filterSubject);
  $('#filters').addEventListener('click', e => { const b = e.target.closest('[data-f]'); if (b) { filter = b.dataset.f; renderTasks(); } });
  $('#todayList').addEventListener('click', listClick);
  $('#taskList').addEventListener('click', listClick);
  $('#taskList').addEventListener('submit', taskListSubmit);

  // Timer
  $('#startBtn').addEventListener('click', startOrPause);
  $('#skipBtn').addEventListener('click', skipPhase);
  $('#resetBtn').addEventListener('click', resetTimer);
  document.addEventListener('visibilitychange', () => { if (!document.hidden && tm) tick(); });

  // Progress screen
  $('#moods').addEventListener('click', saveMood);
  $('#moodForm').addEventListener('submit', saveNote);

  // Settings screen
  $('#workMin').addEventListener('input', checkSettingsLive);
  $('#brkMin').addEventListener('input', checkSettingsLive);
  $('#setForm').addEventListener('submit', saveSettings);
  $('#backupBtn').addEventListener('click', backupData);
  $('#chooseBtn').addEventListener('click', () => $('#restoreFile').click());
  $('#restoreFile').addEventListener('change', restoreData);
  $('#clearBtn').addEventListener('click', clearData);

  renderAll();
  updateClock();
});
