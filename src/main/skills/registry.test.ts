import { mkdtemp, readFile, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import { SkillRegistry } from '@aipoch/skills'
import { ClaudeCodeSkillMaterializer } from './materializer'
import { toUnpackedAsarPath } from './resource-path'

describe('SkillRegistry', () => {
  it('resolves packaged Skill resources outside app.asar without consulting the cwd', () => {
    expect(
      toUnpackedAsarPath(
        '/Applications/Open-Science.app/Contents/Resources/app.asar/resources/skills'
      )
    ).toBe('/Applications/Open-Science.app/Contents/Resources/app.asar.unpacked/resources/skills')
    expect(toUnpackedAsarPath('/workspace/resources/skills')).toBe('/workspace/resources/skills')
  })

  it('discovers the bundled figure helper descriptors from the production manifest', async () => {
    const skillsRoot = join(__dirname, '..', '..', '..', 'resources', 'skills')
    const skills = await new SkillRegistry(skillsRoot).list()
    const figureSkills = skills.filter(({ id }) =>
      ['figure-style', 'figure-composer', 'paper-narrative'].includes(id)
    )

    expect(figureSkills.map(({ id }) => id).sort()).toEqual([
      'figure-composer',
      'figure-style',
      'paper-narrative'
    ])
    for (const skill of figureSkills) {
      expect(skill).toMatchObject({ source: 'featured' })
      expect(skill.helpers).toEqual([
        expect.objectContaining({
          id: skill.id,
          language: 'python',
          implementation: 'kernel.py',
          exports: expect.any(Array)
        })
      ])
      expect(skill.helpers?.[0]?.exports.length).toBeGreaterThan(0)
      expect(skill.helpers?.[0]).not.toHaveProperty('source')
    }
  })

  it('projects the bundled PDF report Skill with its supporting references', async () => {
    const skillsRoot = join(__dirname, '..', '..', '..', 'resources', 'skills')
    const skill = (await new SkillRegistry(skillsRoot).list()).find(
      ({ id }) => id === 'pdf-report-generation'
    )
    expect(skill).toMatchObject({ name: 'pdf-report-generation', source: 'featured' })
    if (!skill) throw new Error('PDF report Skill missing from production manifest')

    const configDir = await mkdtemp(join(tmpdir(), 'pdf-report-skill-'))
    await new ClaudeCodeSkillMaterializer().sync(configDir, [skill])
    for (const reference of [
      'research-integrity.md',
      'report-architecture.md',
      'english-scientific-writing.md',
      'chinese-literature-review.md',
      'pdf-layout-qa.md',
      'runtime-boundaries.md'
    ]) {
      await expect(
        readFile(
          join(configDir, 'skills', 'os-pdf-report-generation', 'references', reference),
          'utf8'
        )
      ).resolves.toContain('# ')
    }
    await expect(
      readFile(
        join(configDir, 'skills', 'os-pdf-report-generation', 'scripts', 'pdf_quality_gate.py'),
        'utf8'
      )
    ).resolves.toContain('def main()')
    await expect(
      readFile(
        join(
          configDir,
          'skills',
          'os-pdf-report-generation',
          'assets',
          'reportlab-scientific-template.py'
        ),
        'utf8'
      )
    ).resolves.toContain('class ScientificReport')
  })

  it('projects the DOCX report Skill with its own references, template, and validator', async () => {
    const skillsRoot = join(__dirname, '..', '..', '..', 'resources', 'skills')
    const skill = (await new SkillRegistry(skillsRoot).list()).find(
      ({ id }) => id === 'docx-generation'
    )
    expect(skill).toMatchObject({ name: 'docx-generation', source: 'featured' })
    if (!skill) throw new Error('DOCX report Skill missing from production manifest')

    const configDir = await mkdtemp(join(tmpdir(), 'docx-report-skill-'))
    await new ClaudeCodeSkillMaterializer().sync(configDir, [skill])
    for (const reference of [
      'research-integrity.md',
      'report-architecture.md',
      'english-scientific-writing.md',
      'chinese-literature-review.md',
      'docx-layout-qa.md',
      'runtime-boundaries.md'
    ]) {
      await expect(
        readFile(join(configDir, 'skills', 'os-docx-generation', 'references', reference), 'utf8')
      ).resolves.toContain('# ')
    }
    await expect(
      readFile(
        join(configDir, 'skills', 'os-docx-generation', 'scripts', 'docx_quality_gate.py'),
        'utf8'
      )
    ).resolves.toContain('def main()')
    await expect(
      readFile(
        join(
          configDir,
          'skills',
          'os-docx-generation',
          'assets',
          'python-docx-scientific-template.py'
        ),
        'utf8'
      )
    ).resolves.toContain('class ScientificDocxReport')
    const fontDir = join(configDir, 'skills', 'os-docx-generation', 'assets', 'fonts')
    expect((await stat(join(fontDir, 'NotoSerifSC-Regular.otf'))).size).toBeGreaterThan(1_000_000)
    await expect(readFile(join(fontDir, 'OFL.txt'), 'utf8')).resolves.toContain(
      'SIL OPEN FONT LICENSE'
    )
  })

  it('keeps scientific writing references identical across PDF and DOCX packages', async () => {
    const skillsRoot = join(__dirname, '..', '..', '..', 'resources', 'skills')
    for (const reference of [
      'research-integrity.md',
      'report-architecture.md',
      'english-scientific-writing.md',
      'chinese-literature-review.md',
      'runtime-boundaries.md'
    ]) {
      const canonical = await readFile(
        join(skillsRoot, '_shared', 'scientific-report', reference),
        'utf8'
      )
      for (const skill of ['pdf-report-generation', 'docx-generation']) {
        await expect(
          readFile(join(skillsRoot, skill, 'references', reference), 'utf8')
        ).resolves.toBe(canonical)
      }
    }
  })

  it('marks exactly the application-required Skills always-on in the production manifest', async () => {
    const skillsRoot = join(__dirname, '..', '..', '..', 'resources', 'skills')
    const skills = await new SkillRegistry(skillsRoot).list()

    expect(
      skills
        .filter((skill) => skill.activationPolicy === 'always-on')
        .map((skill) => skill.id)
        .sort()
    ).toEqual([
      'compute-env-setup',
      'customize',
      'env-management',
      'remote-compute-ssh',
      'self-awareness',
      'skill-creator'
    ])
  })
})
