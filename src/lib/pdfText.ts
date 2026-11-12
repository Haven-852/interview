export type PdfPiece = {
  str: string
  x: number
  y: number
  width: number
  height: number
}

export function textFromPieces(pieces: PdfPiece[]): string {
  const rows: { y: number; height: number; parts: PdfPiece[] }[] = []
  for (const piece of pieces) {
    const str = piece.str.replace(/\u0000/g, '')
    if (!str.trim()) continue
    const height = piece.height || 10
    const row = rows.find((item) => Math.abs(item.y - piece.y) <= Math.max(2, height * 0.5))
    if (row) {
      row.parts.push({ ...piece, str, height })
      row.height = Math.max(row.height, height)
    } else {
      rows.push({ y: piece.y, height, parts: [{ ...piece, str, height }] })
    }
  }
  rows.sort((left, right) => right.y - left.y)
  const lines = rows
    .map((row) => {
      const parts = [...row.parts].sort((left, right) => left.x - right.x)
      let line = ''
      let end = Number.NEGATIVE_INFINITY
      for (const part of parts) {
        if (line && part.x - end > Math.max(3, row.height * 0.8)) line += ' '
        line += part.str
        end = part.x + (part.width || 0)
      }
      return line.replace(/[ \t]{2,}/g, ' ').trim()
    })
    .filter(Boolean)
  return lines.join('\n').replace(/\n{3,}/g, '\n\n').trim()
}
