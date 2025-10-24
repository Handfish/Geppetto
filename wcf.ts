import fs from 'fs'
import path from 'path'

async function readAllInput(): Promise<string> {
  // If a filename is passed as an argument, read that file.
  if (process.argv[2]) {
    return fs.readFileSync(process.argv[2], 'utf8')
  }

  // Otherwise, read from stdin
  const chunks: Buffer[] = []
  for await (const chunk of process.stdin) chunks.push(chunk as Buffer)
  return Buffer.concat(chunks).toString('utf8')
}

function writeFilesFromInput(input: string) {
  const fileBlocks = input.split(/(?=\/\/\s*src\/)/g).filter(Boolean)

  for (const block of fileBlocks) {
    const match = block.match(/^\/\/\s*(src\/[^\s]+)/)
    if (!match) continue

    const relativePath = match[1].trim()
    const content = block.replace(/^\/\/\s*src\/[^\n]+\n/, '')
    const fullPath = path.resolve(relativePath)

    const dir = path.dirname(fullPath)
    const base = path.basename(fullPath, path.extname(fullPath))
    const ext = path.extname(fullPath)

    fs.mkdirSync(dir, { recursive: true })

    // Collision-safe filename
    let finalPath = fullPath
    let counter = 1
    while (fs.existsSync(finalPath)) {
      finalPath = path.join(dir, `${base}(${counter})${ext}`)
      counter++
    }

    fs.writeFileSync(finalPath, content.trimStart(), 'utf8')
    console.log(`✅ Wrote: ${path.relative(process.cwd(), finalPath)}`)
  }
}

;(async () => {
  const input = await readAllInput()
  writeFilesFromInput(input)
})()
