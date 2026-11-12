import { getDocument, GlobalWorkerOptions } from 'pdfjs-dist'
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
import { textFromPieces, type PdfPiece } from './pdfText'

GlobalWorkerOptions.workerSrc = workerUrl

const MAX_PAGES = 20

type TextItemLike = {
  str: string
  transform: number[]
  width?: number
  height?: number
}

function isTextItem(item: unknown): item is TextItemLike {
  return Boolean(item && typeof item === 'object' && 'str' in item && typeof (item as TextItemLike).str === 'string')
}

export async function readPdfResume(data: ArrayBuffer): Promise<string> {
  const task = getDocument({ data: new Uint8Array(data), verbosity: 0 })
  try {
    const pdf = await task.promise
    const pageCount = Math.min(pdf.numPages, MAX_PAGES)
    const chunks: string[] = []
    for (let index = 1; index <= pageCount; index += 1) {
      const page = await pdf.getPage(index)
      const content = await page.getTextContent()
      const pieces: PdfPiece[] = []
      for (const item of content.items) {
        if (!isTextItem(item) || !item.str.trim()) continue
        const height = item.height || Math.abs(item.transform[3] || 0) || 10
        pieces.push({
          str: item.str,
          x: item.transform[4] || 0,
          y: item.transform[5] || 0,
          width: item.width || 0,
          height,
        })
      }
      const text = textFromPieces(pieces)
      if (text) chunks.push(text)
    }
    const joined = chunks.join('\n\n').trim()
    if (!joined) return ''
    if (pdf.numPages > MAX_PAGES) return `${joined}\n\n（只读取了前 ${MAX_PAGES} 页）`
    return joined
  } finally {
    await task.destroy().catch(() => undefined)
  }
}

export function pdfReadError(error: unknown) {
  const name = error instanceof Error ? error.name : ''
  if (name === 'PasswordException') return '这份 PDF 有打开密码。请先去掉密码再上传。'
  if (name === 'InvalidPDFException') return '这个文件不是有效的 PDF。'
  return '没有读出 PDF 里的文字。请换一份可选中文字的 PDF，或直接粘贴正文。'
}
