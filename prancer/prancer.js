// Prancer photo submission. Photos are shrunk and re-saved as clean JPEGs on the phone
// (this also strips location data), then sent one at a time to the Google Apps Script.
(function () {
  'use strict';
  var URL_ = window.RG_ENDPOINT || '';
  var MAX_PHOTOS = 6;
  var MAX_ORIGINAL = 40 * 1024 * 1024; // 40 MB straight off a phone is plenty
  var MAX_SIDE = 1600;                 // longest side after shrinking
  var $ = function (s) { return document.querySelector(s); };
  var form = $('#pform'), team = $('#team'), list = $('#previews'), status = $('#status'),
      send = $('#send'), done = $('#done');
  var picked = []; // { file, url, sig }

  // Remember team across refreshes on this phone
  try { var saved = localStorage.getItem('rg_team'); if (saved) team.value = saved; } catch (e) {}
  team.addEventListener('change', function () { try { localStorage.setItem('rg_team', team.value); } catch (e) {} });

  function say(text, kind) { status.textContent = text; status.className = 'p-status' + (kind ? ' ' + kind : ''); }

  function add(files) {
    var notes = [];
    Array.prototype.forEach.call(files, function (f) {
      var sig = f.name + '|' + f.size + '|' + f.lastModified;
      if (picked.some(function (p) { return p.sig === sig; })) { notes.push('"' + f.name + '" is already selected.'); return; }
      if (!/^image\//.test(f.type) && !/\.(jpe?g|png|heic|heif|webp)$/i.test(f.name)) { notes.push('"' + f.name + '" is not a photo.'); return; }
      if (f.size === 0) { notes.push('"' + f.name + '" is empty.'); return; }
      if (f.size > MAX_ORIGINAL) { notes.push('"' + f.name + '" is too large.'); return; }
      if (picked.length >= MAX_PHOTOS) { notes.push('Only ' + MAX_PHOTOS + ' photos at a time.'); return; }
      picked.push({ file: f, url: URL.createObjectURL(f), sig: sig });
    });
    draw();
    say(notes.join(' '), notes.length ? 'err' : '');
  }

  function draw() {
    list.innerHTML = '';
    picked.forEach(function (p, i) {
      var li = document.createElement('li');
      var img = document.createElement('img'); img.src = p.url; img.alt = 'Selected photo ' + (i + 1);
      img.onerror = function () { img.alt = 'Preview not available'; };
      var x = document.createElement('button'); x.type = 'button'; x.textContent = '✕';
      x.setAttribute('aria-label', 'Remove photo ' + (i + 1));
      x.addEventListener('click', function () {
        URL.revokeObjectURL(p.url); picked.splice(picked.indexOf(p), 1); draw();
        say('Photo removed. ' + picked.length + ' selected.');
        (list.querySelector('button') || $('#lib')).focus();
      });
      li.appendChild(img); li.appendChild(x); list.appendChild(li);
    });
  }

  ['#cam', '#lib'].forEach(function (id) {
    var inp = $(id);
    inp.addEventListener('change', function () { add(inp.files); inp.value = ''; });
    // Keyboard users: the visible label acts as the button
    var lbl = document.querySelector('label[for="' + id.slice(1) + '"]');
    lbl.tabIndex = 0;
    lbl.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); inp.click(); } });
  });

  // Decode (respecting phone rotation), shrink, and re-encode as JPEG. Drops all metadata.
  function toJpeg(file) {
    return new Promise(function (resolve, reject) {
      var img = new Image();
      var u = URL.createObjectURL(file);
      img.onload = function () {
        var w = img.naturalWidth, h = img.naturalHeight;
        if (!w || !h) { URL.revokeObjectURL(u); return reject(new Error('unreadable')); }
        var s = Math.min(1, MAX_SIDE / Math.max(w, h));
        var c = document.createElement('canvas');
        c.width = Math.round(w * s); c.height = Math.round(h * s);
        var ctx = c.getContext('2d');
        ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height); // flatten transparent PNGs
        ctx.drawImage(img, 0, 0, c.width, c.height);
        URL.revokeObjectURL(u);
        var data = c.toDataURL('image/jpeg', 0.85);
        if (data.indexOf('data:image/jpeg;base64,') !== 0) return reject(new Error('unreadable'));
        resolve(data.slice(23));
      };
      img.onerror = function () { URL.revokeObjectURL(u); reject(new Error('unreadable')); };
      img.src = u;
    });
  }

  async function sendOne(p) {
    var b64 = await toJpeg(p.file);
    var res = await fetch(URL_, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ action: 'photo', team: team.value, image: b64 }) });
    var data = await res.json();
    if (!data.ok) throw new Error(data.error || 'Upload failed.');
    return data;
  }

  form.addEventListener('submit', async function (e) {
    e.preventDefault();
    if (!/^https:\/\/script\.google\.com\//.test(URL_)) return say('Photo uploads are not switched on yet. Show your photo to the staff instead.', 'err');
    if (!team.value) { say('Pick your team first.', 'err'); team.focus(); return; }
    if (!picked.length) { say('Add at least one photo first.', 'err'); $('label[for=lib]').focus(); return; }

    send.disabled = true;
    var sent = 0, failed = [];
    var queue = picked.slice();
    for (var i = 0; i < queue.length; i++) {
      say('Sending photo ' + (i + 1) + ' of ' + queue.length + '… keep this page open.', 'work');
      try { await sendOne(queue[i]); sent++; URL.revokeObjectURL(queue[i].url); picked.splice(picked.indexOf(queue[i]), 1); }
      catch (err) { failed.push(err.message === 'unreadable' ? 'One photo could not be read. Try a different one.' : (/fetch|network|load/i.test(err.message) ? 'No signal reached the North Pole.' : err.message)); }
    }
    draw();
    send.disabled = false;

    if (!failed.length) {
      form.hidden = true; done.hidden = false;
      $('#doneDetail').textContent = sent + (sent === 1 ? ' photo' : ' photos') + ' received for ' + team.value + '.';
      done.focus();
    } else {
      say((sent ? sent + ' sent. ' : '') + failed.length + ' not sent: ' + failed[0] +
          ' Your team is still selected. Tap UPLOAD TO THE NORTH POLE to try again.', 'err');
    }
  });

  $('#more').addEventListener('click', function () { done.hidden = true; form.hidden = false; say(''); $('label[for=lib]').focus(); });
})();
