// Draws the Wired Angel pet (a veiled, faceless figure of static with sigil-blade wings and a broken
// pixel halo) and builds one small animated SVG per mood, for the "wired-angel-pet" Claude mod.
//   node build-angel.mjs [mod hooks folder]   -> pet-art.js (+ .d.ts) there, and pet-preview.html here
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const MOD_HOOKS = process.argv[2] ?? ''

// ---------- colors: the Wired Angel theme's own line colors, mid-tones that read on both grounds ----------
const LINE = '#7c86e8'
const CHROME = '#9aa0c4'
const GLITCH_A = '#35c8e0'
const GLITCH_B = '#e23a6a'

// ---------- the canvas, in pixel cells ----------
const W = 82, H = 44
const CX = 32 // the figure's middle column (its middle line is CX + .5)
const FY = 6 // the figure's top row
const FX0 = CX - 7 // the figure's left column

// ---------- the figure: '#' is veil, 'o' is the hollow of the hood, '.' is nothing ----------
const HOODS = {
  normal: [
    '......###......',
    '.....#####.....',
    '....#######....',
    '....##ooo##....',
    '...##ooooo##...',
    '...##ooooo##...',
    '...##ooooo##...',
    '...###ooo###...',
    '....#######....',
  ],
  bow: [
    '......###......',
    '.....#####.....',
    '....#######....',
    '....#######....',
    '...###ooo###...',
    '...##ooooo##...',
    '...##ooooo##...',
    '...###ooo###...',
    '....#######....',
  ],
  lift: [
    '......###......',
    '.....#####.....',
    '....##ooo##....',
    '...##ooooo##...',
    '...##ooooo##...',
    '...##ooooo##...',
    '...###ooo###...',
    '...#########...',
    '....#######....',
  ],
}
const BODY = [
  '....#######....',
  '...#########...',
  '..###########..',
  '..###########..',
  '..###########..',
  '..###########..',
  '..###########..',
  '.#############.',
  '.#############.',
  '.#############.',
  '.#############.',
  '.#############.',
  '###############',
  '###############',
  '###############',
  '##.#########.##', // from here down the hem frays into static
  '#..###.####..#.',
  '...#..##.#.....',
  '......#..#.....',
]
const FRAY_FROM = HOODS.normal.length + 15
for (const row of [...Object.values(HOODS).flat(), ...BODY]) if (row.length !== 15) throw new Error(`row "${row}" is ${row.length} wide, not 15`)

// The halo: a ring of pixels over the hood, as [dx from CX, row].
const HALO_Y = 2
const HALO_FULL = [-3, -2, -1, 0, 1, 2, 3].flatMap(dx => [[dx, 0], [dx, 2]]).concat([[-5, 1], [-4, 1], [4, 1], [5, 1]])
const HALO_GAPS = ['-1,0', '3,0', '-5,1', '1,2', '2,2', '-3,2'] // the breaks in it
const HALO_BLINK = ['2,0', '-2,2', '5,1'] // and the pixels that flicker

// One wing as a cyber sigil, for the right side, in cells from the shoulder at 0,0 (the left is its mirror):
// knots joined by pinched bridges that close into cells, with hooked thorns growing off the knots.
// It is drawn as curves here and turned into pixels by wingCells().
const KNOTS = { a: [2.5, -1, 1.2], b: [8, -8, 1.5], c: [16, -12, 1.7], d: [20, -3, 1.4], e: [11, 1, 1.5], f: [14, 8, 1.3] } // x, y, radius
const BRIDGES = [['a', 'b', 1], ['b', 'c', -1], ['c', 'd', -1.5], ['d', 'e', 1], ['e', 'a', 1], ['b', 'e', -1], ['e', 'f', 1]] // from, to, how far it bows
const THORNS = [ // from knot, the point it bends toward, its tip, how thick at the root
  ['c', [22, -16], [27, -14], 1.3], ['c', [14, -17], [9, -17], 1.2], ['c', [19, -15], [20.5, -18.5], 0.9],
  ['b', [7, -13], [3.5, -15], 1], ['b', [4.5, -7], [2.5, -10.5], 0.8],
  ['d', [25, -5], [27.5, -8], 0.9], ['d', [25, 0], [25.5, 5], 0.9],
  ['d', [24, 9], [20.5, 25.5], 1.5], ['f', [19, 11], [20.5, 25.5], 1.3], // two strokes that meet in the wing's long tail: everything below tapers to it
  ['f', [14, 13], [12, 16.5], 1], ['e', [10, 6], [8.5, 10.5], 1], ['a', [3.5, 3], [3, 7], 0.9], ['a', [1, -0.5], [-1, 0.5], 1],
]
const WING_X = 6, WING_Y = FY + 11 // the shoulder cell, as columns out from CX and as a row

/** The wing as pixel cells [x, y] from the shoulder: a cell is filled where a knot, bridge or thorn covers its middle. */
function wingCells() {
  const marks = [] // [x, y, half width]
  for (const [x, y, r] of Object.values(KNOTS)) marks.push([x, y, r])
  const curve = (from, bend, to, width) => {
    for (let i = 0; i <= 60; i++) {
      const t = i / 60, u = 1 - t
      marks.push([u * u * from[0] + 2 * u * t * bend[0] + t * t * to[0], u * u * from[1] + 2 * u * t * bend[1] + t * t * to[1], width(t)])
    }
  }
  for (const [from, to, bow] of BRIDGES) {
    const [ax, ay] = KNOTS[from], [bx, by] = KNOTS[to]
    const length = Math.hypot(bx - ax, by - ay)
    curve([ax, ay], [(ax + bx) / 2 - ((by - ay) / length) * bow, (ay + by) / 2 + ((bx - ax) / length) * bow], [bx, by], t => 0.95 - 0.38 * Math.sin(Math.PI * t))
  }
  for (const [from, bend, tip, thick] of THORNS) curve(KNOTS[from], bend, tip, t => thick * (1 - t) ** 0.8 + 0.36)
  const cells = []
  for (let y = -20; y <= 26; y++) for (let x = 0; x <= 30; x++) if (marks.some(([mx, my, half]) => Math.hypot(x + 0.5 - mx, y + 0.5 - my) <= half)) cells.push([x, y])
  return cells
}
const WING = wingCells()

/** The same "random" numbers on every build, so the static never changes between builds or moods. */
function seeded(a) {
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Cells -> one path of short horizontal lines (each run of cells is one line). */
function runs(cells) {
  const s = [...cells].sort((a, b) => a[1] - b[1] || a[0] - b[0])
  let d = ''
  for (let i = 0; i < s.length;) {
    let j = i
    while (j + 1 < s.length && s[j + 1][1] === s[i][1] && s[j + 1][0] === s[j][0] + 1) j++
    d += `M${s[i][0]} ${s[i][1]}h${j - i + 1}`
    i = j + 1
  }
  return d
}
const px = (cells, color, opacity = 1, cls = '') =>
  cells.length ? `<path${cls ? ` class="${cls}"` : ''} stroke="${color}"${opacity < 1 ? ` stroke-opacity="${opacity}"` : ''} d="${runs(cells)}"/>` : ''

/** The veiled figure as pixel paths: a steady outline, a dithered fill, and layers of static that blink. */
function figure({ hood = 'normal', isDense = false, isDissolving = false }, p) {
  const rows = [...HOODS[hood], ...BODY]
  const at = (x, y) => rows[y]?.[x] ?? '.'
  const rand = seeded(7)
  const edge = [], base = [], check = [], scan = [], shape = []
  const layers = [new Map(), new Map(), new Map(), new Map()] // three of static, one more while thinking
  const add = (layer, color, opacity, cell) => {
    const key = `${color}|${opacity}`
    layers[layer].set(key, [...(layers[layer].get(key) ?? []), cell])
  }
  rows.forEach((row, y) => [...row].forEach((ch, x) => {
    const cell = [FX0 + x, FY + y]
    const [a, b, c, d, e] = [rand(), rand(), rand(), rand(), rand()]
    if (ch === '.') return
    if (ch === 'o') { if (y % 2 === 1) scan.push(cell); return }
    if (isDissolving && d < 0.1 + 0.65 * (y / rows.length)) return
    const isEdge = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => at(x + dx, y + dy) !== '#')
    if (y >= FRAY_FROM || isEdge) shape.push(cell)
    if (y >= FRAY_FROM) return add(Math.floor(a * 3), LINE, 0.85, cell)
    if (isEdge) return b < 0.08 ? add(1, LINE, 0.9, cell) : edge.push(cell)
    base.push(cell)
    if ((x + y) % 2 === 0) check.push(cell)
    if (a < 0.28) add(0, CHROME, 0.6, cell)
    if (b < 0.25) add(1, LINE, 0.55, cell)
    if (c < 0.08) add(2, LINE, 1, cell)
    if (isDense && e < 0.4) add(3, LINE, 0.7, cell)
  }))
  const layerSvg = layers.map((layer, i) => layer.size ? `<g class="${p}l${i}">${[...layer].map(([key, cells]) => px(cells, key.split('|')[0], +key.split('|')[1])).join('')}</g>` : '').join('')
  return { svg: px(base, LINE, 0.1) + px(check, LINE, 0.2) + px(scan, LINE, 0.28) + layerSvg + px(edge, LINE, 0.9), shape }
}

function halo({ halo: kind = 'broken' }, p) {
  const cells = HALO_FULL.filter(([dx, y]) => kind === 'closed' || !HALO_GAPS.includes(`${dx},${y}`))
  const isBlinking = ([dx, y]) => kind === 'broken' && HALO_BLINK.includes(`${dx},${y}`)
  const place = list => list.map(([dx, y]) => [CX + dx, HALO_Y + y])
  return { svg: `<g class="${p}halo">${px(place(cells.filter(c => !isBlinking(c))), LINE, 0.95)}${px(place(cells.filter(isBlinking)), LINE, 0.95, `${p}hb`)}</g>`, shape: place(cells) }
}

/** Both wings as pixel paths; a few cells flicker. */
function wings(p) {
  const rand = seeded(11)
  const steady = [], flicker = []
  for (const [x, y] of WING) {
    const list = rand() < 0.07 ? flicker : steady
    list.push([CX + WING_X + x, WING_Y + y], [CX - WING_X + 1 - x, WING_Y + y])
  }
  return `<g class="${p}wing">${px(steady, LINE, 0.5)}${px(flicker, LINE, 0.5, `${p}hb`)}</g>`
}
const star = (x, y, r, cls) => { const i = r * 0.2; return `<path class="${cls}" d="M${x} ${y - r}L${x + i} ${y - i}L${x + r} ${y}L${x + i} ${y + i}L${x} ${y + r}L${x - i} ${y + i}L${x - r} ${y}L${x - i} ${y - i}Z"/>` }
const dot = (x, y, cls, style = '', size = 1) => `<rect class="${cls}"${style ? ` style="${style}"` : ''} x="${x}" y="${y}" width="${size}" height="${size}"/>`

// ---------- moods ----------
// speed: how fast the static blinks (1 = idle). wing: rows it sits lower (or higher), at each end of its slow beat, and the beat's seconds.
const MOODS = {
  idle: { words: '', glitch: 'rare' },
  listening: { words: 'signal received', hood: 'lift', haloCss: 'animation:§flash .9s step-end infinite', speed: 0.7 },
  thinking: { words: '…', isDense: true, speed: 0.22 },
  reading: {
    words: 'reading', wing: [-1, 1, 3.4], speed: 0.8,
    extras: p => `<path class="${p}wire ${p}in" pathLength="1" d="M69 33H60L56 29H51"/>${dot(49.5, 28, `${p}px`, '', 2)}`,
  },
  writing: {
    words: 'writing', speed: 0.6,
    extras: p => `<path class="${p}wire ${p}out" pathLength="1" d="M51 31H58L62 35H67"/>${dot(67, 34, `${p}px`, '', 2)}${dot(55, 28, `${p}px`, 'animation-delay:-1.7s')}${dot(61, 31, `${p}px`, 'animation-delay:-3.1s')}${dot(65, 29, `${p}px`, 'animation-delay:-.6s')}`,
  },
  running: {
    words: 'executing', wing: [-2, -2, 5], speed: 0.5,
    extras: p => [0, 1, 2, 3, 4, 5].map(i => dot(52 + i * 3, 32, `${p}tick`, `animation-delay:${(i * 0.2 - 1.2).toFixed(1)}s`, 1.5)).join(''),
  },
  asking: {
    words: 'awaiting you', hood: 'lift', wing: [-1, -1, 6], haloCss: 'animation:§pulse 2.6s ease-in-out infinite alternate',
    extras: p => `<rect class="${p}cursor" x="52" y="32" width="5" height="1"/>`,
  },
  oops: {
    words: 'signal lost', hood: 'bow', wing: [2, 2, 6], glitch: 'hard',
    extras: p => `<rect class="${p}blk" fill="${GLITCH_A}" x="50" y="14" width="12" height="1.3"/><rect class="${p}blk" fill="${GLITCH_B}" x="1" y="25" width="7" height="1.3"/>`,
  },
  done: { words: 'it is done', halo: 'closed', speed: 1.6 },
  sleepy: { words: 'dormant', hood: 'bow', isDissolving: true, wing: [2, 3, 9], speed: 2.2, dim: 0.55, haloCss: 'opacity:.45' },
}

const pixels = inner => `<g transform="translate(0 .5)" fill="none" stroke-width="1" shape-rendering="crispEdges">${inner}</g>`

function moodSvg(name) {
  const mood = MOODS[name]
  const p = `${name}-`
  const speed = mood.speed ?? 1
  const [wingFrom, wingTo, wingSecs] = mood.wing ?? [0, 1, 7] // rows down at rest, rows down at the far end of its slow beat, seconds
  const body = figure(mood, p), ring = halo(mood, p)
  const band = mood.glitch === 'hard' ? [FY + 3, 10] : [FY + 10, 5] // the slice that jumps sideways: top row, rows
  const jump = mood.glitch === 'hard'
    ? `0%{transform:translateX(-5px)}3%{transform:translateX(4px)}6%{transform:translateX(-2px)}9%{transform:translateX(1px)}12%{transform:translateX(0)}55%{transform:translateX(2px)}57%{transform:translateX(0)}`
    : `0%{transform:translateX(0)}94%{transform:translateX(-3px)}95.2%{transform:translateX(2px)}96.2%{transform:translateX(-1px)}97%{transform:translateX(0)}`
  const split = sign => mood.glitch === 'hard'
    ? `0%{opacity:.8;transform:translateX(${3 * sign}px)}3%{opacity:0}6%{opacity:.6;transform:translateX(${-2 * sign}px)}9%{opacity:0}`
    : `0%{opacity:0}94%{opacity:.7;transform:translateX(${2 * sign}px)}95.2%{opacity:0}96.2%{opacity:.5;transform:translateX(${-2 * sign}px)}97%{opacity:0}`
  const loop = mood.glitch === 'hard' ? 6 : 13
  const css = (
    `@keyframes §br{from{opacity:.6}to{opacity:1}}` +
    `.§wing{transform:translateY(${wingFrom}px);animation:§wg ${wingSecs}s step-end infinite}@keyframes §wg{0%{transform:translateY(${wingFrom}px)}50%{transform:translateY(${wingTo}px)}}` +
    `.§l0{animation:§k0 ${(2.6 * speed).toFixed(2)}s step-end infinite}.§l1{animation:§k1 ${(3.7 * speed).toFixed(2)}s step-end infinite}.§l2{animation:§k2 ${(4.9 * speed).toFixed(2)}s step-end infinite}.§l3{animation:§k1 ${(1.9 * speed).toFixed(2)}s step-end infinite}` +
    `@keyframes §k0{0%{opacity:1}35%{opacity:0}50%{opacity:1}80%{opacity:0}}@keyframes §k1{0%{opacity:0}20%{opacity:1}60%{opacity:0}75%{opacity:1}}@keyframes §k2{0%{opacity:0}45%{opacity:1}52%{opacity:0}88%{opacity:1}94%{opacity:0}}` +
    `.§hb{animation:§bk 5s step-end infinite}.§px{fill:${CHROME};animation:§bk 5s step-end infinite}@keyframes §bk{0%{opacity:.9}55%{opacity:.15}70%{opacity:.9}82%{opacity:.3}90%{opacity:.9}}` +
    `.§st{fill:${CHROME};fill-opacity:.85;animation:§br 6s ease-in-out infinite alternate}` +
    (mood.haloCss ? `.§halo{${mood.haloCss}}@keyframes §flash{0%{opacity:1}30%{opacity:.35}45%{opacity:1}}@keyframes §pulse{from{opacity:.35}to{opacity:1}}` : '') +
    `.§wire{fill:none;stroke:${CHROME};stroke-width:1.1;vector-effect:non-scaling-stroke;stroke-dasharray:1;stroke-dashoffset:0}` +
    `.§in{animation:§draw 3.2s ease-in-out infinite}.§out{animation:§draw 2.6s ease-in-out infinite}@keyframes §draw{0%{stroke-dashoffset:1}55%,92%{stroke-dashoffset:0}100%{stroke-dashoffset:1}}` +
    `.§tick{fill:${LINE};opacity:.2;animation:§tk 1.2s step-end infinite}@keyframes §tk{0%{opacity:1}17%{opacity:.5}34%{opacity:.2}}` +
    `.§cursor{fill:${LINE};animation:§cur 1.3s step-end infinite}@keyframes §cur{0%{opacity:1}50%{opacity:0}}` +
    (mood.glitch
      ? `.§band{animation:§jump ${loop}s step-end infinite}@keyframes §jump{${jump}}` +
        `.§gh{opacity:0}.§ga{animation:§sa ${loop}s step-end infinite}.§gb{animation:§sb ${loop}s step-end infinite}@keyframes §sa{${split(1)}}@keyframes §sb{${split(-1)}}` +
        `.§blk{opacity:0;animation:§bf ${loop}s step-end infinite}@keyframes §bf{0%{opacity:.7}4%{opacity:0}7%{opacity:.5}10%{opacity:0}}`
      : '') +
    `@media (prefers-reduced-motion:reduce){*{animation:none!important}}`
  ).replaceAll('§', p)

    const pet =
    pixels(wings(p)) +
    star(CX + 33, 33, 2, `${p}st`) + star(CX - 30, 39, 1.6, `${p}st`) +
    dot(CX - 31, 27, `${p}px`) + dot(CX - 29, 29, `${p}px`, 'animation-delay:-1.7s') + dot(CX + 31, 21, `${p}px`, 'animation-delay:-3.1s') +
    pixels(ring.svg + body.svg)
  const ghost = cls => `<g class="${p}gh ${cls}">${pixels(px([...ring.shape, ...body.shape], cls.endsWith('ga') ? GLITCH_A : GLITCH_B))}</g>`
  const drawn = mood.glitch
    ? `<defs><g id="${p}pet">${pet}</g><clipPath id="${p}cb"><rect x="-20" y="${band[0]}" width="${W + 40}" height="${band[1]}"/></clipPath>` +
      `<clipPath id="${p}cr"><rect x="-20" y="-20" width="${W + 40}" height="${band[0] + 20}"/><rect x="-20" y="${band[0] + band[1]}" width="${W + 40}" height="${H}"/></clipPath></defs>` +
      ghost(`${p}ga`) + ghost(`${p}gb`) +
      `<use href="#${p}pet" clip-path="url(#${p}cr)"/><g clip-path="url(#${p}cb)"><use class="${p}band" href="#${p}pet"/></g>`
    : pet
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}"><style>${css}</style><g${mood.dim ? ` opacity="${mood.dim}"` : ''}>${drawn}</g>${mood.extras ? `<g transform="translate(8 0)">${mood.extras(p)}</g>` : ''}</svg>`
}

const art = Object.fromEntries(Object.keys(MOODS).map(name => [name, moodSvg(name)]))
const words = Object.fromEntries(Object.keys(MOODS).map(name => [name, MOODS[name].words]))
const sizes = Object.values(art).map(s => s.length)
console.log(`${sizes.length} moods, ${Math.min(...sizes)}-${Math.max(...sizes)} characters each, ${sizes.reduce((a, b) => a + b, 0)} in all`)

// a page for looking at every mood on both grounds:
//   ?one=idle,oops  only these   ?x=8  cells this many pixels wide   ?t=12.3  frozen at this second
const cards = Object.keys(MOODS).map(name => `<figure data-m="${name}"><div class="pet">${art[name]}</div><figcaption><b>${name}</b><br>${words[name] || '&nbsp;'}</figcaption></figure>`).join('')
fs.writeFileSync(path.join(here, 'pet-preview.html'), `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Wired Angel pet preview</title>
<style>body{margin:0;font:13px/1.4 ui-monospace,Consolas,monospace}
main{display:flex;flex-wrap:wrap;gap:8px;padding:12px}main.dark{background:#12111e;color:#bdbbd6}main.light{background:#e8eaf1;color:#40425a}
figure{margin:0;padding:8px;text-align:center}.pet svg{width:calc(${W}px * var(--x, 3));height:calc(${H}px * var(--x, 3));display:block}</style>
<body><main class="dark">${cards}</main><main class="light">${cards}</main><script>const q=new URLSearchParams(location.search);
if(q.has('x'))document.body.style.setProperty('--x',q.get('x'));const one=(q.get('one')||'').split(',').filter(Boolean);
if(one.length)document.querySelectorAll('figure').forEach(f=>{if(!one.includes(f.dataset.m))f.remove()});
window.seek=t=>document.getAnimations().forEach(a=>{a.pause();a.currentTime=t*1000});if(q.has('t'))seek(+q.get('t'))</script></body>`)

if (MOD_HOOKS) {
  fs.writeFileSync(path.join(MOD_HOOKS, 'pet-art.js'),
    `// Built by build-angel.mjs. Don't edit by hand.\nexport const PET_SIZE = ${JSON.stringify({ width: W, height: H })}\nexport const PET_WORDS = ${JSON.stringify(words)}\nexport const PET_ART = ${JSON.stringify(art)}\n`)
  fs.writeFileSync(path.join(MOD_HOOKS, 'pet-art.d.ts'),
    `// Moods here: ${Object.keys(MOODS).join(', ')} (keep types/index.d.ts in step)\nimport type { Mood } from '../types'\n\nexport const PET_SIZE: { width: number; height: number }\nexport const PET_WORDS: Record<Mood, string>\nexport const PET_ART: Record<Mood, string>\n`)
  console.log('wrote pet-art.js into', MOD_HOOKS)
}
