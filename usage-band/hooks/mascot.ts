import type { Mood } from '../types'

// Pixel, la mascotte du bandeau : un SVG animé dans l'app desktop, un petit
// visage en texte dans le terminal.

type Face = 'normal' | 'up' | 'focus' | 'left' | 'happy' | 'x' | 'worried' | 'closed' | 'wide' | 'spiral'
type Look = { label: string; kao: string; anim: string; face: Face; mouth?: 'smile' | 'o' | 'open' }

export const MOODS: Record<Mood, Look> = {
  idle: { label: 'au repos', kao: '(•ᴗ•)', anim: 'bob', face: 'normal' },
  think: { label: 'réfléchit', kao: '(•_•)…', anim: 'bob', face: 'up' },
  code: { label: 'écrit du code', kao: '(ò_ó)✎', anim: 'type', face: 'focus' },
  read: { label: 'lit le code', kao: '(•_•)⌕', anim: 'bob', face: 'left' },
  bash: { label: 'lance une commande', kao: '(•_•)>_', anim: 'type', face: 'left' },
  web: { label: 'cherche sur le web', kao: '(•_•)◍', anim: 'bob', face: 'left' },
  agent: { label: 'délègue à un sous-agent', kao: '(•ᴗ•)(•ᴗ•)', anim: 'bob', face: 'left' },
  done: { label: 'a terminé', kao: '(^ᴗ^)✦', anim: 'jump', face: 'happy', mouth: 'smile' },
  error: { label: 'a eu une erreur', kao: '(×_×)', anim: 'shake', face: 'x' },
  alert: { label: 'surveille une limite', kao: '(°□°;)', anim: 'shake', face: 'worried', mouth: 'o' },
  sleep: { label: 'dort', kao: '(-_-) zᶻ', anim: 'breathe', face: 'closed' },
  party: { label: 'fait la fête', kao: '\\(^o^)/', anim: 'jump', face: 'happy', mouth: 'smile' },
  love: { label: 'est content', kao: '(♥ᴗ♥)', anim: 'bob', face: 'happy', mouth: 'smile' },
  hello: { label: 'te fait coucou', kao: '(•ᴗ•)/', anim: 'bob', face: 'normal', mouth: 'smile' },
  giggle: { label: 'rigole', kao: '(^ᴗ^)♪', anim: 'giggle', face: 'happy', mouth: 'open' },
  boing: { label: 'saute de joie', kao: '\\(•ᴗ•)/', anim: 'boing', face: 'happy', mouth: 'smile' },
  surprise: { label: 'est surpris', kao: '(°o°)!', anim: 'bob', face: 'wide', mouth: 'o' },
  dizzy: { label: 'a la tête qui tourne', kao: '(@_@)', anim: 'sway', face: 'spiral' },
}

export const MASCOT_WIDTH = 64
export const MASCOT_HEIGHT = 44

const BODY = '#D97757'
const SHADE = '#c0613f'
const INK = '#2b1d16'
const PAPER = '#e8e6df'
const SKY = '#7cc4ff'

const EYES: Array<[number, number]> = [
  [36, 13],
  [48, 13],
]
const EYE_W = 4
const EYE_H = 6

const RIGHT_ARM = `<rect x="60" y="14" width="4" height="6" fill="${BODY}"/>`
const WAVING_ARM = `<g class="wave"><rect x="60" y="6" width="4" height="10" fill="${BODY}"/></g>`

function pixel(isWaving = false): string {
  return (
    `<rect x="28" y="8" width="32" height="20" fill="${BODY}"/>` +
    `<rect x="24" y="14" width="4" height="6" fill="${BODY}"/>` +
    (isWaving ? WAVING_ARM : RIGHT_ARM) +
    `<g fill="${SHADE}"><rect x="32" y="28" width="4" height="7"/><rect x="38" y="28" width="4" height="7"/>` +
    `<rect x="46" y="28" width="4" height="7"/><rect x="52" y="28" width="4" height="7"/></g>`
  )
}

const PIXEL = pixel()

const CSS = [
  '.bob{animation:bob 2.6s ease-in-out infinite}',
  '.type{animation:bob .32s ease-in-out infinite}',
  '.jump{animation:jump .7s ease-in-out infinite}',
  '.shake{animation:shake .35s linear infinite}',
  '.breathe{animation:breathe 3.5s ease-in-out infinite;transform-box:fill-box;transform-origin:bottom}',
  '.blink{animation:blink 4s infinite;transform-box:fill-box;transform-origin:center}',
  '.d1,.d2,.d3,.fl{animation:fade 1.2s infinite}.d2{animation-delay:.2s}.d3{animation-delay:.4s}.fl{animation-duration:.6s}',
  '.cur{animation:cur 1s steps(1) infinite}',
  '.scan{animation:scan 1.6s ease-in-out infinite}',
  '.spin{animation:spin 2s linear infinite;transform-box:fill-box;transform-origin:center}',
  '.tw{animation:tw 1.4s ease-in-out infinite;transform-box:fill-box;transform-origin:center}',
  '.zz{animation:zz 3s ease-in infinite}',
  '.fall{animation:fall 1.6s linear infinite}',
  '.rise{animation:rise 2s ease-out infinite}',
  '.giggle{animation:shake .18s linear infinite}',
  '.boing{animation:boing .55s cubic-bezier(.3,0,.5,1) infinite;transform-box:fill-box;transform-origin:bottom}',
  '.sway{animation:sway 1.2s ease-in-out infinite;transform-box:fill-box;transform-origin:bottom}',
  '.wave{animation:wave .5s ease-in-out infinite alternate;transform-box:fill-box;transform-origin:50% 100%}',
  '.orbit{animation:orbit 1.2s linear infinite;transform-box:view-box;transform-origin:44px 4px}',
  '.whirl{animation:whirl .9s linear infinite;transform-box:fill-box;transform-origin:center}',
  '@keyframes bob{50%{transform:translateY(-1.5px)}}',
  '@keyframes jump{50%{transform:translateY(-4px)}}',
  '@keyframes shake{25%{transform:translateX(-1.2px)}75%{transform:translateX(1.2px)}}',
  '@keyframes breathe{50%{transform:scaleY(.94)}}',
  '@keyframes blink{0%,92%,100%{transform:scaleY(1)}95%{transform:scaleY(.1)}}',
  '@keyframes fade{0%,100%{opacity:.25}50%{opacity:1}}',
  '@keyframes cur{50%{opacity:0}}',
  '@keyframes scan{50%{transform:translate(4px,2px)}}',
  '@keyframes spin{50%{transform:scaleX(.15)}}',
  '@keyframes tw{50%{transform:scale(.35);opacity:.5}}',
  '@keyframes zz{0%{transform:translate(0,4px);opacity:0}30%{opacity:1}100%{transform:translate(-5px,-9px);opacity:0}}',
  '@keyframes fall{0%{transform:translateY(-6px);opacity:0}15%{opacity:1}100%{transform:translateY(34px);opacity:0}}',
  '@keyframes rise{0%{transform:translateY(6px);opacity:0}30%{opacity:1}100%{transform:translateY(-12px);opacity:0}}',
  '@keyframes boing{0%,100%{transform:translateY(0) scaleY(1)}15%{transform:translateY(0) scaleY(.85)}50%{transform:translateY(-7px) scaleY(1.05)}}',
  '@keyframes sway{25%{transform:rotate(-6deg)}75%{transform:rotate(6deg)}}',
  '@keyframes wave{from{transform:rotate(-18deg)}to{transform:rotate(18deg)}}',
  '@keyframes orbit{to{transform:rotate(360deg)}}',
  '@keyframes whirl{to{transform:rotate(360deg)}}',
  '@media (prefers-reduced-motion:reduce){*{animation:none!important}}',
].join('')

function eyes(face: Face): string {
  return EYES.map(([x, y]) => {
    if (face === 'happy') {
      return `<polyline points="${x - 0.5},${y + 4} ${x + EYE_W / 2},${y + 1} ${x + EYE_W + 0.5},${y + 4}" fill="none" stroke="${INK}" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/>`
    }
    if (face === 'closed') {
      const cy = y + EYE_H / 2 + 1

      return `<line x1="${x - 0.5}" y1="${cy}" x2="${x + EYE_W + 0.5}" y2="${cy}" stroke="${INK}" stroke-width="1.6" stroke-linecap="round"/>`
    }
    if (face === 'x') {
      return `<g stroke="${INK}" stroke-width="1.5" stroke-linecap="round"><line x1="${x - 0.5}" y1="${y}" x2="${x + EYE_W + 0.5}" y2="${y + EYE_H - 1}"/><line x1="${x + EYE_W + 0.5}" y1="${y}" x2="${x - 0.5}" y2="${y + EYE_H - 1}"/></g>`
    }

    if (face === 'wide') {
      return `<rect x="${x - 1}" y="${y - 1.5}" width="${EYE_W + 2}" height="${EYE_H + 2}" fill="${INK}"/><rect x="${x}" y="${y - 0.5}" width="1.6" height="1.6" fill="${PAPER}"/>`
    }
    if (face === 'spiral') {
      const cx = x + EYE_W / 2
      const cy = y + EYE_H / 2

      return `<g class="whirl"><circle cx="${cx}" cy="${cy}" r="3.2" fill="none" stroke="${INK}" stroke-width="1.2" stroke-dasharray="14 6"/><circle cx="${cx}" cy="${cy}" r="1.2" fill="${INK}"/></g>`
    }

    const dx = face === 'left' || face === 'focus' ? -1.5 : 0
    const dy = face === 'up' ? -1.5 : face === 'focus' ? 2 : 0
    const h = face === 'focus' ? EYE_H - 3 : EYE_H
    let out = `<rect x="${x + dx}" y="${y + dy}" width="${EYE_W}" height="${h}" fill="${INK}"/>`
    if (face === 'worried') {
      const [y1, y2] = x < 44 ? [y - 1, y - 2.5] : [y - 2.5, y - 1]
      out += `<line x1="${x - 1}" y1="${y1}" x2="${x + EYE_W + 1}" y2="${y2}" stroke="${INK}" stroke-width="1.3" stroke-linecap="round"/>`
    }

    return out
  }).join('')
}

function mouth(kind: Look['mouth']): string {
  if (kind === 'smile') return `<path d="M41 23 q3 3 6 0" fill="none" stroke="${INK}" stroke-width="1.5" stroke-linecap="round"/>`
  if (kind === 'o') return `<ellipse cx="44" cy="24" rx="1.6" ry="2" fill="${INK}"/>`
  if (kind === 'open') return `<path d="M40.5 22 h7 q0 4.5 -3.5 4.5 q-3.5 0 -3.5 -4.5 Z" fill="${INK}"/>`

  return ''
}

function sparkle(x: number, y: number, delay: number): string {
  return `<path class="tw" style="animation-delay:${delay}s" d="M${x} ${y - 4} L${x + 1.2} ${y - 1.2} L${x + 4} ${y} L${x + 1.2} ${y + 1.2} L${x} ${y + 4} L${x - 1.2} ${y + 1.2} L${x - 4} ${y} L${x - 1.2} ${y - 1.2} Z" fill="#facc15"/>`
}

const CONFETTI: Array<[number, string, number]> = [
  [4, '#facc15', 0],
  [12, '#4ade80', 0.5],
  [20, '#a78bfa', 0.2],
  [30, '#7cc4ff', 0.9],
  [40, '#f87171', 0.35],
  [50, '#facc15', 1.1],
  [58, '#4ade80', 0.7],
  [8, '#f472b6', 1.3],
]

function prop(mood: Mood): string {
  switch (mood) {
    case 'think':
      return (
        `<circle cx="23" cy="13" r="1.3" fill="${PAPER}" opacity=".7"/><rect x="2" y="2" width="19" height="9" rx="4.5" fill="${PAPER}"/>` +
        `<circle class="d1" cx="7" cy="6.5" r="1.4" fill="#2b2b29"/><circle class="d2" cx="11.5" cy="6.5" r="1.4" fill="#2b2b29"/><circle class="d3" cx="16" cy="6.5" r="1.4" fill="#2b2b29"/>`
      )
    case 'code':
      return (
        `<rect x="3" y="20" width="18" height="13" rx="1.5" fill="#44443f"/><rect x="5" y="22" width="14" height="9" fill="#1b1b19"/>` +
        `<rect class="fl" x="6.5" y="23.5" width="7" height="1.4" fill="#4ade80"/><rect x="6.5" y="26.2" width="10" height="1.4" fill="#a78bfa"/>` +
        `<rect class="fl" style="animation-delay:.3s" x="6.5" y="28.9" width="5" height="1.4" fill="${BODY}"/><rect x="1" y="33" width="22" height="2.6" rx="1" fill="#5a5a55"/>`
      )
    case 'read':
      return (
        `<rect x="3" y="11" width="14" height="19" rx="1.5" fill="${PAPER}"/>` +
        `<g fill="#9b9a94"><rect x="5.5" y="14" width="9" height="1.3"/><rect x="5.5" y="17" width="7" height="1.3"/><rect x="5.5" y="20" width="9" height="1.3"/><rect x="5.5" y="23" width="6" height="1.3"/></g>` +
        `<g class="scan"><circle cx="12" cy="18" r="5" fill="none" stroke="${SKY}" stroke-width="1.8"/><line x1="15.5" y1="21.5" x2="20" y2="26" stroke="${SKY}" stroke-width="2.4" stroke-linecap="round"/></g>`
      )
    case 'bash':
      return (
        `<rect x="2" y="12" width="21" height="16" rx="2" fill="#1b1b19" stroke="#5a5a55"/>` +
        `<path d="M5 17.5 l3 2.5 -3 2.5" fill="none" stroke="#4ade80" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>` +
        `<rect class="cur" x="11" y="17.5" width="4" height="6" fill="#4ade80"/>`
      )
    case 'web':
      return (
        `<circle cx="12" cy="20" r="8" fill="none" stroke="${SKY}" stroke-width="1.7"/>` +
        `<ellipse class="spin" cx="12" cy="20" rx="3.5" ry="8" fill="none" stroke="${SKY}" stroke-width="1.3"/>` +
        `<line x1="4" y1="20" x2="20" y2="20" stroke="${SKY}" stroke-width="1.3"/>`
      )
    case 'agent':
      return `<g transform="translate(-7 15) scale(.5)"><g class="type">${PIXEL}<g class="blink">${eyes('normal')}</g></g></g>`
    case 'done':
      return sparkle(6, 9, 0) + sparkle(18, 4, 0.4) + sparkle(12, 27, 0.8)
    case 'error':
      return `<circle cx="12" cy="17" r="7" fill="#f87171"/><rect x="11" y="12" width="2.2" height="6.5" rx="1" fill="${INK}"/><circle cx="12.1" cy="21.3" r="1.3" fill="${INK}"/>`
    case 'alert':
      return (
        `<path class="rise" d="M24 4 q-3 4.5 0 6.5 q3 -2 0 -6.5 Z" fill="${SKY}"/>` +
        `<path class="rise" style="animation-delay:1s" d="M18 9 q-2.4 3.6 0 5.2 q2.4 -1.6 0 -5.2 Z" fill="${SKY}"/>`
      )
    case 'sleep':
      return [
        [16, 16, 10, 0],
        [9, 12, 8, 1],
        [3, 9, 6, 2],
      ]
        .map(
          ([x, y, size, delay]) =>
            `<text class="zz" style="animation-delay:${delay}s" x="${x}" y="${y}" font-family="system-ui,sans-serif" font-size="${size}" font-weight="700" fill="${PAPER}">z</text>`,
        )
        .join('')
    case 'party':
      return CONFETTI.map(
        ([x, color, delay]) =>
          `<rect class="fall" style="animation-delay:${delay}s" x="${x}" y="2" width="2.6" height="2.6" fill="${color}" transform="rotate(${x * 7} ${x + 1} 3)"/>`,
      ).join('')
    case 'love':
      return (
        `<path class="rise" d="M12 24 C4 18 6 11 12 15 C18 11 20 18 12 24 Z" fill="#f472b6"/>` +
        `<path class="rise" style="animation-delay:1s" d="M5 16 C1 13 2 9 5 11 C8 9 9 13 5 16 Z" fill="#f472b6"/>`
      )
    case 'giggle':
      return [
        [8, 18, 0],
        [16, 12, 0.7],
      ]
        .map(
          ([x, y, delay]) =>
            `<text class="rise" style="animation-delay:${delay}s" x="${x}" y="${y}" font-family="system-ui,sans-serif" font-size="11" font-weight="700" fill="#facc15">♪</text>`,
        )
        .join('')
    case 'boing':
      return sparkle(8, 30, 0) + sparkle(16, 8, 0.3) + sparkle(4, 16, 0.6)
    case 'surprise':
      return `<circle cx="13" cy="15" r="7" fill="#facc15"/><rect x="11.9" y="10" width="2.2" height="6.5" rx="1" fill="${INK}"/><circle cx="13" cy="19.3" r="1.3" fill="${INK}"/>`
    case 'dizzy':
      return `<g class="orbit">${sparkle(36, 4, 0)}${sparkle(52, 4, 0.5)}</g>`
    default:
      return ''
  }
}

function blush(mood: Mood): string {
  if (mood !== 'love') return ''

  return EYES.map(
    ([x, y]) => `<ellipse cx="${x + EYE_W / 2}" cy="${y + EYE_H + 2.5}" rx="2.4" ry="1.3" fill="#f472b6" opacity=".55"/>`,
  ).join('')
}

/** La couleur un peu plus sombre des pattes. */
function shade(hex: string): string {
  const rgb = /^#([0-9a-f]{6})$/i.exec(hex)?.[1]
  if (rgb === undefined) return SHADE
  const n = parseInt(rgb, 16)
  const dark = [16, 8, 0].map(bits => Math.round(((n >> bits) & 255) * 0.86))

  return `#${dark.map(c => c.toString(16).padStart(2, '0')).join('')}`
}

export type MascotLook = { color?: string; scale?: number }

export function mascotSvg(mood: Mood, { color = BODY, scale = 1 }: MascotLook = {}): string {
  const svg = drawMascot(mood, Math.round(MASCOT_WIDTH * scale), Math.round(MASCOT_HEIGHT * scale))

  return color.toLowerCase() === BODY.toLowerCase() ? svg : svg.replaceAll(BODY, color).replaceAll(SHADE, shade(color))
}

function drawMascot(mood: Mood, width: number, height: number): string {
  const look = MOODS[mood]
  const face = look.face === 'normal' ? `<g class="blink">${eyes('normal')}</g>` : eyes(look.face)

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${MASCOT_WIDTH} ${MASCOT_HEIGHT}">` +
    `<title>Pixel ${look.label}</title><style>${CSS}</style>` +
    prop(mood) +
    `<g class="${look.anim}">${pixel(mood === 'hello')}${face}${blush(mood)}${mouth(look.mouth)}</g>` +
    '</svg>'
  )
}
