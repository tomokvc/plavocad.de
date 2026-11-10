/* PlavoCAD Makler-Seite: Vorher/Nachher, Hinweislinie, Exposé-Konfigurator mit Live-Vorschau, Plankopf,
   Lesefortschritt und Hover-Maße. Speichert nichts und sendet nichts an Server. */
(() => {
  'use strict';
  if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
  if (!location.hash) {
    // Ohne Sprungziel beginnt jede Ansicht ganz oben, auch wenn der Browser oder die Vorschau später eine alte Position wiederherstellen will
    let touched = false;
    ['wheel', 'touchstart', 'keydown', 'pointerdown'].forEach(ev => window.addEventListener(ev, () => { touched = true; }, { once: true, passive: true }));
    const top = () => { if (!touched && !location.hash) window.scrollTo(0, 0); };
    top(); window.addEventListener('load', () => { top(); setTimeout(top, 120); });
    window.addEventListener('pageshow', top);
  }
  const $ = s => document.querySelector(s), $$ = s => Array.from(document.querySelectorAll(s));
  const de = (n, d = 2) => n.toFixed(d).replace('.', ',');
  const eur = n => n.toLocaleString('hr-HR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';
  const reduceM = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const fine = window.matchMedia('(pointer: fine)').matches;
  const pad = n => String(n).padStart(2, '0'), now = new Date();

  /* Startaktion nach Ablauf ausblenden */
  const akt = $('#aktion');
  if (akt && now > new Date(akt.dataset.bis)) akt.hidden = true;

  /* Plotdatum und Lieferscheinnummer */
  $('#plotdate').textContent = pad(now.getDate()) + '.' + pad(now.getMonth() + 1) + '.' + now.getFullYear() + ' · ' + pad(now.getHours()) + ':' + pad(now.getMinutes());
  $('#ls-no').textContent = 'Nr. PC-' + now.getFullYear() + pad(now.getMonth() + 1) + pad(now.getDate());

  /* Maßketten */
  function chain(el, segs) {
    let h = '<span class="ln"></span>', x = 0; const ticks = [0];
    segs.forEach(s => { x += s.w; ticks.push(x); });
    ticks.forEach(t => { h += '<span class="ext" style="left:' + (t * 100) + '%"></span><span class="tk" style="left:' + (t * 100) + '%"></span>'; });
    x = 0; segs.forEach(s => { if (s.t) h += '<span class="tx" style="left:' + ((x + s.w / 2) * 100) + '%">' + s.t + '</span>'; x += s.w; });
    el.innerHTML = h;
  }
  function vchain(el, total) {
    el.innerHTML = '<span class="ln" style="top:0;bottom:0"></span>' + [0, 1].map(t => '<span class="ext" style="top:' + t * 100 + '%"></span><span class="tk" style="top:' + t * 100 + '%"></span>').join('') +
      '<span class="tx" style="top:50%">' + de(total) + '</span>';
  }
  $$('[data-chain]').forEach(el => { const d = JSON.parse(el.dataset.chain), tot = d.reduce((s, x) => s + x[0], 0); chain(el, d.map(x => ({ w: x[0] / tot, t: x[1] }))); });
  const vn = $('#vncmp'), vp = $('#vnpos'), hx = $('#mhx');
  function heroChain(v) {
    const f = v / 100, a = f * 13.6;
    chain(hx, f > .06 && f < .94 ? [{ w: f, t: de(a) }, { w: 1 - f, t: de(13.6 - a) }] : [{ w: 1, t: '13,60' }]);
  }
  function setX(v) { vn.style.setProperty('--x', v + '%'); heroChain(v); }
  vchain($('#mhy'), 9.65);
  vp.addEventListener('input', () => setX(+vp.value));
  if (!reduceM) {
    const t0 = performance.now();
    const step = t => { const k = Math.min((t - t0) / 1100, 1), e = 1 - Math.pow(1 - k, 3), v = 16 + 28 * e; vp.value = v; setX(v); if (k < 1) requestAnimationFrame(step); };
    setX(16); setTimeout(() => requestAnimationFrame(step), 350);
  } else setX(44);

  /* Hinweislinie vom Wohnzimmer zur Flächenangabe */
  const lead = $('#lead'), pic = lead.parentNode, note = $('.note2');
  function drawLead() {
    if (getComputedStyle(lead).display === 'none') return;
    const w = pic.clientWidth, h = pic.clientHeight, nb = note.getBoundingClientRect(), pb = pic.getBoundingClientRect();
    const W = w + 150, y = Math.min(h - 6, nb.top - pb.top + 9), sx = w * .30, sy = h * .74, kx = Math.min(w * .64, sx + Math.abs(y - sy));
    lead.setAttribute('viewBox', '0 0 ' + W + ' ' + h); lead.setAttribute('width', W); lead.setAttribute('height', h);
    lead.innerHTML = '<circle class="dot" cx="' + sx + '" cy="' + sy + '" r="3"/><polyline class="ln" points="' + sx + ',' + sy + ' ' + kx + ',' + y + ' ' + (w + 10) + ',' + y + '"/>';
  }
  window.addEventListener('resize', drawLead, { passive: true });
  window.addEventListener('load', drawLead);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(drawLead);
  drawLead();

  /* ===== Exposé-Konfigurator ===== */
  const boxes = ['#cf-exp', '#cf-moeb', '#cf-wfl', '#cf-3d'].map(s => $(s)), pv = $('#pv');
  let qty = 1;
  const per = () => boxes.reduce((s, b) => s + (b.checked ? +b.dataset.p : 0), 0);
  const unit = n => n + (n === 1 ? ' stan' : ' stanova');
  const names = () => boxes.filter(b => b.checked && +b.dataset.p > 0).map(b => b.closest('.lsrow').querySelector('.nm').firstChild.textContent.trim().replace(' (WoFlV)', ''));
  function render() {
    boxes.forEach(b => b.closest('.lsrow').classList.toggle('off', !b.checked));
    pv.classList.toggle('nofurn', !$('#cf-moeb').checked);
    pv.classList.toggle('noarea', !$('#cf-wfl').checked);
    pv.classList.toggle('d3', $('#cf-3d').checked);
    $('#pv-lay').textContent = boxes.filter(b => b.checked).map(b => b.dataset.layer).join(' · ');
    const tot = per() * qty;
    $('#cf-sum').textContent = eur(tot);
    $('#cq-val').textContent = qty;
    $('#cq-minus').disabled = qty <= 1; $('#cq-plus').disabled = qty >= 20;
    $('#run-sel').textContent = unit(qty) + ' · ' + eur(tot);
    $('#dock-sum').textContent = 'Odabir: ' + unit(qty) + ' · ' + eur(tot);
    if (+$('#f-qty').value !== qty) $('#f-qty').value = qty;
    files();
    planCell();
  }
  const FILES = [['cf-exp', 'PDF', 'Tlocrt_stan.pdf', 'A4 položeno'], ['cf-exp', 'PNG', 'Tlocrt_stan.png', '3000 px'], ['cf-wfl', 'PDF', 'Tablica-povrsina.pdf', 'Tablica'], ['cf-3d', 'PNG', '3D-prikaz.png', '3000 px']];
  let lastFiles = '';
  function files() {
    const list = FILES.filter(f => document.getElementById(f[0]).checked);
    const key = list.map(f => f[2]).join('|') + ($('#cf-moeb').checked ? 'm' : '');
    if (key === lastFiles) return; lastFiles = key;
    $('#cf-files').innerHTML = list.map(f => '<li><span class="ext">' + f[1] + '</span><span>' + f[2] + '</span><span class="sz">' + f[3] + '</span></li>').join('') +
      '<li><span class="ext">INFO</span><span>' + ($('#cf-moeb').checked ? 's namještajem' : 'bez namještaja') + '</span><span class="sz">1 korekcija uklj.</span></li>';
  }
  function planCell() {
    const art = $('#f-art').value;
    if (art === 'probe') { $('#f-lst').textContent = '1 stan besplatno'; $('#f-sel').textContent = 'Tlocrt za oglas, besplatno za upoznavanje'; $('#f-sum').textContent = '0,00 €'; return; }
    if (art === 'frage') { $('#f-lst').textContent = 'Pitanje'; $('#f-sel').textContent = 'bez odabira'; $('#f-sum').textContent = '–'; return; }
    $('#f-lst').textContent = unit(qty);
    $('#f-sel').textContent = names().join(' + ') + ($('#cf-moeb').checked ? ', namješteno' : ', bez namještaja');
    $('#f-sum').textContent = eur(per() * qty);
  }
  boxes.forEach(b => b.addEventListener('change', render));
  $('#cq-minus').addEventListener('click', () => { qty = Math.max(1, qty - 1); render(); });
  $('#cq-plus').addEventListener('click', () => { qty = Math.min(20, qty + 1); render(); });
  $('#f-qty').addEventListener('input', () => { const q = Math.round(+$('#f-qty').value); if (q >= 1 && q <= 99) { qty = q; render(); } });
  $('#f-art').addEventListener('change', planCell);
  render();

  function toRequest(kind) {
    $('#f-art').value = kind; planCell();
    $('#kontakt').scrollIntoView({ behavior: reduceM ? 'auto' : 'smooth' });
    setTimeout(() => $('#f-name').focus({ preventScroll: true }), reduceM ? 0 : 550);
  }
  $('#cf-go').addEventListener('click', e => { e.preventDefault(); toRequest('plan'); });
  $$('[data-probe]').forEach(a => a.addEventListener('click', e => { e.preventDefault(); toRequest('probe'); }));

  window.PlavoPlankopf && window.PlavoPlankopf({
    subject: () => 'Upit: tlocrt za oglas',
    lines: () => $('#f-art').value === 'plan' ? ['Količina: ' + unit(qty), 'Usluga: ' + $('#f-sel').textContent, 'Fiksna cijena prema web-stranici: ' + $('#f-sum').textContent] : []
  });

  /* Hover-Maße in Zeichnungseinheiten */
  const hd = $('.hoverdim');
  if (fine && hd) {
    document.addEventListener('pointerover', e => {
      const el = e.target.closest('[data-dim]');
      if (!el) { hd.classList.remove('show'); return; }
      const r = el.getBoundingClientRect();
      hd.style.left = (r.left + scrollX) + 'px'; hd.style.top = (r.top + scrollY - 22) + 'px'; hd.style.width = r.width + 'px';
      hd.querySelector('.tx').textContent = el.dataset.dimM ? de(+el.dataset.dimM) + ' m' : de(r.width / 3.7795, 1);
      hd.classList.add('show');
    });
    window.addEventListener('scroll', () => hd.classList.remove('show'), { passive: true });
  }

  /* Layerleiste und Lesefortschritt */
  const secs = ['start', 'beispiel', 'konfigurator', 'ablauf', 'hinweise', 'kontakt', 'planverfasser'].map((id, i) => { const el = document.getElementById(id); el.dataset.blatt = pad(i + 1); return el; });
  const navs = $$('.layers a'), prog = $('.prog'), progtx = $('#progtx');
  function onScroll() {
    const y = scrollY + innerHeight * 0.35; let cur = secs[0];
    secs.forEach(s => { if (s.offsetTop <= y) cur = s; });
    navs.forEach(a => { const on = a.dataset.sec === cur.id; a.classList.toggle('on', on); if (on) a.setAttribute('aria-current', 'true'); else a.removeAttribute('aria-current'); });
    const max = document.documentElement.scrollHeight - innerHeight;
    prog.style.setProperty('--p', (max > 0 ? Math.min(100, scrollY / max * 100) : 0) + '%');
    progtx.textContent = 'LIST ' + cur.dataset.blatt + ' / 07';
  }
  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', onScroll, { passive: true });
  onScroll();
})();
