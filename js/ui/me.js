import { state, activeGarments, garmentById, del } from '../db.js';
import { profile, GENDERS, WEARS, myWear, BODY, bodyLabel, HEIGHTS, SEASONS, UNDERTONES, colorFit, styleDNA, DNA_AXES, VIBES, achievements, heatmap, streak, initials } from '../profile.js';
import { primaryColor } from '../color.js';
import { renderOutfit } from '../preview.js';
import { logWear } from '../actions.js';
import { esc, garmentName } from '../util.js';
import { $, $$, toast, icon, bar, emptyState, pageHead, watchLook } from './dom.js';
import { figSVG } from './onboarding.js';

export async function render(view, r) {
  const p = profile(); const pool = activeGarments(); const wear = myWear();
  const dna = pool.length ? styleDNA(pool) : null;
  const ach = achievements(pool);
  const done = ach.filter((a) => a.done).length;
  const hm = heatmap(18);
  const st = streak();
  const facts = [p.gender && GENDERS[p.gender]?.label, WEARS[wear].label, p.bodyShape && bodyLabel(p.bodyShape, wear), p.height && HEIGHTS[p.height].label, p.seasonName].filter(Boolean);

  view.innerHTML = `
    <section class="me-hero">
      <div class="big-av">${initials(p.name) || icon('user', 34)}</div>
      <div><p class="eyebrow">My style</p><h1>${p.name ? esc(p.name) : 'Your style profile'}</h1>
        <div class="facts">${facts.length ? facts.map((f) => `<span class="pill">${esc(f)}</span>`).join('') : '<span class="pill warn">Not set up yet</span>'}${dna ? `<span class="pill ink">${icon('dna', 12)} ${esc(dna.archetype)}</span>` : ''}</div>
        <div class="row mt"><a class="btn small primary" href="#/profile">${icon('pen', 14)} Edit profile</a><a class="btn small" href="#/settings?quiz=1">${icon('target', 14)} Retune taste</a><a class="btn small" href="#/settings">${icon('gear', 14)} Settings</a></div></div>
      <a class="me-gear" href="#/settings" aria-label="Settings" title="Settings">${icon('gear', 20)}</a>
    </section>

    <div class="split section" style="align-items:start">
      <section class="card">${colorCard(p, pool)}</section>
      <section class="card">${bodyCard(p, wear)}</section>
    </div>

    <div class="split even section" style="align-items:start">
      <section class="card"><div class="card-h"><h2>${icon('dna', 18)} Style DNA</h2>${dna ? `<span class="pill accent">${esc(dna.archetype)}</span>` : ''}</div>
        ${dna ? `${radar(dna.axes)}<p class="small muted" style="text-align:center">Read from your closet, weighted by what you wore in the last 90 days${p.vibes?.length ? ` and your chosen vibes (${p.vibes.map((v) => esc(VIBES[v].label)).join(', ')})` : ''}.</p>` : emptyState('dna', 'No clothes yet', 'Your Style DNA appears once you add a few pieces.')}</section>
      <section class="card"><div class="card-h"><h2>${icon('flame', 18)} Wear log</h2><span class="pill">${st}-day streak</span></div>
        <div class="heat">${hm.cells.map((c) => `<i class="${c.n >= 2 ? 'l2' : c.n ? 'l1' : ''}" title="${c.d}${c.n ? ` · ${c.n} outfit${c.n > 1 ? 's' : ''}` : ''}"></i>`).join('')}</div>
        <p class="tiny faint mt">Last 18 weeks · ${hm.cells.filter((c) => c.n).length} days logged</p>
        <div class="stats mt">${miniStat(state.wear.length ? new Set(state.wear.map((w) => w.outfitId)).size : 0, 'outfits worn')}${miniStat(pool.length, 'pieces')}${miniStat(`${done}/${ach.length}`, 'achievements')}</div></section>
    </div>

    <section class="section card"><div class="card-h"><h2>${icon('trophy', 18)} Achievements</h2><span class="small muted">${done} unlocked</span></div>
      <div class="ach">${ach.map((a) => `<div class="ach-i ${a.done ? 'done' : ''}"><div class="badge">${icon(a.icon, 20)}</div><div class="grow"><b>${esc(a.title)}</b><span>${esc(a.desc)}</span>${a.done ? '' : `<div class="mt" style="margin-top:6px">${bar(a.p)}</div>`}<span class="tiny faint">${esc(a.val)}</span></div></div>`).join('')}</div></section>

    <section class="section" id="lookbook"><div class="section-h"><div><p class="eyebrow">Saved looks</p><h2>Lookbook</h2></div><a class="btn small" href="#/builder">${icon('layers', 14)} Build a look</a></div>
      <div class="looks" id="lb"></div></section>`;

  drawLookbook($('#lb', view));
  if (r?.query?.get('s') === 'lookbook') setTimeout(() => $('#lookbook', view)?.scrollIntoView({ behavior: 'smooth' }), 120);
}

const miniStat = (v, l) => `<div class="stat"><b>${v}</b><span>${l}</span></div>`;

function colorCard(p, pool) {
  if (!p.season) return `<div class="card-h"><h2>${icon('palette', 18)} Color season</h2></div>${emptyState('palette', 'Find your colors', 'Answer three questions or analyze a selfie to get your personal palette — every suggestion then favors shades that flatter you.', `<a class="btn primary" href="#/profile?step=color">${icon('camera', 16)} Find my colors</a>`)}`;
  const S = SEASONS[p.season];
  const face = pool.filter((g) => ['top', 'dress', 'outerwear'].includes(g.category));
  const fits = face.map((g) => ({ g, f: colorFit(primaryColor(g).hex, p.season) }));
  const great = fits.filter((x) => x.f.verdict === 'great'), avoid = fits.filter((x) => x.f.verdict === 'avoid');
  return `<div class="card-h"><h2>${icon('palette', 18)} Color season</h2><a class="btn small ghost" href="#/profile?step=color">Edit</a></div>
    <div class="row"><span class="sw" style="background:${esc(p.skinHex || '#c99b74')};width:46px;height:46px"></span><div><h2 class="display" style="font-size:2.1rem;font-weight:400;margin:0">${esc(p.seasonName)}</h2><p class="small muted" style="margin:0">${esc(UNDERTONES[p.undertone]?.label || '')} undertone · ${esc(p.contrast || 'medium')} contrast · ${esc(S.metal)}${p.selfie ? ' · measured from a selfie' : ''}</p></div></div>
    <p class="small mt">${esc(S.mood)}</p>
    <p class="eyebrow mt">Your best shades</p><div class="season-strip">${S.best.map((h) => `<div style="background:${h}"></div>`).join('')}</div>
    <p class="eyebrow mt2">Keep away from your face</p><div class="avoid-strip">${S.avoid.map((h) => `<div style="background:${h}"></div>`).join('')}</div>
    ${face.length ? `<div class="mt2"><div class="row between small"><span><b>${great.length}</b> of ${face.length} tops & layers flatter you</span><span class="faint">${Math.round((great.length / face.length) * 100)}%</span></div>${bar(great.length / face.length)}
      ${avoid.length ? `<p class="tiny muted mt">Wear these below the waist or under a palette layer: ${avoid.slice(0, 4).map((x) => esc(garmentName(x.g))).join(', ')}.</p>` : ''}</div>` : ''}`;
}

function bodyCard(p, wear) {
  if (!p.bodyShape) return `<div class="card-h"><h2>${icon('figure', 18)} Body & fit</h2></div>${emptyState('figure', 'Set your shape', 'Pick your silhouette and height so I can favor the proportions that flatter you.', `<a class="btn primary" href="#/profile?step=body">Set body shape</a>`)}`;
  const B = BODY[p.bodyShape];
  const tips = [...B.tips];
  if (p.height === 'petite') tips.push('One color head-to-toe and cropped jackets add height');
  if (p.height === 'tall') tips.push('You carry oversized pieces and bold top/bottom contrast well');
  return `<div class="card-h"><h2>${icon('figure', 18)} Body & fit</h2><a class="btn small ghost" href="#/profile?step=body">Edit</a></div>
    <div class="bodyfig">${figSVG(p.bodyShape, wear)}<div><h2 class="display" style="font-size:1.9rem;font-weight:400;margin:0">${esc(bodyLabel(p.bodyShape, wear))}</h2><p class="small muted">${esc(B.desc)}${p.height ? ` · ${esc(HEIGHTS[p.height].label)}` : ''}${p.bodyMeasured ? ` · <span class="pill good">measured from photo</span>` : ''}</p>
      ${p.bodyMeasured ? `<p class="tiny faint">Shoulders ${Math.round(p.bodyMeasured.s * 100)} · Waist ${Math.round(p.bodyMeasured.w * 100)} · Hips 100</p>` : `<a class="btn small" href="#/tryon">${icon('ruler', 14)} Measure from a photo</a>`}
      <ul class="tips">${tips.map((t) => `<li>${icon('check', 16)}<span>${esc(t)}</span></li>`).join('')}</ul></div></div>`;
}

function radar(axes) {
  const N = DNA_AXES.length, cx = 150, cy = 150, R = 100;
  const pt = (i, v) => { const a = -Math.PI / 2 + (i * 2 * Math.PI) / N; return [cx + Math.cos(a) * R * v, cy + Math.sin(a) * R * v]; };
  const ring = (v) => DNA_AXES.map((_, i) => pt(i, v).map((x) => x.toFixed(1)).join(',')).join(' ');
  const poly = DNA_AXES.map((k, i) => pt(i, Math.max(0.06, axes[k])).map((x) => x.toFixed(1)).join(',')).join(' ');
  return `<svg class="radar" viewBox="0 0 300 300" role="img" aria-label="Style DNA radar">
    ${[0.25, 0.5, 0.75, 1].map((v) => `<polygon points="${ring(v)}" fill="none" stroke="var(--line2)" stroke-width="1"/>`).join('')}
    ${DNA_AXES.map((_, i) => { const [x, y] = pt(i, 1); return `<line x1="${cx}" y1="${cy}" x2="${x}" y2="${y}" stroke="var(--line)"/>`; }).join('')}
    <polygon points="${poly}" fill="color-mix(in srgb, var(--accent) 22%, transparent)" stroke="var(--accent)" stroke-width="2" stroke-linejoin="round"/>
    ${DNA_AXES.map((k, i) => { const [x, y] = pt(i, Math.max(0.06, axes[k])); return `<circle cx="${x}" cy="${y}" r="3.5" fill="var(--accent)"/>`; }).join('')}
    ${DNA_AXES.map((k, i) => { const [x, y] = pt(i, 1.22); return `<text x="${x}" y="${y}" text-anchor="middle" dominant-baseline="middle">${esc(VIBES[k].label.split(' ')[0])}</text>`; }).join('')}
  </svg>`;
}

async function drawLookbook(box) {
  const saved = state.outfits.filter((o) => o.source === 'manual').slice().reverse();
  if (!saved.length) { box.innerHTML = `<div style="grid-column:1/-1">${emptyState('book', 'Your lookbook is empty', 'Tap the heart on any suggested look — on Today or in the stylist chat — or save one from the builder.', '<a class="btn" href="#/today">See today’s looks</a>')}</div>`; return; }
  box.innerHTML = '';
  for (const o of saved.slice(0, 24)) {
    const items = o.items.map((i) => garmentById(i.garmentId)).filter(Boolean);
    if (!items.length) continue;
    const el = document.createElement('article'); el.className = 'card look'; watchLook(el, items, 'Lookbook');
    const c = await renderOutfit(items, { size: 420, mode: state.settings.view }); c.className = 'ocanvas';
    const media = document.createElement('div'); media.className = 'media'; media.appendChild(c); el.appendChild(media);
    el.insertAdjacentHTML('beforeend', `<div class="ob"><div class="lt"><span class="n" style="font-size:1.25rem">${esc(o.name || 'My look')}</span></div><p class="tiny faint" style="margin:0">${items.map((g) => esc(garmentName(g))).join(' · ')}</p>
      <div class="acts"><button class="btn small primary" data-wear>${icon('check', 14)} Wear today</button><a class="btn small icon" href="#/tryon?items=${items.map((g) => g.id).join(',')}" aria-label="Try on">${icon('figure', 14)}</a><button class="btn small icon" data-rm aria-label="Remove from lookbook">${icon('trash', 14)}</button></div></div>`);
    el.querySelector('[data-wear]').onclick = async (e) => { await logWear(items, { ctx: o.context ? { occasion: o.context.occasion } : null, features: o.features, source: 'manual' }); e.target.closest('button').disabled = true; toast('Wear logged'); };
    el.querySelector('[data-rm]').onclick = async () => { await del('outfits', o.id); state.outfits = state.outfits.filter((x) => x.id !== o.id); el.remove(); toast('Removed from lookbook'); };
    box.appendChild(el);
  }
}
