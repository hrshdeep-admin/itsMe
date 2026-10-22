/* Active Learning Module — no frameworks, accounts, trackers, or backend. */
(() => {
  'use strict';
  const STORAGE_KEY = 'alm-foundation-v1';
  const PHASES = [
    { key: 'review', label: 'Retrieve', mins: 10, subtitle: 'Remember what you learned' },
    { key: 'target', label: 'Objective', mins: 5, subtitle: 'Define a visible outcome' },
    { key: 'learn', label: 'Learn', mins: 15, subtitle: 'Acquire a practical method' },
    { key: 'practice', label: 'Practice', mins: 20, subtitle: 'Apply the method' },
    { key: 'test', label: 'Test', mins: 7, subtitle: 'Recall without notes' },
    { key: 'mission', label: 'Transfer', mins: 3, subtitle: 'Take action in real life' }
  ];
  const LOOK = [
    { icon: '◇', tint: '#e8e5fc', dark: '#7569bb' },
    { icon: '♡', tint: '#ffe7e3', dark: '#c86d64' },
    { icon: '◎', tint: '#e4f2ff', dark: '#4889b5' },
    { icon: '⌘', tint: '#fbecda', dark: '#b98849' },
    { icon: '↗', tint: '#e2f5ed', dark: '#438b6b' },
    { icon: '✧', tint: '#f5e6fc', dark: '#a16cba' },
    { icon: '⌂', tint: '#e2f2f2', dark: '#518f99' },
    { icon: '✺', tint: '#fff0d9', dark: '#b7893b' }
  ];
  let curriculum;
  let data;
  let running = false;
  let lastTick = 0;
  let currentDomain = 1;
  let toastTimeout;
  const $ = (id) => document.getElementById(id);
  const esc = (value) => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const dateText = (iso, long = false) => {
    if (!iso) return 'Not scheduled';
    const parsed = new Date(iso);
    return Number.isNaN(parsed.getTime()) ? 'Unknown date' : parsed.toLocaleDateString(undefined, long ? {weekday:'short',month:'short',day:'numeric',year:'numeric'} : {month:'short',day:'numeric'});
  };
  const dateKey = (time) => {const d = new Date(time); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;};
  const getLesson = id => curriculum.lessons.find(l => l.id === id);
  const sortTime = (a, b) => new Date(a.dueAt || 0) - new Date(b.dueAt || 0);
  const newState = () => ({version:1, theme:'light', completions:[], active:null, reviews:[], reviewDrafts:{}, reviewLog:[]});
  const loadState = () => {
    try {
      const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
      if (!raw || raw.version !== 1 || !Array.isArray(raw.completions) || !Array.isArray(raw.reviews)) return newState();
      return { ...newState(), ...raw, reviewDrafts: raw.reviewDrafts && typeof raw.reviewDrafts === 'object' ? raw.reviewDrafts : {} };
    } catch (_) { return newState(); }
  };
  const save = () => { try { localStorage.setItem(STORAGE_KEY, JSON.stringify(data)); } catch (_) { toast('Storage unavailable or full. Export your backup now.'); } };
  const toast = (message) => {
    const el = $('toast'); el.textContent = message; el.classList.add('show');
    clearTimeout(toastTimeout); toastTimeout = setTimeout(() => el.classList.remove('show'), 4200);
  };
  const setTheme = () => {
    document.documentElement.dataset.theme = data.theme;
    $('theme-symbol').textContent = data.theme === 'dark' ? '☼' : '☾';
  };
  const completedCount = n => data.completions.filter(c => getLesson(c.lessonId)?.domain_number === n).length;
  const cycle = () => Math.min(4, Math.floor(data.completions.length / 8) + 1);
  const usedInCycle = () => new Set(data.completions.slice(Math.floor(data.completions.length / 8) * 8).map(c => getLesson(c.lessonId)?.domain_number));
  const remaining = () => Math.max(0, 32 - data.completions.length);
  const nextLesson = (n) => curriculum.lessons.find(l => l.domain_number === n && l.lesson_number === completedCount(n) + 1);
  const cycleEligible = (n) => completedCount(n) < 4 && !usedInCycle().has(n) && remaining() > 0;
  const dateOffset = (origin, days) => new Date(new Date(origin).getTime() + days * 86400000).toISOString();
  const currentWeekCompleted = () => {
    const today = new Date(); const weekday = (today.getDay() + 6) % 7;
    const monday = new Date(today.getFullYear(),today.getMonth(),today.getDate() - weekday);
    return data.completions.filter(x => new Date(x.completedAt) >= monday).length;
  };
  const dueReviews = () => {
    const now = Date.now();
    return data.reviews.filter(r => r.status === 'pending' &&
      (r.kind === 'next' ? Boolean(data.active && data.active.lessonId !== r.lessonId) : Boolean(r.dueAt && Date.parse(r.dueAt) <= now)))
      .sort((a,b) => (a.kind === 'next' ? -1 : b.kind === 'next' ? 1 : sortTime(a,b)));
  };
  const upcomingReviews = () => data.reviews.filter(r => r.status === 'pending' && !dueReviews().some(x => x.id === r.id))
    .sort((a,b) => a.kind === 'next' ? -1 : b.kind === 'next' ? 1 : sortTime(a,b));
  const progressPct = () => Math.round(data.completions.length / 32 * 100);
  const meter = (pct, cls = 'cycle') => `<div class="${cls}-bar"><div class="${cls}-fill" style="width:${Math.min(100, Math.max(0, pct))}%"></div></div>`;
  const badge = (text, kind = '') => `<span class="chip ${kind}">${esc(text)}</span>`;
  const button = (label, action, klass = 'btn-primary', extra = '') => `<button type="button" class="btn ${klass}" data-action="${action}" ${extra}>${label}</button>`;
  const updateSidebar = () => {
    $('sidebar-progress').innerHTML = `<div class="side-progress-line"><strong>${progressPct()}%</strong><span>Foundation</span></div>
      <div class="side-progress-bar"><div class="side-progress-fill" style="width:${progressPct()}%"></div></div>
      <div class="small" style="color:#acc5c7">${data.completions.length} of 32 lessons finished</div>`;
    const due = dueReviews().length;
    $('nav-review-count').hidden = due === 0;
    $('nav-review-count').textContent = String(due);
    $('today-text').textContent = new Date().toLocaleDateString(undefined, {weekday:'short',month:'short',day:'numeric'});
  };
  const stats = () => `<section class="stats-grid" aria-label="Learning statistics">
    <div class="stat-card"><span class="stat-label">Lessons finished</span><span class="stat-num">${data.completions.length}<span class="muted" style="font-size:16px"> / 32</span></span><div class="stat-support">${progressPct()}% through foundation</div></div>
    <div class="stat-card"><span class="stat-label">This week</span><span class="stat-num">${currentWeekCompleted()}<span class="muted" style="font-size:16px"> / 4</span></span><div class="stat-support">Four sessions is the weekly target</div></div>
    <div class="stat-card"><span class="stat-label">Current learning cycle</span><span class="stat-num">${data.completions.length === 32 ? 'Done' : String(cycle()).padStart(2,'0')}<span class="muted" style="font-size:16px"> / 04</span></span><div class="stat-support">${data.completions.length === 32 ? 'All four cycles completed' : `${usedInCycle().size} of 8 domains visited`}</div></div>
    <div class="stat-card"><span class="stat-label">Reviews waiting</span><span class="stat-num">${dueReviews().length}</span><div class="stat-support">Across all eight domains</div></div>
  </section>`;
  const domainCard = (d) => {
    const vis = LOOK[d.number - 1]; const count = completedCount(d.number); const used = usedInCycle().has(d.number);
    const label = count === 4 ? 'All lessons complete' : used ? 'Visited this cycle' : 'Ready to explore';
    return `<button type="button" class="domain-card ${used ? 'is-used':''}" data-action="open-domain" data-domain="${d.number}" style="--tint:${vis.tint};--dark:${vis.dark}" aria-label="Explore ${esc(d.name)}">
      <div class="domain-card-top"><span class="domain-icon" aria-hidden="true">${vis.icon}</span><span class="domain-index">DOMAIN ${String(d.number).padStart(2,'0')}</span></div>
      <h3>${esc(d.name)}</h3><p>${esc(d.purpose)}</p>
      <div>${meter(count * 25, 'domain')}<div class="domain-meta"><span>${count}/4 lessons</span><span>${count === 4 ? 'Complete' : used ? '✓ This cycle' : 'Explore ↗'}</span></div></div>
    </button>`;
  };
  const cycleCard = () => {
    const used = usedInCycle(); const done = data.completions.length === 32;
    return `<div class="card"><div class="subheading" style="margin-bottom:5px"><h3>Two-week balance</h3>${badge(done ? 'Foundation complete' : `Cycle ${cycle()} of 4`, 'green')}</div>
       <p class="muted small">Every domain gets one full hour per eight-session cycle. Choose the order; keep the balance.</p>
       ${meter(done ? 100 : used.size / 8 * 100)}
       <p class="small muted">${done ? 'All 32 lessons complete. Keep using the review queue.' : `${used.size}/8 domains visited · ${8-used.size} remaining this cycle`}</p>
       <div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:15px">${curriculum.domains.map(d => `<span title="${esc(d.name)}" class="chip ${done || used.has(d.number) ? 'green':''}">${String(d.number).padStart(2,'0')}${done || used.has(d.number) ? ' ✓':''}</span>`).join('')}</div>
    </div>`;
  };
  const dashboard = () => {
    const active = data.active;
    const next = active ? getLesson(active.lessonId) : null;
    const unsatisfied = data.completions.filter(c => c.missionStatus !== 'done').slice(-3).reverse();
    return `<div class="heading-row"><div><span class="eyebrow">YOUR PRIVATE LEARNING SPACE</span><h1>Welcome to the lab<span style="color:var(--accent)">.</span></h1><p class="section-desc">Four sessions a week. Eight equally important life domains. One practical skill at a time.</p></div></div>
      <section class="hero"><div><span class="eyebrow">${active ? 'YOUR NEXT STEP' : remaining() ? 'LET’S GET TO WORK' : 'FOUNDATION COMPLETE'}</span>
        <h1>${active ? 'Pick up where you left off.' : remaining() ? 'Less planning.<br>More becoming.' : '32 lessons. Real progress.'}</h1>
        <p>${active ? esc(next.title) : remaining() ? 'Learn it. Practice it. Prove it. Use it outside this hour.' : 'All eight domains visited in each of four cycles. Reviews and real-life application continue.'}</p>
        ${active ? button('↗ Resume active session','resume') : button(remaining() ? 'Explore your next lesson →' : 'Open review queue →', remaining() ? 'go-curriculum' : 'go-reviews')}
       </div><span class="hero-icon" aria-hidden="true">✳</span></section>
      ${stats()}
      <section class="two-col" style="margin-bottom:33px">${cycleCard()}
      <div class="card"><div class="subheading"><h3>Beyond the lesson</h3></div>
        ${unsatisfied.length ? `<p class="muted small" style="margin-bottom:13px">Check your real-life missions. Action matters as much as studying.</p>${unsatisfied.map(c => `<div style="border-top:1px solid var(--line);padding:12px 0"><strong class="small">${esc(getLesson(c.lessonId)?.title || c.lessonId)}</strong><p class="small muted" style="margin:5px 0">${esc(c.missionCue || 'Mission not specified')}</p><div class="tool-actions">${button('Done','mission-done','btn-soft btn-small',`data-record="${esc(c.id)}"`)}${button('Not yet','mission-pending','btn-plain btn-small',`data-record="${esc(c.id)}"`)}</div></div>`).join('')}` : `<div class="empty-state" style="padding:12px;border:0"><div class="big-icon">✧</div><h3>No open missions</h3><p>Finish a lesson to plan a concrete real-life action.</p></div>`}
      </div></section>
      <section><div class="subheading"><h2>Eight domains. Equal attention.</h2>${button('Full curriculum ↗','go-curriculum','btn-plain btn-small')}</div><div class="grid-domains">${curriculum.domains.map(domainCard).join('')}</div></section>`;
  };
  const lessonRow = (l, n) => {
    const count = completedCount(n), isComplete = l.lesson_number <= count;
    const isNext = l.lesson_number === count + 1, isActive = data.active?.lessonId === l.id;
    const eligible = isNext && cycleEligible(n) && !data.active;
    const status = isComplete ? badge('Completed','green') : isActive ? badge('In progress','gold') : eligible ? badge('Available','green') : badge(isNext ? 'Next cycle / blocked' : 'Upcoming');
    const action = isActive ? button('Resume ↗','resume','btn-primary btn-small') : eligible ? button('Begin →','start-lesson','btn-primary btn-small',`data-lesson="${l.id}"`) : isComplete ? button('Read again','read-lesson','btn-plain btn-small',`data-lesson="${l.id}"`) : '';
    return `<div class="lesson-row"><span class="lesson-number">${isComplete ? '✓':String(l.lesson_number).padStart(2,'0')}</span>
      <div class="lesson-info"><strong>${esc(l.title)}</strong><p>${esc(l.track)} · ${l.duration_minutes} minutes</p></div>${status}${action}</div>`;
  };
  const curriculumPage = () => `<div class="heading-row"><div><span class="eyebrow">CURRICULUM LIBRARY</span><h1>Your 32-lesson roadmap.</h1><p class="section-desc">Eight domains. Four increasingly focused lessons in each. Curated for practice, not endless consumption.</p></div>${badge(`${data.completions.length} / 32 completed`,'green')}</div>
      ${cycleCard()}<div class="subheading" style="margin-top:32px"><h2>Choose a domain</h2><span class="muted small">12.5% of total sessions per domain</span></div>
      <div class="grid-domains">${curriculum.domains.map(domainCard).join('')}</div>
      <div class="callout" style="margin-top:25px"><strong>How the curriculum works</strong><p>You may visit domains in any order, but a domain cannot receive a second new lesson until all eight have had their turn. Four cycles × eight domains = 32 lessons. Old lessons remain available for recall in the review queue.</p></div>
      ${resourcePanel()}`;
  const resourcePanel = () => `<section style="margin-top:29px"><div class="subheading"><h2>Reference library</h2></div><div class="card"><p class="muted small" style="margin-bottom:15px">External reading suggested by the curriculum. These pages may change; check their publication dates and suitability.</p><div class="tool-actions">${Object.entries(curriculum.reference_links || {}).map(([key,url]) => `<a class="btn btn-plain btn-small" href="${esc(url)}" target="_blank" rel="noopener noreferrer">${esc(key.charAt(0).toUpperCase()+key.slice(1))} ↗</a>`).join('')}</div></div></section>`;
  const domainPage = n => {
    const d = curriculum.domains.find(x => x.number === n); if (!d) return curriculumPage();
    const lessons = curriculum.lessons.filter(x => x.domain_number === n);
    const ok = cycleEligible(n);
    return `${button('← All domains','go-curriculum','btn-plain btn-small')}<div style="margin-top:23px" class="heading-row"><div><span class="eyebrow">DOMAIN ${String(n).padStart(2,'0')} / 08</span><h1>${esc(d.name)}</h1><p class="section-desc">${esc(d.purpose)} Each lesson has an explanation, exercises, three closed-book questions, and a real-world mission.</p></div>${badge(`${completedCount(n)} of 4 lessons`,'green')}</div>
      <div class="two-col"><div><div class="subheading"><h2>Learning sequence</h2></div><div class="lesson-list">${lessons.map(l => lessonRow(l,n)).join('')}</div></div>
      <div class="card"><h3>Ready for today's hour?</h3><p class="muted small" style="margin:10px 0 15px">${data.active ? 'One session is already open. Finish or abandon it to begin another.' : completedCount(n) >= 4 ? 'This domain is complete.' : ok ? 'This domain is eligible in the current two-week cycle.' : 'Already visited this cycle. Explore another domain first.'}</p>
      ${data.active ? button('Resume current session','resume') : ok ? button('Start next lesson →','start-lesson','btn-primary',`data-lesson="${nextLesson(n)?.id}"`) : ''}
      <div class="panel-divider"></div><div class="small muted">The next lesson unlocks automatically after finishing the previous one and cycling through the other seven domains.</div></div></div>`;
  };
  const initSession = lessonId => ({lessonId, stage:0, elapsed:[0,0,0,0,0,0], startedAt:new Date().toISOString(), objective:'', learnNotes:'', practice:['','','',''], testAnswers:['','',''], testSubmitted:false, testScores:[null,null,null], missionCue:'', missionNotes:'', reflection:''});
  const startLesson = id => {
    if (data.active) {toast('Finish or abandon your current session first.');return;}
    const l = getLesson(id);
    if (!l || !cycleEligible(l.domain_number) || nextLesson(l.domain_number)?.id !== id) {toast('This lesson is not available in the current cycle.');return;}
    data.active = initSession(id);
    save(); navigate('session'); toast('Session started. Begin with retrieval practice.');
  };
  const totalSeconds = () => data.active?.elapsed.reduce((sum,n) => sum + n,0) || 0;
  const timerDisplay = () => {
    const a = data.active; if (!a) return;
    const goal = PHASES[a.stage].mins * 60;
    const elapsed = Math.max(0,a.elapsed[a.stage] || 0);
    const seconds = Math.abs(goal - elapsed);
    const display = `${elapsed > goal ? '+':''}${String(Math.floor(seconds/60)).padStart(2,'0')}:${String(seconds%60).padStart(2,'0')}`;
    const timer = $('timer-remaining'); if (timer) { timer.textContent = display; timer.classList.toggle('overtime',elapsed > goal); }
    const bar = $('timer-progress'); if (bar) bar.style.width = `${Math.min(100,elapsed/goal*100)}%`;
    const total = $('session-total'); if (total) total.textContent = `${Math.floor(totalSeconds()/60)}m ${totalSeconds()%60}s`;
    const play = $('timer-toggle'); if (play) play.textContent = running ? 'Ⅱ Pause' : '▶ Start';
  };
  const pauseTimer = () => {running = false; lastTick = 0; save(); timerDisplay();};
  const tick = () => {
    if (!running || !data?.active) return;
    const now = Date.now(), delta = Math.floor((now - lastTick) / 1000);
    if (delta < 1) return;
    data.active.elapsed[data.active.stage] += Math.min(delta,300);
    lastTick += delta*1000;
    save(); timerDisplay();
  };
  const chooseStage = index => {
    if (!data.active) return;
    if (!Number.isInteger(index) || index<0 || index>5) return;
    pauseTimer(); data.active.stage = index; save(); render();
  };
  const stageNav = a => `<div class="stage-nav" aria-label="Session phases">${PHASES.map((p,i) => `<button class="stage-tab ${a.stage===i?'current':a.stage>i?'done':''}" data-action="change-stage" data-stage="${i}" type="button" aria-current="${a.stage===i ? 'step':'false'}"><small>${String(i+1).padStart(2,'0')} · ${p.mins} MIN</small><strong>${esc(p.label)}</strong></button>`).join('')}</div>`;
  const timerPanel = a => `<aside class="timer-panel" aria-label="Session timer"><div><span class="eyebrow">PHASE TIMER</span><div class="timer-number" id="timer-remaining">${String(PHASES[a.stage].mins).padStart(2,'0')}:00</div><div class="timer-subtitle">${esc(PHASES[a.stage].subtitle)}</div>
     <div class="timer-bar"><div class="timer-fill" id="timer-progress"></div></div><div class="timer-actions">${button('▶ Start','timer-toggle','btn-primary', 'id="timer-toggle"')}${button('↺ Reset','timer-reset','btn-plain')}</div></div>
     <div class="panel-divider"></div><div><div class="mini-steps"><div class="mini-step"><span>Current phase</span><b>${a.stage+1} / 6</b></div><div class="mini-step"><span>Allocated</span><b>${PHASES[a.stage].mins} min</b></div><div class="mini-step"><span>Total tracked</span><b id="session-total">0m</b></div><div class="mini-step"><span>Lesson budget</span><b>60 min</b></div></div><p class="timer-help">Timers are guides, not locks. Advance manually. Timer pauses when you leave this page.</p></div></aside>`;
  const stageReview = (l) => {
    const all = dueReviews().filter(x => x.lessonId !== data.active.lessonId).slice(0,3);
    return `<div class="stage-header"><div><span class="eyebrow">PHASE 01 · 10 MINUTES</span><h2>Retrieve before you learn.</h2></div>${badge('10 min')}</div>
      <p class="intro">Try remembering before opening any notes. It's the effort of retrieval that makes this useful.</p>
      ${all.length ? `<p class="small muted" style="margin-bottom:14px">${all.length} review prompt${all.length>1?'s':''} drawn from previous domains. Aim for four minutes of recall, four minutes answering, two minutes correcting.</p>
      <div class="review-queue">${all.map(r => reviewCard(r)).join('')}</div>
      ${dueReviews().length > 3 ? `<div class="inline-alert">More reviews waiting. Use the Review Queue after this session if needed.</div>`:''}` :
      `<div class="callout"><strong>${data.completions.length ? 'Nothing due right now' : 'First-ever session? Start here.'}</strong><p>${esc(l.revisit_10min.when_no_history)}</p></div>
      <div class="stage-section"><label class="field-label" for="reflection">What can you recall, explain, or connect from earlier experience?</label><textarea class="field" id="reflection" data-field="reflection" placeholder="Write from memory, then check what you might have missed…">${esc(data.active.reflection)}</textarea></div>`}
      <div class="inline-alert">Reminder: Review queue does not consume a domain's main learning slot. All eight still receive equal session allocation.</div>`;
  };
  const stageTarget = l => `<span class="eyebrow">PHASE 02 · 5 MINUTES</span><h2>Make the target observable.</h2><p class="intro">A useful lesson begins with knowing what you will be able to demonstrate.</p>
    <div class="callout"><strong>Learning objective</strong><p>${esc(l.objective)}</p></div>
    <div class="stage-section"><label for="objective" class="field-label">By minute 57, I can…</label><textarea id="objective" class="field" data-field="objective" placeholder="Complete the sentence with something you can actually show or do.">${esc(data.active.objective)}</textarea><div class="field-note">${esc(l.target_5min.instruction)}</div></div>
    <div class="callout"><strong>What you will produce</strong><p>${esc(l.deliverable)}</p></div>`;
  const stageLearn = l => `<span class="eyebrow">PHASE 03 · 15 MINUTES</span><h2>Learn one useful method.</h2><p class="intro">Read each point slowly; explain the idea in your own words before continuing. The minute markers help pace the teaching segment.</p>
    <div class="stage-section">${l.teach_15min.map(p => `<div class="learn-point"><span class="minute-badge">MIN ${String(p.minutes).padStart(2,'0')}</span><p>${esc(p.key_point)}</p></div>`).join('')}
    <div class="worked-example"><strong>Worked example</strong><p>${esc(l.worked_example)}</p></div>${l.safety_note ? `<div class="inline-alert warning"><strong>Safety note:</strong> ${esc(l.safety_note)}</div>`:''}</div>
    <div class="stage-section"><label for="learnNotes" class="field-label">My explanation in simple words (optional)</label><textarea class="field" id="learnNotes" data-field="learnNotes" placeholder="What is the method? When is it useful? What could go wrong?">${esc(data.active.learnNotes)}</textarea></div>`;
  const stagePractice = l => `<span class="eyebrow">PHASE 04 · 20 MINUTES</span><h2>Move from theory to ability.</h2><p class="intro">Four five-minute exercises. Use a real situation when safe and suitable; use a fictional case when privacy or safety matters.</p>
    ${l.practice_20min.map((x,i) => `<section class="exercise"><div class="exercise-title"><span class="round-num">${i+1}</span><span>Exercise ${i+1} <span class="muted">· 5 minutes</span></span></div>
      <p style="margin-bottom:12px;line-height:1.7">${esc(x.instruction)}</p><label class="field-label" for="practice-${i}">My work / evidence</label>
      <textarea id="practice-${i}" class="field" data-field="practice${i}" placeholder="Work through the exercise here, or note where you recorded it…">${esc(data.active.practice[i])}</textarea></section>`).join('')}
    <div class="callout"><strong>Expected artifact</strong><p>${esc(l.deliverable)}</p></div>`;
  const stageTest = l => {
    const a = data.active;
    const score = a.testScores.every(x => x !== null && x !== undefined) ? a.testScores.reduce((sum,n) => sum + Number(n),0) : null;
    return `<span class="eyebrow">PHASE 05 · 7 MINUTES</span><h2>Prove it without notes.</h2><p class="intro">Try all three questions independently. Submit before seeing the guide. Then evaluate each answer yourself: 0 = missing, 1 = partial, 2 = sound. Scores reflect demonstrated understanding, never personal worth.</p>
     ${l.test_7min.map((q,i) => `<div class="question-box"><h3>${i+1}. ${esc(q.question)}</h3><label class="field-label" for="test-${i}">Your answer</label>
       <textarea class="field" id="test-${i}" data-field="test${i}" ${a.testSubmitted ? 'readonly':''} placeholder="Answer from memory before submitting…">${esc(a.testAnswers[i])}</textarea>
       ${a.testSubmitted ? `<div class="answer-guide"><b>ANSWER GUIDE</b><p>${esc(q.answer_guide)}</p></div><div class="score-buttons" role="group" aria-label="Self-check question ${i+1}">
         ${[0,1,2].map(n => `<button type="button" class="score-option ${a.testScores[i]===n?'selected':''}" data-action="grade-test" data-question="${i}" data-score="${n}" aria-pressed="${a.testScores[i]===n}">${n===0?'0 · Needs work':n===1?'1 · Partial':'2 · Sound'}</button>`).join('')}</div>`:''}
      </div>`).join('')}
      ${!a.testSubmitted ? `<div style="margin-top:20px">${button('Submit all answers →','submit-test')}</div>` : `<div class="inline-alert good">Answers checked. ${score === null ? 'Optional: self-grade each answer using the guide.' : `Self-check: ${score}/6. ${score>=5?'Strong recall in this attempt.':'Revisit the points that need more practice.'}`} Continue to the real-world mission when ready.</div>`}`;
  };
  const stageMission = l => `<span class="eyebrow">PHASE 06 · 3 MINUTES</span><h2>Take this into real life.</h2><p class="intro">The hour ends; the learning shouldn't. Turn your new skill into one small action in a specific situation.</p>
    <div class="mission-box"><b>YOUR REAL-LIFE MISSION</b><p>${esc(l.mission_3min.action)}</p></div>
    <label class="field-label" for="missionCue">When and where will you try this?</label><textarea id="missionCue" class="field" data-field="missionCue" placeholder="Example: Tomorrow after lunch, I'll practice this once during a real conversation.">${esc(data.active.missionCue)}</textarea>
    <div class="stage-section"><label class="field-label" for="missionNotes">Short lesson summary / next action (optional)</label><textarea id="missionNotes" class="field" data-field="missionNotes" placeholder="What will I actually carry forward?">${esc(data.active.missionNotes)}</textarea><div class="field-note">${esc(l.mission_3min.logging)}</div></div>
    <div class="inline-alert">The real-life mission will appear on your dashboard after you finish this session. Mark it complete only after you actually do it.</div>
    <div style="margin-top:18px">${button('✓ Complete lesson','complete-session')}</div>`;
  const sessionPage = () => {
    if (!data.active) return dashboard();
    const a = data.active, l = getLesson(a.lessonId); if (!l) return `<div class="empty-state">Active lesson not found in curriculum.</div>`;
    const templates = [stageReview,stageTarget,stageLearn,stagePractice,stageTest,stageMission];
    return `<div class="session-heading">${button('← Back to dashboard','go-dashboard','btn-plain btn-small')}
      <div class="session-meta" style="margin-top:23px">${badge(esc(l.domain),'green')}${badge(l.id)}${badge('60-minute learning lab')}</div>
      <h1>${esc(l.title)}</h1><p class="lesson-subtitle">${esc(l.objective)}</p></div>
      ${l.safety_note ? `<div class="inline-alert warning" style="margin-bottom:18px"><strong>Safety note:</strong> ${esc(l.safety_note)}</div>`:''}${stageNav(a)}<div class="session-layout"><section class="session-paper">${templates[a.stage](l)}
        <div class="session-controls"><div>${button('← Previous phase','previous-stage','btn-plain',a.stage===0?'disabled':'')}</div>
        <div class="tool-actions">${button('End / discard session','abandon-session','btn-danger')}${a.stage<5 ? button('Next phase →','next-stage') : ''}</div></div>
       </section>${timerPanel(a)}</div>`;
  };
  const readingPage = id => {
    const l = getLesson(id); if (!l || !data.completions.some(c => c.lessonId === id)) return curriculumPage();
    return `<div class="heading-row"><div><span class="eyebrow">LESSON ARCHIVE · ${esc(l.id)}</span><h1>${esc(l.title)}</h1><p class="section-desc">Completed lesson · Open reference material for revision. Reviewing here does not count as a new domain session.</p></div>${badge('Previously completed','green')}</div>
    <div style="margin-bottom:22px">${button('← Return to domain','return-domain','btn-plain',`data-domain="${l.domain_number}"`)}</div>
    <div class="card"><h3>Goal</h3><p style="margin-top:9px">${esc(l.objective)}</p><div class="panel-divider"></div><h3>Key concepts</h3>
      ${l.teach_15min.map(p => `<div class="learn-point"><span class="minute-badge">MIN ${p.minutes}</span><p>${esc(p.key_point)}</p></div>`).join('')}
      <div class="worked-example"><strong>Worked example</strong><p>${esc(l.worked_example)}</p></div>
      ${l.safety_note ? `<div class="inline-alert warning">${esc(l.safety_note)}</div>`:''}
      <div class="stage-section"><h3>Practice exercises</h3>${l.practice_20min.map((p,i) => `<p style="margin-top:10px">${i+1}. ${esc(p.instruction)}</p>`).join('')}</div>
      <div class="stage-section"><h3>Recall test + answer guides</h3>${l.test_7min.map((q,i) => `<div class="question-box"><p><strong>${i+1}. ${esc(q.question)}</strong></p><div class="answer-guide"><b>GUIDE</b><p>${esc(q.answer_guide)}</p></div></div>`).join('')}</div>
      <div class="mission-box"><b>REAL-LIFE MISSION</b><p>${esc(l.mission_3min.action)}</p></div>
      <h3>Next recall prompt</h3><p style="margin-top:10px">${esc(l.next_review_prompt)}</p></div>`;
  };
  const reviewCard = r => {
    const l = getLesson(r.lessonId); if (!l) return '';
    const draft = data.reviewDrafts[r.id] || {answer:'',revealed:false};
    return `<article class="review-item"><div class="tool-actions">${badge(l.domain,'green')}${badge(r.kind === 'next'?'Next-session recall':r.kind==='week'?'One-week review':r.kind==='month'?'One-month review':'Extra practice','gold')}</div>
      <h3>${esc(l.title)}</h3><p><strong>Recall prompt:</strong> ${esc(l.next_review_prompt)}</p>
      <label class="field-label" for="review-${esc(r.id)}" style="margin-top:12px">Your answer from memory</label>
      <textarea id="review-${esc(r.id)}" class="field" data-review="${esc(r.id)}" placeholder="Recall without looking back at your lesson…">${esc(draft.answer)}</textarea>
      ${draft.revealed ? `<div class="review-detail"><strong class="small">Teaching points to check against</strong>${l.teach_15min.slice(0,4).map(p => `<p class="small" style="margin-top:7px">• ${esc(p.key_point)}</p>`).join('')}</div>
        <div class="review-controls">${button('✓ Recalled sufficiently','review-pass','btn-soft btn-small',`data-review-id="${esc(r.id)}"`)}${button('↻ Needs more practice','review-retry','btn-plain btn-small',`data-review-id="${esc(r.id)}"`)}</div>`:
        `<div class="review-controls">${button('Reveal teaching points','review-reveal','btn-plain btn-small',`data-review-id="${esc(r.id)}"`)}</div>`}</article>`;
  };
  const reviewsPage = () => {
    const due = dueReviews(), upcoming = upcomingReviews();
    return `<div class="heading-row"><div><span class="eyebrow">LONG-TERM RETENTION</span><h1>Remember it for real.</h1><p class="section-desc">Spaced retrieval: answer first, check later, revisit weak points. Reviews may come from any domain.</p></div>${badge(`${due.length} due now`,'green')}</div>
     ${due.length ? `<div class="subheading"><h2>Due reviews</h2></div><div class="review-queue">${due.map(reviewCard).join('')}</div>` : `<div class="empty-state"><div class="big-icon">✧</div><h3>All caught up.</h3><p>Nothing due right now. New review prompts will appear after completed lessons, in the next session, at roughly one week, and at roughly one month.</p></div>`}
     <div class="subheading" style="margin-top:34px"><h2>Scheduled next</h2></div>
     ${upcoming.length ? `<div class="lesson-list">${upcoming.slice(0,18).map(r => `<div class="lesson-row"><span class="lesson-number">↻</span><div class="lesson-info"><strong>${esc(getLesson(r.lessonId)?.title || r.lessonId)}</strong><p>${r.kind === 'next' ? 'Available when you start your next session' : `Due ${dateText(r.dueAt, true)}`}</p></div>${badge(r.kind === 'next'?'Next session':r.kind,'gold')}</div>`).join('')}</div>${upcoming.length>18?`<p class="muted small" style="margin-top:10px">And ${upcoming.length-18} more upcoming prompts.</p>`:''}` : `<p class="muted">No future prompts yet.</p>`}`;
  };
  const historyPage = () => {
    const revCount = data.reviewLog.length;
    return `<div class="heading-row"><div><span class="eyebrow">LEARNING ARCHIVE</span><h1>Evidence of progress.</h1><p class="section-desc">Saved locally on this device, not on GitHub. Export a backup to avoid losing progress if browser storage is cleared.</p></div>${badge(`${data.completions.length} sessions`,'green')}</div>
      <div class="tool-actions" style="margin-bottom:25px">${button('⇩ Export all progress','export','btn-primary')}${button('⇧ Import backup','import','btn-plain')}</div>
      <div class="stats-grid" style="grid-template-columns:repeat(2,minmax(0,1fr))"><div class="stat-card"><span class="stat-label">Finished lessons</span><span class="stat-num">${data.completions.length}</span></div><div class="stat-card"><span class="stat-label">Review attempts</span><span class="stat-num">${revCount}</span></div></div>
      <div class="subheading"><h2>Session history</h2></div>
      ${data.completions.length ? `<div class="history-grid">${data.completions.slice().reverse().map(c => `<article class="history-record"><div class="record-date">${dateText(c.completedAt)}<div>${new Date(c.completedAt).toLocaleTimeString(undefined,{hour:'numeric',minute:'2-digit'})}</div></div>
      <span class="lesson-number">✓</span><div class="record-copy"><strong>${esc(getLesson(c.lessonId)?.title || c.lessonId)}</strong><span>${esc(getLesson(c.lessonId)?.domain || 'Unknown domain')} · ${Math.floor((c.elapsed||[]).reduce((a,b)=>a+b,0)/60)} tracked minutes · Mission: ${c.missionStatus || 'pending'}</span></div>
      ${button('Details','history-detail','btn-plain btn-small',`data-record="${esc(c.id)}"`)}</article>`).join('')}</div>` : `<div class="empty-state"><div class="big-icon">◷</div><h3>No completed sessions yet.</h3><p>Your notes and test responses will appear here when you finish a lesson.</p></div>`}
      <div class="callout" style="margin-top:25px"><strong>Privacy & backup</strong><p>Your personal notes, answers, mission plans, and learning history live in this browser’s local storage. They are not uploaded anywhere by this site. If you clear browser data or switch devices, restore from a downloaded JSON backup. Never commit your exported backups or the private interview PDF to a public repository.</p></div>`;
  };
  const renderModal = (content) => {
    const old = $('alm-modal'); if (old) old.remove();
    const m = document.createElement('div');m.id = 'alm-modal'; m.className = 'modal-backdrop';
    m.innerHTML = `<div class="modal" role="dialog" aria-modal="true" aria-label="Session details">${content}<div class="modal-buttons" style="margin-top:20px">${button('Close','close-modal','btn-plain')}</div></div>`;
    document.body.appendChild(m);
    m.querySelector('[data-action="close-modal"]')?.focus();
  };
  const showHistoryDetail = id => {
    const c = data.completions.find(x => x.id === id); if (!c) return;
    const l = getLesson(c.lessonId);
    const score = Array.isArray(c.testScores) && c.testScores.every(x=>x!==null) ? `${c.testScores.reduce((a,b)=>a+Number(b),0)}/6` : 'Not graded';
    const segment = (name,text) => `<div class="stage-section"><strong>${esc(name)}</strong><p style="white-space:pre-wrap;margin-top:6px;font-size:12px">${esc(text || 'Not recorded')}</p></div>`;
    renderModal(`<span class="eyebrow">SESSION DETAILS · ${dateText(c.completedAt,true)}</span><h2>${esc(l?.title || c.lessonId)}</h2><p>${esc(l?.domain || '')} · Self-check: ${score}</p>
      ${segment('Objective',c.objective)}${segment('Study notes',c.learnNotes)}${segment('Practice work', (c.practice||[]).map((x,i)=>`Exercise ${i+1}: ${x}`).join('\n\n'))}
      ${segment('Test answers',(c.testAnswers||[]).map((x,i)=>`Q${i+1}: ${x}`).join('\n\n'))}
      ${segment('Mission plan',c.missionCue)}${segment('Mission notes',c.missionNotes)}${segment('Mission result',c.missionStatus || 'Pending')}`);
  };
  const render = () => {
    if (!curriculum || !data) return;
    setTheme(); updateSidebar();
    const route = (location.hash || '#dashboard').slice(1), page = route.startsWith('domain-') ? 'domain' : route.startsWith('reading-') ? 'reading' : route;
    const names = {dashboard:'DASHBOARD',curriculum:'CURRICULUM',reviews:'REVIEW QUEUE',history:'SESSION HISTORY',session:'LEARNING SESSION',domain:'DOMAIN CONTENT',reading:'LESSON ARCHIVE'};
    $('topbar-location').textContent = names[page] || 'YOUR LEARNING SPACE';
    document.querySelectorAll('[data-nav]').forEach(b => b.classList.toggle('active', b.dataset.nav === (page === 'domain' ? 'curriculum' : page === 'session' ? 'dashboard' : page)));
    if (page === 'domain') {currentDomain = Number(route.split('-')[1]) || 1; $('app').innerHTML = domainPage(currentDomain);}
    else if (page === 'reading') {$('app').innerHTML = readingPage(route.replace(/^reading-/,''));}
    else $('app').innerHTML = page === 'curriculum' ? curriculumPage() : page === 'reviews' ? reviewsPage() : page === 'history' ? historyPage() : page === 'session' && data.active ? sessionPage() : dashboard();
    timerDisplay();
  };
  const navigate = (page) => {if (running) pauseTimer();if (location.hash !== `#${page}`) location.hash = page;else render();window.scrollTo({top:0,behavior:'instant'});};
  const complete = () => {
    const a = data.active; if (!a) return;
    if (!a.testSubmitted) {toast('First submit your closed-book test.');chooseStage(4);return;}
    if (!a.missionCue.trim()) {toast('Add a specific when/where plan for your real-life mission.');return;}
    pauseTimer();
    const now = new Date().toISOString();
    const record = {...a,id:`${a.lessonId}-${Date.now()}`,completedAt:now,missionStatus:null};delete record.stage;
    data.completions.push(record);
    const lessonId = a.lessonId;
    data.reviews.push(
      {id:`${lessonId}:next`,lessonId,kind:'next',dueAt:null,status:'pending'},
      {id:`${lessonId}:week`,lessonId,kind:'week',dueAt:dateOffset(now,7),status:'pending'},
      {id:`${lessonId}:month`,lessonId,kind:'month',dueAt:dateOffset(now,30),status:'pending'}
    );
    data.active = null;
    save();navigate('dashboard');toast('Lesson completed! Real-life mission added to your dashboard.');
  };
  const markReview = (id, remembered) => {
    const review = data.reviews.find(x=>x.id===id && x.status==='pending'); if(!review) return;
    review.status = 'completed'; review.completedAt = new Date().toISOString();review.result = remembered ? 'recalled':'relearn';
    data.reviewLog.push({id:review.id,lessonId:review.lessonId,date:review.completedAt,result:review.result,answer:data.reviewDrafts[id]?.answer || ''});
    if (!remembered) { data.reviews.push({id:`${review.lessonId}:retry:${Date.now()}`,lessonId:review.lessonId,kind:'retry',dueAt:dateOffset(review.completedAt,3),status:'pending'}); }
    delete data.reviewDrafts[id]; save(); render();toast(remembered ? 'Review logged.' : 'Another review scheduled in three days.');
  };
  const downloadBackup = () => {
    const payload = {format:'ALM-BACKUP-v1',exportedAt:new Date().toISOString(),note:'Private local learning data. Do not upload to a public repository.',data};
    const blob = new Blob([JSON.stringify(payload,null,2)],{type:'application/json'}); const url = URL.createObjectURL(blob);
    const a=document.createElement('a');a.href=url;a.download=`alm-progress-${dateKey(Date.now())}.json`;
    document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1200);toast('Backup downloaded to your device.');
  };
  const restore = async file => {
    if (!file) return;
    if (file.size > 6*1024*1024) {toast('Backup file is unexpectedly large.');return;}
    try {
      const decoded=JSON.parse(await file.text());
      if (decoded.format!=='ALM-BACKUP-v1' || !decoded.data || decoded.data.version!==1 ||
        !Array.isArray(decoded.data.completions) || !Array.isArray(decoded.data.reviews) || !Array.isArray(decoded.data.reviewLog)) throw Error('Not a valid ALM backup.');
      if (!decoded.data.completions.every(c => typeof c.lessonId==='string' && getLesson(c.lessonId)) ||
          !decoded.data.reviews.every(r=>getLesson(r.lessonId))) throw Error('Backup refers to missing lessons.');
      if (!confirm('Replace all progress on this device with the imported backup? Export your current data first if you need it.')) return;
      pauseTimer();data={...newState(),...decoded.data};data.active && (data.active.stage=Math.max(0,Math.min(5,Number(data.active.stage)||0)));
      save();setTheme();navigate('dashboard');toast('Backup restored successfully.');
    } catch(err) {toast(`Could not import backup: ${err.message}`);} finally {$('import-file').value='';}
  };
  document.addEventListener('input', e => {
    if (e.target.matches('[data-field]') && data.active) {
      const field=e.target.dataset.field;
      if (field.startsWith('practice')) {const idx=Number(field.slice(8));if(idx>=0 && idx<4)data.active.practice[idx]=e.target.value;}
      else if (field.startsWith('test')) {const idx=Number(field.slice(4));if(!data.active.testSubmitted && idx>=0 && idx<3)data.active.testAnswers[idx]=e.target.value;}
      else if (['objective','learnNotes','missionCue','missionNotes','reflection'].includes(field)) data.active[field]=e.target.value;
      save();
    }
    if (e.target.matches('[data-review]')) {
      const key=e.target.dataset.review;data.reviewDrafts[key] ||= {answer:'',revealed:false};data.reviewDrafts[key].answer=e.target.value;save();
    }
  });
  document.addEventListener('click', e => {
    const nav=e.target.closest('[data-nav]'); if(nav) {e.preventDefault();navigate(nav.dataset.nav);return;}
    const b=e.target.closest('[data-action]');if(!b || b.disabled) return;
    const act=b.dataset.action;
    if (act==='toggle-theme') {data.theme=data.theme==='dark'?'light':'dark';save();setTheme();return;}
    if (act==='export'){downloadBackup();return;}
    if (act==='import'){$('import-file').click();return;}
    if (act==='go-dashboard'){navigate('dashboard');return;}
    if (act==='go-curriculum'){navigate('curriculum');return;}
    if (act==='go-reviews'){navigate('reviews');return;}
    if (act==='resume'){navigate('session');return;}
    if (act==='open-domain'){navigate('domain-'+b.dataset.domain);return;}
    if (act==='start-lesson'){startLesson(b.dataset.lesson);return;}
    if (act==='read-lesson'){navigate('reading-'+b.dataset.lesson);return;}
    if (act==='return-domain'){navigate('domain-'+b.dataset.domain);return;}
    if (act==='change-stage'){chooseStage(Number(b.dataset.stage));return;}
    if (act==='next-stage'){chooseStage((data.active?.stage ?? 0)+1);return;}
    if (act==='previous-stage'){chooseStage((data.active?.stage ?? 0)-1);return;}
    if (act==='timer-toggle') {
      if(!data.active)return;
      if(running)pauseTimer(); else {running=true;lastTick=Date.now();timerDisplay();}
      return;
    }
    if (act==='timer-reset') {
      if(!data.active)return;
      if(confirm('Reset the timer for this phase? Notes will be kept.')) {pauseTimer();data.active.elapsed[data.active.stage]=0;save();timerDisplay();}
      return;
    }
    if (act==='abandon-session') {if(confirm('Discard the active session and its unsaved-in-history work? Completed lessons and reviews are unaffected.')) {pauseTimer();data.active=null;save();navigate('dashboard');toast('Session discarded.');}return;}
    if (act==='submit-test') {
      if(!data.active)return;
      if(data.active.testAnswers.some(x=>!x.trim())) {toast('Answer all three questions. “I do not know” is a valid honest attempt.');return;}
      data.active.testSubmitted=true;save();render();toast('Answer guides unlocked. Self-check each answer.');return;
    }
    if (act==='grade-test'){if(!data.active?.testSubmitted)return;data.active.testScores[Number(b.dataset.question)]=Number(b.dataset.score);save();render();return;}
    if (act==='complete-session'){complete();return;}
    if (act==='review-reveal') {const id=b.dataset.reviewId;data.reviewDrafts[id] ||= {answer:'',revealed:false};if(!data.reviewDrafts[id].answer.trim()){toast('Try an answer from memory first, even if uncertain.');return;}data.reviewDrafts[id].revealed=true;save();render();return;}
    if (act==='review-pass'){markReview(b.dataset.reviewId,true);return;}
    if (act==='review-retry'){markReview(b.dataset.reviewId,false);return;}
    if (act==='mission-done' || act==='mission-pending') {const c=data.completions.find(x=>x.id===b.dataset.record);if(c){c.missionStatus=act==='mission-done'?'done':'not-yet';c.missionUpdatedAt=new Date().toISOString();save();render();toast(act==='mission-done'?'Real-life mission logged as done.':'Mission logged as not yet completed.');}return;}
    if (act==='history-detail'){showHistoryDetail(b.dataset.record);return;}
    if (act==='close-modal'){$('alm-modal')?.remove();return;}
  });
  window.addEventListener('hashchange',()=>{if(running)pauseTimer();render();});
  window.addEventListener('beforeunload',()=>{if(running)pauseTimer();});
  document.addEventListener('keydown', e => {if(e.key==='Escape')$('alm-modal')?.remove();});
  $('import-file').addEventListener('change',e=>restore(e.target.files?.[0]));
  const bootstrap = async () => {
    try {
      const response=await fetch('./curriculum.json',{cache:'no-cache'});
      if(!response.ok)throw Error(`HTTP ${response.status}`);
      curriculum=await response.json();
      if(!Array.isArray(curriculum.domains) || curriculum.domains.length!==8 || !Array.isArray(curriculum.lessons) || curriculum.lessons.length!==32) throw Error('Expected 8 domains and 32 lessons.');
      data=loadState();
      if(data.active && !getLesson(data.active.lessonId)){data.active=null;save();}
      if(data.active && (!Array.isArray(data.active.elapsed) || data.active.elapsed.length!==6))data.active.elapsed=[0,0,0,0,0,0];
      render();setInterval(tick,250);
    } catch(error) {
      $('app').innerHTML=`<div class="empty-state"><div class="big-icon">!</div><h2>Curriculum unavailable</h2><p>The lessons could not load. Open the site through GitHub Pages or a local HTTP server (not by double-clicking index.html). Check that curriculum.json is in the same folder.</p><p class="small muted">${esc(error.message)}</p></div>`;
    }
  };
  bootstrap();
})();
