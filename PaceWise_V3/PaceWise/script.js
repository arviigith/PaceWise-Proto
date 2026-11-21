/* =====================================================
   PaceWise - script.js
   Plain JavaScript. No libraries, no internet needed.

   The big idea (the same for every button):
   user does something -> an event listener runs a function
   -> the function changes appData -> saveData() -> renderAll()

   Sections:
   1. Data and settings
   2. Small helper functions
   3. Finding and counting things
   4. Saving and loading (localStorage)
   5. Showing pages and drawing the screens (DOM)
   6. Tasks and steps
   7. Today's Plan and Small Wins
   8. Search, filters and list clicks
   9. Focus timer
   10. Mood check-in
   11. Settings, backup, restore, clear
   12. Start-up: connecting the events
   ===================================================== */


/* ---------- 1. Data and settings ---------- */
const STORAGE_KEY = 'pacewise_data';   // name used in localStorage
const MAX_TODAY = 3;                   // Today's Plan limit
const WINS_SHOWN = 6;                  // Small Wins shown before "View all"
const RING_LENGTH = 565.5;             // length of the timer circle (2 x 3.14 x radius 90)

// The saved mood codes (keys) must never change, or old backups would break.
const MOOD_NAMES = { ':D': 'Amazing', ':)': 'Good', ':|': 'Okay', ':(': 'Tired', ":'(": 'Overwhelmed' };
const MOOD_FACES = { ':D': '😄', ':)': '🙂', ':|': '😐', ':(': '😴', ":'(": '😣' };
const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

// appData holds ALL the saved information
let appData = blankData();

// Things the screen remembers while the page is open (not saved)
let currentFilter = 'all';     // all / pending / done / due
let searchText = '';           // text typed in the search box
let subjectFilter = '';        // '' means all subjects
let showAllWins = false;       // Small Wins: false = latest few, true = the whole week
let editTaskId = null;         // id of the task being edited
let editStepKey = null;        // 'taskId:stepId' of the step being edited
let openStepForms = [];        // ids of tasks whose "add step" form is open
let messageTimer;              // timer that hides the pop-up message

// Timer state (not saved; the timer only runs while the page is open)
let timerId = null;            // setInterval id (null = not running)
let endTime = 0;               // clock time (ms) when the running timer reaches 0
let phase = 'work';            // 'work' or 'break'
let isLongBreak = false;       // true when the break is the long one
let secondsLeft = 25 * 60;     // seconds left on the timer


/* ---------- 2. Small helper functions ---------- */

// A fresh, empty data object
function blankData() {
  return { tasks: [], wins: [], moods: {}, sessions: [], work: 25, brk: 5, name: '' };
}

// Shortcut: find one element on the page
function $(selector) {
  return document.querySelector(selector);
}

// Make a unique id from the time and a random number
function makeId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

function twoDigits(number) {
  if (number < 10) return '0' + number;
  return String(number);
}

// Turn a time into the text 'YYYY-MM-DD' (this is how we group data by day)
function dayKey(time) {
  const date = new Date(time);
  return date.getFullYear() + '-' + twoDigits(date.getMonth() + 1) + '-' + twoDigits(date.getDate());
}

function todayKey() {
  return dayKey(Date.now());
}

// The last n days as 'YYYY-MM-DD', oldest first, ending today
function lastDays(n) {
  const days = [];
  for (let i = n - 1; i >= 0; i--) {
    const date = new Date();
    date.setDate(date.getDate() - i);
    days.push(dayKey(date));
  }
  return days;
}

// The day name for a 'YYYY-MM-DD' text, for example 'Friday'
function dayNameOf(key) {
  return DAY_NAMES[new Date(key + 'T00:00').getDay()];
}

// Make text safe before putting it inside HTML (so typed text can never run as code)
function escapeHtml(text) {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// Show a short pop-up message. type is 'ok' (green) or 'err' (red).
function showMessage(text, type) {
  const box = $('#msg');
  box.textContent = text;
  box.className = type || 'ok';
  box.style.display = 'block';
  clearTimeout(messageTimer);
  messageTimer = setTimeout(hideMessage, 3000);
}

function hideMessage() {
  $('#msg').style.display = 'none';
}

// Put the cursor in a field (used after the screen is redrawn)
function focusField(selector) {
  const field = document.querySelector(selector);
  if (field) field.focus();
}


/* ---------- 3. Finding and counting things ---------- */

function findTask(id) {
  for (let i = 0; i < appData.tasks.length; i++) {
    if (appData.tasks[i].id === id) return appData.tasks[i];
  }
  return null;
}

function findStep(task, stepId) {
  for (let i = 0; i < task.steps.length; i++) {
    if (task.steps[i].id === stepId) return task.steps[i];
  }
  return null;
}

// All tasks chosen for Today (finished ones stay until removed)
function getTodayTasks() {
  const list = [];
  for (let i = 0; i < appData.tasks.length; i++) {
    if (appData.tasks[i].today) list.push(appData.tasks[i]);
  }
  return list;
}

// How many tasks in Today are NOT finished yet (this is what the limit of 3 counts)
function countActiveToday() {
  let count = 0;
  for (let i = 0; i < appData.tasks.length; i++) {
    if (appData.tasks[i].today && !appData.tasks[i].done) count++;
  }
  return count;
}

function countDoneSteps(task) {
  let count = 0;
  for (let i = 0; i < task.steps.length; i++) {
    if (task.steps[i].done) count++;
  }
  return count;
}

function allStepsDone(task) {
  for (let i = 0; i < task.steps.length; i++) {
    if (!task.steps[i].done) return false;
  }
  return true;
}

// How many wins of one type ('step', 'task' or 'round') happened on a day
function countWinsOnDay(day, type) {
  let count = 0;
  for (let i = 0; i < appData.wins.length; i++) {
    const win = appData.wins[i];
    if (win.type === type && dayKey(win.ts) === day) count++;
  }
  return count;
}

// Focus minutes saved on a day
function minutesOnDay(day) {
  let total = 0;
  for (let i = 0; i < appData.sessions.length; i++) {
    if (dayKey(appData.sessions[i].ts) === day) total = total + appData.sessions[i].min;
  }
  return total;
}

// Finished focus rounds on a day
function roundsOnDay(day) {
  let count = 0;
  for (let i = 0; i < appData.sessions.length; i++) {
    if (dayKey(appData.sessions[i].ts) === day) count++;
  }
  return count;
}

function todayRounds() {
  return roundsOnDay(todayKey());
}

// Add up the last 7 days (used by the Progress page)
function getWeekSummary() {
  const days = lastDays(7);
  const week = { days: days, tasks: 0, steps: 0, minutes: 0, sessions: 0 };
  for (let i = 0; i < days.length; i++) {
    week.tasks = week.tasks + countWinsOnDay(days[i], 'task');
    week.steps = week.steps + countWinsOnDay(days[i], 'step');
    week.minutes = week.minutes + minutesOnDay(days[i]);
    week.sessions = week.sessions + roundsOnDay(days[i]);
  }
  return week;
}

// Due date helper. Returns '' (nothing), 'soon' (today to 2 days away) or 'over' (past)
function dueState(task) {
  if (task.done || !task.due) return '';
  const oneDay = 24 * 60 * 60 * 1000;
  const daysLeft = Math.round((new Date(task.due + 'T00:00') - new Date(todayKey() + 'T00:00')) / oneDay);
  if (daysLeft < 0) return 'over';
  if (daysLeft <= 2) return 'soon';
  return '';
}

function dueLabel(task) {
  const state = dueState(task);
  if (state === 'over') return 'Overdue';
  if (state === 'soon') return 'Due soon';
  if (task.due) return 'Due ' + new Date(task.due + 'T00:00').toLocaleDateString('en', { month: 'short', day: 'numeric' });
  return '';
}


/* ---------- 4. Saving and loading ---------- */

function isDateText(value) {
  if (typeof value !== 'string' || value.length !== 10) return false;
  if (value.charAt(4) !== '-' || value.charAt(7) !== '-') return false;
  const year = Number(value.slice(0, 4));
  const month = Number(value.slice(5, 7));
  const day = Number(value.slice(8, 10));
  return year > 0 && month >= 1 && month <= 12 && day >= 1 && day <= 31;
}

function isWholeNumber(value, min, max) {
  return Number.isInteger(value) && value >= min && value <= max;
}

function cleanSteps(rawSteps) {
  const steps = [];
  if (!Array.isArray(rawSteps)) return steps;
  for (let i = 0; i < rawSteps.length; i++) {
    const step = rawSteps[i];
    if (step && typeof step.text === 'string' && step.text.trim() !== '') {
      steps.push({ id: String(step.id || makeId()), text: step.text.trim().slice(0, 80), done: !!step.done });
    }
  }
  return steps;
}

function cleanTasks(rawTasks) {
  const tasks = [];
  for (let i = 0; i < rawTasks.length; i++) {
    const task = rawTasks[i];
    if (!task || typeof task.name !== 'string' || task.name.trim() === '') continue;
    let subject = '';
    if (typeof task.subject === 'string') subject = task.subject.trim().slice(0, 30);
    let due = '';
    if (isDateText(task.due)) due = task.due;
    tasks.push({
      id: String(task.id || makeId()),
      name: task.name.trim().slice(0, 60),
      subject: subject,
      due: due,
      today: !!task.today,
      done: !!task.done,
      steps: cleanSteps(task.steps)
    });
  }
  return tasks;
}

// Keep the "only 3 tasks in Today" rule true, even for restored files
function limitTodayTasks(tasks) {
  let active = 0;
  for (let i = 0; i < tasks.length; i++) {
    if (tasks[i].today && !tasks[i].done) {
      active++;
      if (active > MAX_TODAY) tasks[i].today = false;
    }
  }
}

function cleanWins(rawWins) {
  const wins = [];
  if (!Array.isArray(rawWins)) return wins;
  for (let i = 0; i < rawWins.length; i++) {
    const win = rawWins[i];
    if (win && typeof win.text === 'string' && Number.isFinite(win.ts)) {
      wins.push({ id: String(win.id || makeId()), type: String(win.type || 'step'), text: win.text.slice(0, 120), ts: win.ts, ref: String(win.ref || '') });
    }
  }
  return wins;
}

function cleanSessions(rawSessions) {
  const sessions = [];
  if (!Array.isArray(rawSessions)) return sessions;
  for (let i = 0; i < rawSessions.length; i++) {
    const session = rawSessions[i];
    if (session && Number.isFinite(session.ts) && Number.isFinite(session.min)) {
      sessions.push({ ts: session.ts, min: session.min });
    }
  }
  return sessions;
}

function cleanMoods(rawMoods) {
  const moods = {};
  if (!rawMoods || typeof rawMoods !== 'object') return moods;
  for (const key in rawMoods) {
    const entry = rawMoods[key];
    if (isDateText(key) && entry && MOOD_NAMES[entry.m]) {
      let note = '';
      if (typeof entry.note === 'string') note = entry.note.slice(0, 80);
      moods[key] = { m: entry.m, note: note };
    }
  }
  return moods;
}

// Clean any data (from localStorage or a backup file) so the app cannot crash on it.
// Returns a good data object, or null if the data is not a PaceWise backup.
function normalizeData(raw) {
  if (!raw || typeof raw !== 'object' || !Array.isArray(raw.tasks)) return null;
  const clean = blankData();
  clean.tasks = cleanTasks(raw.tasks);
  limitTodayTasks(clean.tasks);
  clean.wins = cleanWins(raw.wins);
  clean.sessions = cleanSessions(raw.sessions);
  clean.moods = cleanMoods(raw.moods);
  if (typeof raw.name === 'string') clean.name = raw.name.trim().slice(0, 20);   // older backups have no name
  if (isWholeNumber(raw.work, 1, 90)) clean.work = raw.work;
  if (isWholeNumber(raw.brk, 1, 30)) clean.brk = raw.brk;
  return clean;
}

function loadData() {
  try {
    const savedText = localStorage.getItem(STORAGE_KEY);
    if (savedText) {
      const loaded = normalizeData(JSON.parse(savedText));
      if (!loaded) throw new Error('bad data');
      appData = loaded;
    }
  } catch (error) {
    appData = blankData();
    showMessage('Saved data could not be read. Starting fresh.', 'err');
  }
  secondsLeft = appData.work * 60;
}

function saveData() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(appData));
  } catch (error) {
    showMessage('Could not save data in this browser.', 'err');
  }
}


/* ---------- 5. Showing pages and drawing the screens (DOM) ---------- */

// Open one of the six pages: today, tasks, focus, progress, mood or settings
function showPage(name) {
  const pages = document.querySelectorAll('.screen');
  for (let i = 0; i < pages.length; i++) {
    if (pages[i].id === name) pages[i].classList.add('on');
    else pages[i].classList.remove('on');
  }

  const buttons = document.querySelectorAll('#tabs button');
  for (let i = 0; i < buttons.length; i++) {
    if (buttons[i].dataset.go === name) {
      buttons[i].classList.add('on');
      buttons[i].setAttribute('aria-current', 'page');
    } else {
      buttons[i].classList.remove('on');
      buttons[i].removeAttribute('aria-current');
    }
  }
  renderAll();
  window.scrollTo(0, 0);
}

// Draw every page from appData. Each page has its own render function.
function renderAll() {
  renderHome();
  renderTasks();
  renderFocusInfo();
  renderProgress();
  renderMood();
}

/* ----- Small pieces of HTML used on more than one page ----- */

// The small chips under a task name: subject and due date
function tagsHtml(task) {
  let html = '';
  if (task.subject) html += `<span class="tag">${escapeHtml(task.subject)}</span>`;
  if (task.due) html += `<span class="tag ${dueState(task)}">${dueLabel(task)}</span>`;
  return html;
}

// The progress bar with a "3/5 steps" label
function meterHtml(task) {
  const total = task.steps.length;
  const done = countDoneSteps(task);

  let percent = 0;
  if (task.done) percent = 100;
  else if (total > 0) percent = Math.round(done / total * 100);

  let label = 'No steps yet';
  if (total > 0) label = done + '/' + total + ' steps';
  else if (task.done) label = 'Done';

  return `<div class="meterRow"><div class="meter"><i style="width:${percent}%"></i></div><span>${label}</span></div>`;
}

// One small stat tile (icon + number + label)
function statTileHtml(icon, value, label) {
  return `<div class="stat"><span class="sico"><svg class="icon"><use href="#${icon}"></use></svg></span><div><b>${value}</b><span>${label}</span></div></div>`;
}

// One tile used inside the weekly and focus summaries
function summaryBoxHtml(value, label) {
  return `<div><b>${value}</b><span>${label}</span></div>`;
}

// The steps of one task. canEdit = true shows Edit / Remove buttons.
function stepsHtml(task, canEdit) {
  if (task.steps.length === 0) return '';
  let html = '';
  for (let i = 0; i < task.steps.length; i++) {
    const step = task.steps[i];

    // This step is being edited: show a small form
    if (canEdit && editStepKey === task.id + ':' + step.id) {
      html += `<li><form class="stepEdit" data-t="${task.id}" data-s="${step.id}" novalidate>
        <input type="text" name="s" value="${escapeHtml(step.text)}" maxlength="80" aria-label="Edit step">
        <button class="link ac" type="submit">Save</button>
        <button class="link mut" type="button" data-act="cancelstep" data-id="${task.id}">Cancel</button></form></li>`;
      continue;
    }

    let circleLabel = 'Mark step as done';
    let circleClass = 'circle';
    let textClass = 'stxt';
    if (step.done) {
      circleLabel = 'Mark step as not done';
      circleClass = 'circle on';
      textClass = 'stxt dim';
    }
    const circle = `<button type="button" class="${circleClass}" data-act="step" data-id="${task.id}" data-s="${step.id}" aria-label="${circleLabel}"></button>`;

    let tools = '';
    if (canEdit) {
      tools = `<span class="stepTools"><button type="button" data-act="editstep" data-id="${task.id}" data-s="${step.id}">Edit</button><button type="button" data-act="delstep" data-id="${task.id}" data-s="${step.id}">Remove</button></span>`;
    }
    html += `<li>${circle}<span class="${textClass}">${escapeHtml(step.text)}</span>${tools}</li>`;
  }
  return html;
}

/* ----- PAGE 1: Home ----- */

function renderHome() {
  // Greeting and date
  const hour = new Date().getHours();
  let part = 'evening';
  if (hour < 12) part = 'morning';
  else if (hour < 18) part = 'afternoon';
  let greeting = 'Good ' + part;
  if (appData.name) greeting = greeting + ', ' + appData.name;
  $('#greeting').textContent = greeting + '!';
  $('#todayDate').textContent = new Date().toLocaleDateString('en', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });

  // Numbers for the four tiles
  const todayTasks = getTodayTasks();
  let tasksDone = 0;
  for (let i = 0; i < todayTasks.length; i++) {
    if (todayTasks[i].done) tasksDone++;
  }
  const stepsToday = countWinsOnDay(todayKey(), 'step');
  let moodText = 'Not set';
  const todaysMood = appData.moods[todayKey()];
  if (todaysMood) moodText = MOOD_NAMES[todaysMood.m];

  $('#statRow').innerHTML =
    statTileHtml('i-check', tasksDone + ' / ' + todayTasks.length, "Today's tasks done") +
    statTileHtml('i-star', stepsToday, 'Steps completed today') +
    statTileHtml('i-timer', todayRounds(), 'Focus sessions completed') +
    statTileHtml('i-smile', moodText, "Today's mood");

  // Today's Plan: a short summary, one row for each task
  $('#planCount').textContent = tasksDone + ' / ' + todayTasks.length + ' tasks';
  let percent = 0;
  if (todayTasks.length > 0) percent = Math.round(tasksDone / todayTasks.length * 100);
  $('#planBar').style.width = percent + '%';
  $('#planPct').textContent = todayTasks.length > 0 ? percent + '% done' : 'No tasks planned yet';

  let html = '';
  for (let i = 0; i < todayTasks.length; i++) {
    const task = todayTasks[i];
    let meta = task.subject;
    if (dueLabel(task)) meta = meta ? meta + ' · ' + dueLabel(task) : dueLabel(task);
    let checkClass = 'check';
    let checkLabel = 'Mark task as done';
    let rowClass = 'planItem';
    if (task.done) {
      checkClass = 'check on';
      checkLabel = 'Mark task as not done';
      rowClass = 'planItem dim';
    }
    html += `<li class="${rowClass}">
      <span class="num">${i + 1}</span>
      <div class="pmain"><b class="pname">${escapeHtml(task.name)}</b>${meta ? '<small>' + escapeHtml(meta) + '</small>' : ''}${meterHtml(task)}</div>
      <button type="button" class="${checkClass}" data-act="toggle" data-id="${task.id}" aria-label="${checkLabel}"></button>
    </li>`;
  }
  if (html === '') html = '<li class="empty">Nothing here yet. Use "Plan a task" to pick up to 3.</li>';
  $('#todayList').innerHTML = html;
}

/* ----- PAGE 2: Tasks ----- */

// Fill the subject drop-down with the subjects that exist
function renderSubjects() {
  const subjects = [];
  for (let i = 0; i < appData.tasks.length; i++) {
    const subject = appData.tasks[i].subject;
    if (subject && subjects.indexOf(subject) === -1) subjects.push(subject);
  }
  subjects.sort();
  if (subjectFilter && subjects.indexOf(subjectFilter) === -1) subjectFilter = '';

  let options = '<option value="">All subjects</option>';
  for (let i = 0; i < subjects.length; i++) {
    options += `<option value="${escapeHtml(subjects[i])}">${escapeHtml(subjects[i])}</option>`;
  }
  const dropdown = $('#subjectFilter');
  dropdown.innerHTML = options;
  dropdown.value = subjectFilter;
}

// Does this task pass the status filter, subject filter and search text?
function taskPassesFilters(task) {
  if (currentFilter === 'pending' && task.done) return false;
  if (currentFilter === 'done' && !task.done) return false;
  if (currentFilter === 'due' && dueState(task) === '') return false;
  if (subjectFilter && task.subject !== subjectFilter) return false;
  if (searchText && (task.name + ' ' + task.subject).toLowerCase().indexOf(searchText) === -1) return false;
  return true;
}

// The small form shown while a task is being edited
function editTaskHtml(task) {
  return `<li class="task"><form class="editForm" data-id="${task.id}" novalidate>
    <input type="text" name="n" value="${escapeHtml(task.name)}" maxlength="60" aria-label="Task name">
    <div class="more"><input type="text" name="sub" value="${escapeHtml(task.subject)}" maxlength="30" placeholder="Subject (optional)" aria-label="Subject"><input type="date" name="due" value="${escapeHtml(task.due)}" aria-label="Due date"></div>
    <div class="tools"><button type="submit" class="ac">Save</button><button type="button" data-act="canceledit" data-id="${task.id}">Cancel</button></div></form></li>`;
}

// The normal card for one task
function taskCardHtml(task) {
  const tags = tagsHtml(task);
  const cardClass = task.done ? 'task dim' : 'task';

  // "Add to Today" button and the "add step" area only for unfinished tasks
  let todayButton = '';
  let addStepArea = '';
  if (!task.done) {
    const todayText = task.today ? 'In Today ✓' : 'Add to Today';
    todayButton = `<button type="button" class="todayBtn" data-act="today" data-id="${task.id}">${todayText}</button>`;

    const formIsOpen = openStepForms.indexOf(task.id) !== -1;
    addStepArea = `<button type="button" class="link ac addStep" data-act="stepform" data-id="${task.id}" aria-expanded="${formIsOpen}">+ Add step</button>
      <form class="stepForm" data-form="${task.id}" ${formIsOpen ? '' : 'hidden'} novalidate><input type="text" name="s" maxlength="80" placeholder="Describe a small step" aria-label="New step"><button class="btn soft" type="submit">Add</button></form>`;
  }
  const doneButtonText = task.done ? 'Reopen' : 'Mark done';

  return `<li class="${cardClass}">
    <div class="trow"><div class="tmain"><b>${escapeHtml(task.name)}</b>${tags ? '<div class="tags">' + tags + '</div>' : ''}</div>${todayButton}</div>
    ${meterHtml(task)}
    <ul class="steps">${stepsHtml(task, !task.done)}</ul>
    ${addStepArea}
    <div class="tools"><button type="button" data-act="done" data-id="${task.id}">${doneButtonText}</button><button type="button" data-act="edit" data-id="${task.id}">Edit</button><button type="button" data-act="del" data-id="${task.id}">Delete</button></div></li>`;
}

function renderTasks() {
  renderSubjects();

  // Highlight the active filter button
  const filterButtons = document.querySelectorAll('#filters button');
  for (let i = 0; i < filterButtons.length; i++) {
    if (filterButtons[i].dataset.f === currentFilter) filterButtons[i].classList.add('on');
    else filterButtons[i].classList.remove('on');
  }

  let html = '';
  for (let i = 0; i < appData.tasks.length; i++) {
    const task = appData.tasks[i];
    if (!taskPassesFilters(task)) continue;
    if (editTaskId === task.id) html += editTaskHtml(task);
    else html += taskCardHtml(task);
  }
  if (html === '') {
    if (appData.tasks.length > 0) html = '<li class="empty">No tasks match.</li>';
    else html = '<li class="empty">No tasks yet. Type a task above and tap Add.</li>';
  }
  $('#taskList').innerHTML = html;
}

/* ----- PAGE 3: Focus (the timer itself is drawn by updateClock in section 9) ----- */

function renderFocusInfo() {
  const rounds = todayRounds();
  $('#focusStats').innerHTML =
    summaryBoxHtml(rounds, 'Rounds today') +
    summaryBoxHtml(minutesOnDay(todayKey()), 'Focus minutes') +
    summaryBoxHtml(4 - (rounds % 4), 'Rounds to long break');

  let tip = '';
  if (rounds === 0) tip = 'Ready when you are. Press Start for your first round.';
  else if (rounds % 4 === 0) tip = 'Four rounds done. You earned a long break!';
  else tip = (4 - (rounds % 4)) + ' more round(s) until your long break.';
  $('#focusTip').textContent = tip;
}

/* ----- PAGE 4: Progress ----- */

// Draw the 7-day bar chart of focus minutes
function drawBars(box, days) {
  // Find the biggest day so the tallest bar fills the chart
  let biggest = 1;
  for (let i = 0; i < days.length; i++) {
    if (minutesOnDay(days[i]) > biggest) biggest = minutesOnDay(days[i]);
  }

  let html = '';
  for (let i = 0; i < days.length; i++) {
    const minutes = minutesOnDay(days[i]);
    const isToday = days[i] === todayKey();
    const dayName = dayNameOf(days[i]);

    let height = 5;                                                  // an empty day gets a tiny bar
    if (minutes > 0) height = Math.max(12, Math.round(minutes / biggest * 100));
    let barClass = '';
    if (isToday) barClass = 'now';
    else if (minutes > 0) barClass = 'on';

    html += `<div class="col ${isToday ? 'now' : ''}" title="${dayName}: ${minutes} min"><div class="track"><i class="${barClass}" style="height:${height}%"></i></div>${dayName.charAt(0)}</div>`;
  }
  box.innerHTML = html;
}

// One Small Win card
function winHtml(win) {
  const time = new Date(win.ts).toLocaleTimeString('en', { hour: 'numeric', minute: '2-digit' });
  let day = '';
  if (dayKey(win.ts) !== todayKey()) day = DAY_NAMES[new Date(win.ts).getDay()].slice(0, 3) + ' ';
  let icon = 'i-check';
  if (win.type === 'round') icon = 'i-timer';
  return `<li class="win ${escapeHtml(win.type)}"><span class="wico"><svg class="icon"><use href="#${icon}"></use></svg></span><div class="wtxt">${escapeHtml(win.text)}<small>${day}${time}</small></div></li>`;
}

function renderWeeklySummary() {
  const week = getWeekSummary();
  $('#stats').innerHTML =
    summaryBoxHtml(week.tasks, 'Tasks done') +
    summaryBoxHtml(week.steps, 'Steps done') +
    summaryBoxHtml(week.minutes, 'Focus minutes') +
    summaryBoxHtml(week.sessions, 'Focus sessions');

  // Best day = the day with the most focus minutes
  let bestDay = '';
  let bestMinutes = 0;
  for (let i = 0; i < week.days.length; i++) {
    const minutes = minutesOnDay(week.days[i]);
    if (minutes > bestMinutes) {
      bestMinutes = minutes;
      bestDay = week.days[i];
    }
  }
  if (bestDay) $('#bestDay').textContent = 'Best day: ' + dayNameOf(bestDay) + ' (' + bestMinutes + ' min)';
  else $('#bestDay').textContent = 'Best day: finish a focus round to see it here.';

  drawBars($('#bars'), week.days);
}

// Tasks that are marked done
function renderCompletedTasks() {
  let html = '';
  let count = 0;
  for (let i = appData.tasks.length - 1; i >= 0; i--) {          // newest first
    const task = appData.tasks[i];
    if (!task.done) continue;
    count++;
    html += `<li><span class="wico"><svg class="icon"><use href="#i-check"></use></svg></span><div><b>${escapeHtml(task.name)}</b><div class="tags">${tagsHtml(task)}</div></div></li>`;
  }
  if (html === '') html = '<li class="empty">No completed tasks yet. Finish one and it shows up here.</li>';
  $('#doneList').innerHTML = html;
  $('#doneCount').textContent = count + ' done';
}

// Small Wins: the wins of the last 7 days, newest first
function renderWins() {
  const weekStart = lastDays(7)[0];
  const weekWins = [];
  for (let i = appData.wins.length - 1; i >= 0; i--) {
    if (dayKey(appData.wins[i].ts) >= weekStart) weekWins.push(appData.wins[i]);   // 'YYYY-MM-DD' text sorts in date order
  }

  let shownCount = weekWins.length;
  if (!showAllWins && shownCount > WINS_SHOWN) shownCount = WINS_SHOWN;

  let html = '';
  for (let i = 0; i < shownCount; i++) {
    html += winHtml(weekWins[i]);
  }
  if (html === '') html = '<li class="empty">No wins yet. Your first small step counts.</li>';
  $('#winsList').innerHTML = html;

  // The button only appears when there is more to show
  const button = $('#winsAllBtn');
  button.hidden = weekWins.length <= WINS_SHOWN;
  button.textContent = showAllWins ? 'Show less' : 'View all (' + weekWins.length + ')';
  $('#winsSub').textContent = showAllWins ? 'Everything from the last 7 days.' : 'Celebrate every step forward.';
}

function renderProgress() {
  renderWeeklySummary();
  renderCompletedTasks();
  renderWins();
}

/* ----- PAGE 5: Mood ----- */

function renderMood() {
  const todaysMood = appData.moods[todayKey()];

  // Highlight today's face
  const faceButtons = document.querySelectorAll('#moods button');
  for (let i = 0; i < faceButtons.length; i++) {
    if (todaysMood && faceButtons[i].dataset.m === todaysMood.m) faceButtons[i].classList.add('on');
    else faceButtons[i].classList.remove('on');
  }

  let hint = 'Tap a face to save how you feel today.';
  if (todaysMood) hint = 'Thanks for checking in. You matter.';
  $('#moodHint').innerHTML = '<svg class="icon"><use href="#i-heart"></use></svg>' + hint;
  if (document.activeElement !== $('#moodNote')) {
    $('#moodNote').value = todaysMood ? todaysMood.note : '';
  }

  // One face for each of the last 7 days
  const days = lastDays(7);
  let weekHtml = '';
  for (let i = 0; i < days.length; i++) {
    const entry = appData.moods[days[i]];
    const dayName = dayNameOf(days[i]);
    let label = dayName + ': no mood saved';
    let face = '-';
    let faceClass = 'mface none';
    if (entry) {
      label = dayName + ': ' + MOOD_NAMES[entry.m];
      if (entry.note) label = label + '. ' + entry.note;
      face = MOOD_FACES[entry.m];
      faceClass = 'mface';
    }
    weekHtml += `<div class="mday" title="${escapeHtml(label)}" aria-label="${escapeHtml(label)}"><span class="${faceClass}">${face}</span>${dayName.charAt(0)}</div>`;
  }
  $('#moodWeek').innerHTML = weekHtml;

  // Earlier entries, newest first (the dates sort correctly as text)
  const keys = Object.keys(appData.moods);
  keys.sort();
  keys.reverse();
  let historyHtml = '';
  for (let i = 0; i < keys.length && i < 30; i++) {
    const entry = appData.moods[keys[i]];
    let dateText = new Date(keys[i] + 'T00:00').toLocaleDateString('en', { weekday: 'long', month: 'short', day: 'numeric' });
    if (keys[i] === todayKey()) dateText = 'Today';
    const noteText = entry.note ? escapeHtml(entry.note) : 'No note';
    historyHtml += `<li><span class="mface">${MOOD_FACES[entry.m]}</span><div><b>${dateText}: ${MOOD_NAMES[entry.m]}</b><small>${noteText}</small></div></li>`;
  }
  if (historyHtml === '') historyHtml = '<li class="empty">No mood saved yet. Pick a face above.</li>';
  $('#moodHistory').innerHTML = historyHtml;
}


/* ---------- 6. Tasks and steps ---------- */

// Live hint while typing a task name
function checkNameLive() {
  const name = $('#taskName').value.trim();
  if (name && name.length < 3) $('#nameHint').textContent = 'Use at least 3 characters.';
  else $('#nameHint').textContent = '';
}

// Check a task. Returns an error text, or '' if everything is fine.
// skipId = the task being edited (so it does not clash with itself)
// keepDue = the old due date, which may stay even if it is already past
function validateTask(name, due, skipId, keepDue) {
  if (!name) return 'Please type a task name.';
  if (name.length < 3) return 'Task name needs at least 3 characters.';
  if (name.length > 60) return 'Keep the task name under 60 characters.';

  for (let i = 0; i < appData.tasks.length; i++) {
    const other = appData.tasks[i];
    if (other.id !== skipId && !other.done && other.name.toLowerCase() === name.toLowerCase()) {
      return 'This task is already on your list.';
    }
  }
  if (due && due < todayKey() && due !== keepDue) return 'The due date is already past. Pick today or a later date.';
  return '';
}

function addTask(event) {
  event.preventDefault();                       // stop the page from reloading
  const name = $('#taskName').value.trim();
  const due = $('#taskDue').value;
  const error = validateTask(name, due);
  if (error) return showMessage(error, 'err');

  appData.tasks.push({ id: makeId(), name: name, subject: $('#taskSubject').value.trim(), due: due, steps: [], today: false, done: false });
  event.target.reset();
  $('#nameHint').textContent = '';
  saveData();
  renderAll();
  showMessage('Task added.');
}

// Save the edit form of a task (name, subject, due date)
function saveTaskEdit(form) {
  const task = findTask(form.dataset.id);
  if (!task) return;
  const name = form.querySelector('[name=n]').value.trim();
  const subject = form.querySelector('[name=sub]').value.trim();
  const due = form.querySelector('[name=due]').value;
  const error = validateTask(name, due, task.id, task.due);
  if (error) return showMessage(error, 'err');

  task.name = name;
  task.subject = subject;
  task.due = due;
  editTaskId = null;
  saveData();
  renderAll();
  showMessage('Task updated.');
}

function addStep(form) {
  const task = findTask(form.dataset.form);
  if (!task) return;
  const text = form.querySelector('input').value.trim();
  if (!text) return showMessage('Type a small step first.', 'err');
  if (text.length > 80) return showMessage('Keep the step under 80 characters.', 'err');

  task.steps.push({ id: makeId(), text: text, done: false });
  syncTaskDone(task);
  saveData();
  renderAll();
  showMessage('Step added.');
  focusField('[data-form="' + task.id + '"] input');
}

function saveStepEdit(form) {
  const task = findTask(form.dataset.t);
  if (!task) return;
  const step = findStep(task, form.dataset.s);
  if (!step) return;
  const text = form.querySelector('input').value.trim();
  if (!text) return showMessage('A step cannot be empty.', 'err');
  if (text.length > 80) return showMessage('Keep the step under 80 characters.', 'err');

  step.text = text;
  editStepKey = null;
  saveData();
  renderAll();
  showMessage('Step updated.');
}

// Mark a whole task done, or reopen it
function toggleTask(task) {
  if (task.done) return reopenTask(task);
  task.done = true;
  for (let i = 0; i < task.steps.length; i++) {
    task.steps[i].done = true;
  }
  addWin('task', 'Finished task: ' + task.name, task.id);
  showMessage('Task complete. Nice work!');
}

function reopenTask(task) {
  task.done = false;
  // A task with every step ticked would look finished, so start the steps again
  if (task.steps.length > 0 && allStepsDone(task)) {
    for (let i = 0; i < task.steps.length; i++) {
      task.steps[i].done = false;
    }
  }
  removeWin('task', task.id);
  keepTodayLimit(task);
}

function toggleStep(task, stepId) {
  const step = findStep(task, stepId);
  if (!step) return;
  step.done = !step.done;
  if (step.done) addWin('step', 'Finished step: ' + step.text, step.id);
  else removeWin('step', step.id);              // un-ticking removes the win, so the numbers stay honest
  syncTaskDone(task);
}

function removeStep(task, stepId) {
  const keptSteps = [];
  for (let i = 0; i < task.steps.length; i++) {
    if (task.steps[i].id !== stepId) keptSteps.push(task.steps[i]);
  }
  task.steps = keptSteps;
  removeWin('step', stepId);
  syncTaskDone(task);
}

// Make the task's "done" match its steps (all steps ticked = task done)
function syncTaskDone(task) {
  if (task.steps.length === 0) return;
  const everyStepDone = allStepsDone(task);
  if (everyStepDone && !task.done) {
    task.done = true;
    addWin('task', 'Finished task: ' + task.name, task.id);
    showMessage('Task complete. Nice work!');
  } else if (!everyStepDone && task.done) {
    task.done = false;
    removeWin('task', task.id);
    keepTodayLimit(task);
  }
}


/* ---------- 7. Today's Plan and Small Wins ---------- */

function toggleToday(task) {
  if (task.today) {
    task.today = false;
    return;
  }
  if (countActiveToday() >= MAX_TODAY) return showMessage('Today already has 3 tasks. Finish or remove one first.', 'err');
  task.today = true;
  showMessage('Added to Today.');
}

// If reopening a task would put 4 tasks in Today, take it out of Today
function keepTodayLimit(task) {
  if (task.today && countActiveToday() > MAX_TODAY) {
    task.today = false;
    showMessage('Today already has 3 tasks, so this one was moved out of Today.', 'err');
  }
}

function addWin(type, text, ref) {
  appData.wins.push({ id: makeId(), type: type, text: text, ts: Date.now(), ref: ref || '' });
}

function removeWin(type, ref) {
  const keptWins = [];
  for (let i = 0; i < appData.wins.length; i++) {
    const win = appData.wins[i];
    if (!(win.type === type && win.ref === ref)) keptWins.push(win);
  }
  appData.wins = keptWins;
}


/* ---------- 8. Search, filters and list clicks ---------- */

function searchTasks() {
  searchText = $('#searchBox').value.trim().toLowerCase();
  renderTasks();
}

function filterBySubject() {
  subjectFilter = $('#subjectFilter').value;
  renderTasks();
}

function handleFilterClick(event) {
  const button = event.target.closest('[data-f]');
  if (!button) return;
  currentFilter = button.dataset.f;
  renderTasks();
}

// Add or remove an id from a list (used for the open "add step" forms)
function toggleInList(list, id) {
  const position = list.indexOf(id);
  if (position === -1) list.push(id);
  else list.splice(position, 1);
}

// ONE listener handles every button inside the Home list and the Task list.
// Each button says what it does in data-act and which task it belongs to in data-id.
function listClick(event) {
  const button = event.target.closest('[data-act]');
  if (!button) return;
  const task = findTask(button.dataset.id);
  if (!task) return;
  const action = button.dataset.act;

  // Actions that only change what is shown (nothing to save)
  if (action === 'stepform') {
    toggleInList(openStepForms, task.id);
    renderTasks();
    return focusField('[data-form="' + task.id + '"] input');
  }
  if (action === 'edit') {
    editTaskId = task.id;
    editStepKey = null;
    renderTasks();
    return focusField('.editForm [name=n]');
  }
  if (action === 'canceledit') {
    editTaskId = null;
    return renderTasks();
  }
  if (action === 'editstep') {
    editStepKey = task.id + ':' + button.dataset.s;
    renderTasks();
    return focusField('.stepEdit input');
  }
  if (action === 'cancelstep') {
    editStepKey = null;
    return renderTasks();
  }

  // Actions that change the data
  if (action === 'toggle' || action === 'done') {
    toggleTask(task);
  } else if (action === 'step') {
    toggleStep(task, button.dataset.s);
  } else if (action === 'delstep') {
    removeStep(task, button.dataset.s);
  } else if (action === 'today') {
    toggleToday(task);
  } else if (action === 'del') {
    if (!confirm('Delete this task?')) return;
    deleteTask(task);
  }
  saveData();
  renderAll();
}

function deleteTask(task) {
  const keptTasks = [];
  for (let i = 0; i < appData.tasks.length; i++) {
    if (appData.tasks[i] !== task) keptTasks.push(appData.tasks[i]);
  }
  appData.tasks = keptTasks;
  const openPosition = openStepForms.indexOf(task.id);
  if (openPosition !== -1) openStepForms.splice(openPosition, 1);
}

// Form submits inside the Task list: add step, edit step, edit task
function taskListSubmit(event) {
  event.preventDefault();
  const form = event.target;
  if (form.matches('.stepForm')) addStep(form);
  else if (form.matches('.stepEdit')) saveStepEdit(form);
  else if (form.matches('.editForm')) saveTaskEdit(form);
}


/* ---------- 9. Focus timer ---------- */

// Length of the current phase in seconds
function phaseSeconds() {
  if (phase === 'work') return appData.work * 60;
  if (isLongBreak) return appData.brk * 3 * 60;
  return appData.brk * 60;
}

// The time as text, for example 24:32
function clockText() {
  return twoDigits(Math.floor(secondsLeft / 60)) + ':' + twoDigits(secondsLeft % 60);
}

// Redraw everything about the timer: numbers, circle, labels and the main button
function updateClock() {
  $('#clock').textContent = clockText();
  if (phase === 'work') $('#phase').textContent = 'Focus';
  else if (isLongBreak) $('#phase').textContent = 'Long break';
  else $('#phase').textContent = 'Break';

  // The circle shrinks as time runs out
  const fractionLeft = Math.min(1, secondsLeft / phaseSeconds());
  $('#ringBar').style.strokeDashoffset = RING_LENGTH * (1 - fractionLeft);

  // "Focus Round 2 of 4" while working, and what comes next below the buttons
  const round = todayRounds() % 4 + 1;
  if (phase === 'work') {
    $('#roundPill').textContent = 'Focus Round ' + round + ' of 4';
    let breakText = 'Upcoming break: ' + appData.brk + ' min';
    if (round === 4) breakText = 'Upcoming long break: ' + (appData.brk * 3) + ' min';   // finishing round 4 gives the long break
    $('#nextUp').innerHTML = '<svg class="icon"><use href="#i-cup"></use></svg>' + breakText;
  } else {
    $('#roundPill').textContent = isLongBreak ? 'Long break' : 'Short break';
    $('#nextUp').innerHTML = '<svg class="icon"><use href="#i-timer"></use></svg>Next: Focus ' + appData.work + ' min';
  }

  // Button text
  if (timerId) $('#startBtn').textContent = 'Pause';
  else if (secondsLeft < phaseSeconds()) $('#startBtn').textContent = 'Resume';
  else $('#startBtn').textContent = 'Start';

  // Show the time in the browser tab too
  document.title = timerId ? clockText() + ' - PaceWise' : 'PaceWise';
}

function startTimer() {
  if (timerId) return;
  if (secondsLeft <= 0) secondsLeft = phaseSeconds();
  endTime = Date.now() + secondsLeft * 1000;     // use the real clock so the time stays correct
  timerId = setInterval(tick, 500);
  updateClock();
}

function pauseTimer() {
  if (timerId) {
    secondsLeft = Math.max(0, Math.ceil((endTime - Date.now()) / 1000));
    clearInterval(timerId);
    timerId = null;
  }
  updateClock();
}

// The main button: Start/Resume when stopped, Pause when running
function startOrPause() {
  if (timerId) pauseTimer();
  else startTimer();
}

function resetTimer() {
  pauseTimer();
  phase = 'work';
  isLongBreak = false;
  secondsLeft = appData.work * 60;
  updateClock();
}

// Skip to the next phase. A skipped focus round is NOT saved, so it never counts as a win.
function skipPhase() {
  pauseTimer();
  if (phase === 'work') phase = 'break';
  else phase = 'work';
  isLongBreak = false;
  secondsLeft = phaseSeconds();
  updateClock();
  if (phase === 'break') showMessage('Skipped to a break. This round was not counted.');
  else showMessage('Back to focus time.');
}

// Runs every half second while the timer is on
function tick() {
  secondsLeft = Math.max(0, Math.ceil((endTime - Date.now()) / 1000));
  if (secondsLeft <= 0) endRound();
  else updateClock();
}

// The current phase reached 0
function endRound() {
  clearInterval(timerId);
  timerId = null;
  if (phase === 'work') {
    appData.sessions.push({ ts: Date.now(), min: appData.work });
    addWin('round', 'Finished a ' + appData.work + '-minute round', '');
    isLongBreak = todayRounds() % 4 === 0;      // every 4th round today = long break
    phase = 'break';
    secondsLeft = phaseSeconds();
    if (isLongBreak) showMessage('Four rounds done! Take a longer break.');
    else showMessage('Round done. Take a short break.');
    saveData();
    renderAll();
  } else {
    phase = 'work';
    isLongBreak = false;
    secondsLeft = phaseSeconds();
    showMessage('Break is over. Ready for the next round?');
  }
  updateClock();
}

// When the person comes back to this tab, fix the clock right away
function handleVisibilityChange() {
  if (!document.hidden && timerId) tick();
}


/* ---------- 10. Mood check-in ---------- */

function saveMood(event) {
  const button = event.target.closest('[data-m]');
  if (!button) return;
  const oldMood = appData.moods[todayKey()];
  let oldNote = '';
  if (oldMood) oldNote = oldMood.note;              // keep the note when the face changes
  appData.moods[todayKey()] = { m: button.dataset.m, note: oldNote };
  saveData();
  renderAll();
  showMessage('Mood saved.');
}

function saveNote(event) {
  event.preventDefault();
  const todaysMood = appData.moods[todayKey()];
  if (!todaysMood) return showMessage('Pick a mood first, then add a note.', 'err');
  const note = $('#moodNote').value.trim();
  if (note.length > 80) return showMessage('Keep the note under 80 characters.', 'err');

  todaysMood.note = note;
  saveData();
  renderAll();
  showMessage(note ? 'Note saved.' : 'Note cleared.');
}


/* ---------- 11. Settings, backup, restore, clear ---------- */

// Read and check the minutes. Returns { err } or { work, brk }.
function readMinutes() {
  const workText = $('#workMin').value;
  const breakText = $('#brkMin').value;
  const work = Number(workText);
  const brk = Number(breakText);
  if (workText === '' || !isWholeNumber(work, 1, 90)) return { err: 'Work minutes must be a whole number from 1 to 90.' };
  if (breakText === '' || !isWholeNumber(brk, 1, 30)) return { err: 'Break minutes must be a whole number from 1 to 30.' };
  return { work: work, brk: brk };
}

function checkSettingsLive() {
  const result = readMinutes();
  $('#setHint').textContent = result.err || '';
}

function saveSettings(event) {
  event.preventDefault();
  const result = readMinutes();
  if (result.err) return showMessage(result.err, 'err');

  const timerWasUntouched = secondsLeft === phaseSeconds();
  appData.work = result.work;
  appData.brk = result.brk;
  appData.name = $('#userName').value.trim().slice(0, 20);
  if (!timerId && timerWasUntouched) secondsLeft = phaseSeconds();
  if (secondsLeft > phaseSeconds()) secondsLeft = phaseSeconds();
  saveData();
  renderAll();
  updateClock();
  if (timerId || !timerWasUntouched) showMessage('Settings saved. New times start with the next round.');
  else showMessage('Settings saved.');
}

// Fill the settings boxes from the saved data
function fillSettingsForm() {
  $('#userName').value = appData.name;
  $('#workMin').value = appData.work;
  $('#brkMin').value = appData.brk;
  $('#setHint').textContent = '';
}

// Download appData as a .json file
function backupData() {
  try {
    const link = document.createElement('a');
    link.href = URL.createObjectURL(new Blob([JSON.stringify(appData, null, 2)], { type: 'application/json' }));
    link.download = 'pacewise-backup-' + todayKey() + '.json';
    document.body.appendChild(link);
    link.click();
    link.remove();
    showMessage('Backup file saved.');
  } catch (error) {
    showMessage('Backup failed in this browser.', 'err');
  }
}

function chooseRestoreFile() {
  $('#restoreFile').click();
}

// Put everything back to a clean start (used by restore and clear)
function resetScreenState() {
  pauseTimer();
  phase = 'work';
  isLongBreak = false;
  secondsLeft = appData.work * 60;
  editTaskId = null;
  editStepKey = null;
  openStepForms = [];
}

function restoreData(event) {
  const file = event.target.files[0];
  if (!file) return;
  const reader = new FileReader();

  reader.onload = function () {
    try {
      const restored = normalizeData(JSON.parse(reader.result));
      if (!restored) throw new Error('bad file');
      if (!confirm('Replace your current data with this backup?')) return;
      appData = restored;
      resetScreenState();
      saveData();
      fillSettingsForm();
      renderAll();
      updateClock();
      showMessage('Data restored.');
    } catch (error) {
      showMessage('This file is not a valid PaceWise backup.', 'err');
    }
  };
  reader.onerror = function () {
    showMessage('Could not read the file.', 'err');
  };
  reader.readAsText(file);
  event.target.value = '';      // lets the same file be chosen again later
}

function clearData() {
  if (!confirm('Delete ALL tasks, wins, moods, and settings? This cannot be undone.')) return;
  appData = blankData();
  resetScreenState();
  currentFilter = 'all';
  searchText = '';
  subjectFilter = '';
  $('#searchBox').value = '';
  saveData();
  fillSettingsForm();
  renderAll();
  updateClock();
  showMessage('All data cleared.');
}


/* ---------- 12. Start-up: connecting the events ---------- */

// Any button with data-go="..." (sidebar, tab bar, shortcuts, links) opens that page
function handleNavClick(event) {
  const button = event.target.closest('[data-go]');
  if (button) showPage(button.dataset.go);
}

function goToAddTask() {
  showPage('tasks');
  focusField('#taskName');
}

function planATask() {
  showPage('tasks');
  showMessage('Tap Add to Today on a task (up to 3).');
}

function toggleMoreFields() {
  const fields = $('#moreFields');
  fields.hidden = !fields.hidden;
  $('#moreBtn').setAttribute('aria-expanded', String(!fields.hidden));
}

function toggleAllWins() {
  showAllWins = !showAllWins;
  renderWins();
}

function connectEvents() {
  // Navigation and shortcuts
  document.addEventListener('click', handleNavClick);
  $('#addTaskBtn').addEventListener('click', goToAddTask);
  $('#shortcutTask').addEventListener('click', planATask);

  // Tasks page
  $('#taskForm').addEventListener('submit', addTask);
  $('#taskName').addEventListener('input', checkNameLive);
  $('#moreBtn').addEventListener('click', toggleMoreFields);
  $('#searchBox').addEventListener('input', searchTasks);
  $('#subjectFilter').addEventListener('change', filterBySubject);
  $('#filters').addEventListener('click', handleFilterClick);
  $('#todayList').addEventListener('click', listClick);
  $('#taskList').addEventListener('click', listClick);
  $('#taskList').addEventListener('submit', taskListSubmit);

  // Focus page
  $('#startBtn').addEventListener('click', startOrPause);
  $('#skipBtn').addEventListener('click', skipPhase);
  $('#resetBtn').addEventListener('click', resetTimer);
  document.addEventListener('visibilitychange', handleVisibilityChange);

  // Progress page
  $('#winsAllBtn').addEventListener('click', toggleAllWins);

  // Mood page
  $('#moods').addEventListener('click', saveMood);
  $('#moodForm').addEventListener('submit', saveNote);

  // Settings page
  $('#workMin').addEventListener('input', checkSettingsLive);
  $('#brkMin').addEventListener('input', checkSettingsLive);
  $('#setForm').addEventListener('submit', saveSettings);
  $('#backupBtn').addEventListener('click', backupData);
  $('#chooseBtn').addEventListener('click', chooseRestoreFile);
  $('#restoreFile').addEventListener('change', restoreData);
  $('#clearBtn').addEventListener('click', clearData);
}

function startApp() {
  loadData();
  fillSettingsForm();
  connectEvents();
  renderAll();
  updateClock();
}

document.addEventListener('DOMContentLoaded', startApp);
