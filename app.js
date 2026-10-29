// Countdown, snowfall, live spot counter, and registration form. No libraries.
(function () {
  const $ = (s) => document.querySelector(s);

  // Countdown to Thursday, Dec 10 (local time, 8:00 AM placeholder)
  const now = new Date();
  let target = new Date(now.getFullYear(), 11, 10, 8, 0, 0);
  if (target < now && now - target > 864e5) target = new Date(now.getFullYear() + 1, 11, 10, 8, 0, 0);
  function tick() {
    let d = Math.max(0, target - new Date());
    const parts = { days: 864e5, hrs: 36e5, min: 6e4, sec: 1e3 };
    for (const k in parts) { const v = Math.floor(d / parts[k]); d -= v * parts[k]; $('#c-' + k).textContent = String(v).padStart(2, '0'); }
  }
  tick(); setInterval(tick, 1000);

  // Snowfall (canvas, ~60 flakes, skipped for reduced motion)
  const cv = $('#snow');
  if (cv && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
    const ctx = cv.getContext('2d'); let w, h, flakes = [];
    const size = () => { w = cv.width = cv.offsetWidth; h = cv.height = cv.offsetHeight; };
    size(); addEventListener('resize', size);
    for (let i = 0; i < 60; i++) flakes.push({ x: Math.random() * 1000, y: Math.random() * 800, r: 1 + Math.random() * 2.5, s: .3 + Math.random() * .8, p: Math.random() * 6 });
    (function frame() {
      ctx.clearRect(0, 0, w, h); ctx.fillStyle = 'rgba(255,255,255,.8)';
      flakes.forEach((f) => {
        f.y += f.s; f.p += .01; f.x += Math.sin(f.p) * .4;
        if (f.y > h) { f.y = -5; f.x = Math.random() * w; }
        ctx.beginPath(); ctx.arc(f.x % w, f.y, f.r, 0, 6.3); ctx.fill();
      });
      requestAnimationFrame(frame);
    })();
  }

  // Registration: talks to the Google Apps Script receiver (see config.js)
  const URL_ = window.RG_ENDPOINT || '';
  const configured = /^https:\/\/script\.google\.com\//.test(URL_);
  const spots = $('#spots'), roster = $('#roster'), form = $('#reg'), msg = $('#msg'), btn = form.querySelector('button');

  function show(s) {
    spots.textContent = s.remaining > 0 ? `${s.remaining} of ${s.max} spots left.` : 'The field is full. Ask Lou or Dan about the waitlist.';
    roster.innerHTML = '';
    const teams = {}, solos = [];
    (s.entries || []).forEach((en) => { if (en.team) (teams[en.team] = teams[en.team] || []).push(en.name); else solos.push(en.name); });
    const add = (title, names) => {
      const box = document.createElement('div'); box.className = 'grp';
      const t = document.createElement('h4'); t.textContent = title; box.appendChild(t);
      const ul = document.createElement('ul'); ul.className = 'roster';
      names.forEach((n) => { const li = document.createElement('li'); li.textContent = n; ul.appendChild(li); });
      box.appendChild(ul); roster.appendChild(box);
    };
    Object.keys(teams).forEach((k) => add(k, teams[k]));
    if (solos.length) add('Looking for a team', solos);
    $('#rosterWrap').hidden = !(s.entries || []).length;
  }
  function load() {
    if (!configured) { spots.textContent = 'Field limited to 28 players.'; return; }
    fetch(URL_).then((r) => r.json()).then(show).catch(() => {});
  }
  load();

  // Team / solo toggle
  const teamF = $('#teamFields'), mateF = $('#mateFields'), nameLbl = $('#nameLbl');
  function mode() { return form.querySelector('input[name=mode]:checked').value; }
  function sync() {
    const t = mode() === 'team';
    teamF.hidden = !t; mateF.hidden = !t;
    nameLbl.textContent = t ? 'Your name (team captain)' : 'Your name';
  }
  form.querySelectorAll('input[name=mode]').forEach((r) => r.addEventListener('change', sync));
  sync();

  form.addEventListener('submit', async (e) => {
    e.preventDefault(); msg.className = '';
    if (!configured) { msg.textContent = 'Registration is not switched on yet. Email Lou or Dan to sign up.'; msg.className = 'err'; return; }
    btn.disabled = true; btn.textContent = 'Signing you up…';
    try {
      // text/plain avoids a browser pre-flight check that Apps Script can't answer
      const res = await fetch(URL_, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(Object.fromEntries(new FormData(form))) });
      const data = await res.json();
      msg.textContent = data.ok ? '🎄 ' + data.message : data.error;
      msg.className = data.ok ? 'ok' : 'err';
      if (data.ok) { form.reset(); sync(); load(); }
    } catch (_) { msg.textContent = 'Could not reach the clubhouse. Try again, or email Lou or Dan.'; msg.className = 'err'; }
    btn.disabled = false; btn.textContent = 'Sign us up';
  });
})();
