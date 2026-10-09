import type { ClientModule } from 'claude-code'

// Zone tactile invisible posée sur Pixel : elle prévient le mod quand la
// souris arrive, repart ou clique, et le mod fait réagir Pixel.

const Touch: ClientModule = (_props, surface) => {
  surface.onPointer(event => {
    if (event.type === 'down' && event.button !== 'right') surface.post({ kind: 'poke' })
    else if (event.type === 'enter') surface.post({ kind: 'enter' })
    else if (event.type === 'leave') surface.post({ kind: 'leave' })
  })

  const { Box, Text } = surface.elements
  const line = ' '.repeat(Math.max(1, surface.columns))

  return Box({
    flexDirection: 'column',
    children: Array.from({ length: Math.max(1, surface.rows) }, () => Text({ children: line })),
  })
}

export default Touch
