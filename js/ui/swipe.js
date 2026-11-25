// Swipe left / right anywhere on a main page to move between the bottom tabs (Today ↔ Closet ↔ Stylist ↔ Try-On).
// Swipes that start on something that scrolls sideways (look carousel, chips, sliders), on inputs, editors or
// while a sheet is open are left alone. The page follows your finger, then slides in from the side you swiped.
const ORDER = ['today', 'closet', 'stylist', 'tryon'];
const TAB_OF = { today: 'today', closet: 'closet', item: 'closet', stylist: 'stylist', tryon: 'tryon' };

function scrollsSideways(el, stop) {
  for (let n = el; n && n !== stop; n = n.parentElement) {
    if (n.matches?.('input, textarea, select, [contenteditable], .no-swipe, .crop-area, .ov-stage, .care-opts, canvas.draw')) return true;
    if (n.scrollWidth > n.clientWidth + 2) { const o = getComputedStyle(n).overflowX; if (o === 'auto' || o === 'scroll') return true; }
  }
  return false;
}

export function initSwipeNav(view, currentRoute) {
  let s = null;
  const reset = () => { view.style.transition = 'transform .28s cubic-bezier(.2,.8,.2,1), opacity .28s'; view.style.transform = ''; view.style.opacity = ''; setTimeout(() => { view.style.transition = ''; }, 300); };
  view.addEventListener('touchstart', (e) => {
    s = null;
    if (e.touches.length !== 1 || document.body.classList.contains('noscroll') || document.querySelector('.modal-wrap')) return;
    const t = e.touches[0];
    if (t.clientX < 24 || t.clientX > innerWidth - 24) return; // leave the system back-gesture edges alone
    const tab = TAB_OF[currentRoute()]; if (!tab) return;
    if (scrollsSideways(e.target, view)) return;
    s = { x: t.clientX, y: t.clientY, t: performance.now(), tab, dir: 0, locked: false };
  }, { passive: true });
  view.addEventListener('touchmove', (e) => {
    if (!s) return;
    const t = e.touches[0]; const dx = t.clientX - s.x, dy = t.clientY - s.y;
    if (!s.locked) {
      if (Math.abs(dy) > 10 && Math.abs(dy) > Math.abs(dx)) { s = null; return; } // vertical scroll wins
      if (Math.abs(dx) < 12 || Math.abs(dx) < Math.abs(dy) * 1.4) return;
      s.locked = true;
    }
    const i = ORDER.indexOf(s.tab); const next = dx < 0 ? ORDER[i + 1] : ORDER[i - 1];
    const resist = next ? 0.42 : 0.12; // rubber band at the first / last tab
    s.dx = dx; s.next = next;
    view.style.transform = `translate3d(${dx * resist}px,0,0)`;
    view.style.opacity = String(1 - Math.min(0.35, Math.abs(dx) / 900));
    if (e.cancelable) e.preventDefault();
  }, { passive: false });
  const end = () => {
    if (!s || !s.locked) { s = null; return; }
    const v = Math.abs(s.dx) / Math.max(1, performance.now() - s.t);
    const go = s.next && (Math.abs(s.dx) > innerWidth * 0.22 || (v > 0.45 && Math.abs(s.dx) > 40));
    const dir = s.dx < 0 ? 'l' : 'r'; const next = s.next; s = null;
    if (!go) return reset();
    window.__navDir = dir;
    try { window.AndroidBridge?.vibrate?.(6); } catch { /* old app */ }
    location.hash = '#/' + next;
  };
  view.addEventListener('touchend', end); view.addEventListener('touchcancel', () => { if (s?.locked) reset(); s = null; });
}

// Sliding pill under the active bottom tab
export function moveTabIndicator() {
  const tabs = document.getElementById('tabs'); if (!tabs) return;
  let ind = tabs.querySelector('.tab-ind');
  if (!ind) { ind = document.createElement('span'); ind.className = 'tab-ind'; tabs.prepend(ind); }
  const on = tabs.querySelector('a.on:not(.tab-add)');
  if (!on) { ind.style.opacity = '0'; return; }
  ind.style.opacity = '1';
  ind.style.width = on.offsetWidth - 16 + 'px';
  ind.style.transform = `translateX(${on.offsetLeft + 8}px)`;
}
