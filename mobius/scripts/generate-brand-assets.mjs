/* eslint-disable @typescript-eslint/explicit-function-return-type */

import { cp, mkdir, readFile, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'

import sharp from 'sharp'

const root = resolve(import.meta.dirname, '..', '..')
const mobiusRoot = join(root, 'mobius')
const brandRoot = join(mobiusRoot, 'brand')
const generatedRoot = join(mobiusRoot, 'generated')
const iconArtwork = join(brandRoot, 'mobius-science-icon.svg')
const originalLightTile = join(root, 'build', 'icon.png')
const traySource = join(brandRoot, 'mobius-science-tray.svg')
const appRoot = join(generatedRoot, 'app')
const trayRoot = join(generatedRoot, 'tray')
const rendererRoot = join(generatedRoot, 'renderer')
const transparent = { r: 0, g: 0, b: 0, alpha: 0 }
const iconArtworkSource = await readFile(iconArtwork)

const ensureParent = async (path) => mkdir(resolve(path, '..'), { recursive: true })

const renderSquare = async (input, size, { trim = false, tint } = {}) => {
  let pipeline = sharp(input, { density: 512 }).ensureAlpha()
  if (trim) pipeline = pipeline.trim({ background: transparent })
  pipeline = pipeline.resize(size, size, {
    fit: 'contain',
    background: transparent,
    kernel: sharp.kernel.lanczos3
  })
  if (tint) pipeline = pipeline.tint(tint)
  if (size <= 64) pipeline = pipeline.sharpen({ sigma: size <= 16 ? 0.8 : 0.55 })
  return pipeline.png({ compressionLevel: 9, adaptiveFiltering: true }).toBuffer()
}

const writeSquare = async (input, output, size, options) => {
  await ensureParent(output)
  await writeFile(output, await renderSquare(input, size, options))
}

// Reuse the alpha silhouette of the upstream tile so the cosmic artwork keeps the established
// corner radius and optical bounds while remaining a stable full-color identity in either theme.
const renderBrandedTile = async (size) => {
  const alpha = await sharp(originalLightTile)
    .resize(size, size, { fit: 'fill', kernel: sharp.kernel.lanczos3 })
    .ensureAlpha()
    .extractChannel('alpha')
    .png()
    .toBuffer()
  const mask = await sharp({
    create: { width: size, height: size, channels: 3, background: '#ffffff' }
  })
    .joinChannel(alpha)
    .png()
    .toBuffer()
  return sharp(iconArtworkSource, { density: 512 })
    .resize(size, size, {
      fit: 'fill',
      kernel: sharp.kernel.lanczos3
    })
    .composite([{ input: mask, blend: 'dest-in' }])
    .png({ compressionLevel: 9, adaptiveFiltering: true })
    .toBuffer()
}

const writeBrandedTile = async (output, size) => {
  await ensureParent(output)
  await writeFile(output, await renderBrandedTile(size))
}

const encodeIco = (frames) => {
  const header = Buffer.alloc(6 + frames.length * 16)
  header.writeUInt16LE(0, 0)
  header.writeUInt16LE(1, 2)
  header.writeUInt16LE(frames.length, 4)
  let offset = header.length
  frames.forEach(({ size, png }, index) => {
    const entry = 6 + index * 16
    header.writeUInt8(size === 256 ? 0 : size, entry)
    header.writeUInt8(size === 256 ? 0 : size, entry + 1)
    header.writeUInt8(0, entry + 2)
    header.writeUInt8(0, entry + 3)
    header.writeUInt16LE(1, entry + 4)
    header.writeUInt16LE(32, entry + 6)
    header.writeUInt32LE(png.length, entry + 8)
    header.writeUInt32LE(offset, entry + 12)
    offset += png.length
  })
  return Buffer.concat([header, ...frames.map(({ png }) => png)])
}

const writeIco = async (input, output, sizes, options) => {
  await ensureParent(output)
  const frames = await Promise.all(
    sizes.map(async (size) => ({ size, png: await renderSquare(input, size, options) }))
  )
  await writeFile(output, encodeIco(frames))
}

const writeBrandedIco = async (output, sizes) => {
  const frames = await Promise.all(
    sizes.map(async (size) => ({ size, png: await renderBrandedTile(size) }))
  )
  await ensureParent(output)
  await writeFile(output, encodeIco(frames))
}

const writeIcns = async (output) => {
  const entries = [
    ['icp4', 16],
    ['icp5', 32],
    ['icp6', 64],
    ['ic07', 128],
    ['ic08', 256],
    ['ic09', 512],
    ['ic10', 1024]
  ]
  const chunks = await Promise.all(
    entries.map(async ([type, size]) => {
      const png = await renderBrandedTile(size)
      const chunk = Buffer.alloc(8 + png.length)
      chunk.write(type, 0, 4, 'ascii')
      chunk.writeUInt32BE(chunk.length, 4)
      png.copy(chunk, 8)
      return chunk
    })
  )
  const header = Buffer.alloc(8)
  header.write('icns', 0, 4, 'ascii')
  header.writeUInt32BE(8 + chunks.reduce((total, chunk) => total + chunk.length, 0), 4)
  await ensureParent(output)
  await writeFile(output, Buffer.concat([header, ...chunks]))
}

await Promise.all([
  writeBrandedTile(join(appRoot, 'icon-512.png'), 512),
  writeBrandedTile(join(appRoot, 'icon.png'), 1024),
  writeBrandedTile(join(appRoot, 'icon-dark.png'), 1024),
  writeBrandedTile(join(rendererRoot, 'logo.png'), 512),
  writeBrandedTile(join(rendererRoot, 'logo-dark.png'), 512),
  writeSquare(traySource, join(trayRoot, 'tray.png'), 24, { tint: '#56d8ff' }),
  writeSquare(traySource, join(trayRoot, 'tray@2x.png'), 48, { tint: '#56d8ff' }),
  writeSquare(traySource, join(trayRoot, 'trayTemplate.png'), 16),
  writeSquare(traySource, join(trayRoot, 'trayTemplate@2x.png'), 32),
  writeBrandedIco(join(appRoot, 'icon.ico'), [16, 24, 32, 48, 64, 128, 256]),
  writeBrandedIco(join(appRoot, 'icon-light.ico'), [16, 24, 32, 48, 64, 128, 256]),
  writeBrandedIco(join(appRoot, 'icon-dark.ico'), [16, 24, 32, 48, 64, 128, 256]),
  writeIco(traySource, join(trayRoot, 'tray-light.ico'), [16, 24, 32, 48], {
    tint: '#10152b'
  }),
  writeIco(traySource, join(trayRoot, 'tray-dark.ico'), [16, 24, 32, 48], {
    tint: '#dff8ff'
  }),
  writeIcns(join(appRoot, 'icon.icns'))
])

const iconComposerRoot = join(appRoot, 'icon.icon')
await mkdir(join(iconComposerRoot, 'Assets'), { recursive: true })
await cp(iconArtwork, join(iconComposerRoot, 'Assets', 'mobius-science-icon.svg'))
const iconComposer = JSON.parse(
  await readFile(join(root, 'build', 'icon.icon', 'icon.json'), 'utf8')
)
const layer = iconComposer.groups?.[0]?.layers?.[0]
if (!layer) throw new Error('build/icon.icon/icon.json does not contain its primary layer.')
layer['image-name'] = 'mobius-science-icon.svg'
delete layer['fill-specializations']
layer.position = { scale: 1, 'translation-in-points': [0, 0] }
layer.name = 'Mobius Science Cosmic'
await writeFile(join(iconComposerRoot, 'icon.json'), `${JSON.stringify(iconComposer, null, 2)}\n`)
process.stdout.write('Generated Mobius Science application and tray assets.\n')
