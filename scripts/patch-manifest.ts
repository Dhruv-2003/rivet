import fs from 'node:fs'
import path from 'node:path'

const manifestPath = path.resolve(__dirname, '../dist/build/manifest.json')

if (!fs.existsSync(manifestPath)) {
  console.error('manifest.json not found at', manifestPath)
  process.exit(1)
}

const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8')) as any

manifest.content_scripts = [
  {
    matches: ['*://*/*'],
    js: ['content.js'],
    run_at: 'document_start',
    all_frames: true,
  },
]

fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2))
console.log('Patched manifest.json with content_scripts')
