import { mkdtemp, readFile, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import { SkillRegistry } from '@aipoch/skills'
import { ClaudeCodeSkillMaterializer } from './materializer'
import { toUnpackedAsarPath } from './resource-path'
import { HostSkillsService, type HostSkillsCatalog } from './host-skills-service'

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

  it('projects all four general research Skills with their scripts and references', async () => {
    const skillsRoot = join(__dirname, '..', '..', '..', 'resources', 'skills')
    const skills = await new SkillRegistry(skillsRoot).list()
    const configDir = await mkdtemp(join(tmpdir(), 'general-research-skills-'))
    const expected = [
      ['literature-deep-review', 'evidence.py', 'evidence-contract.md'],
      ['experimental-design-statistics', 'design.py', 'methods-and-boundaries.md'],
      ['evidence-synthesis-meta-analysis', 'run_meta_analysis.py', 'extraction-contract.md'],
      ['research-proposal-writing', 'proposal.py', 'proposal-templates.md']
    ] as const
    const selected = expected.map(([id]) => {
      const found = skills.find((skill) => skill.id === id)
      if (!found) throw new Error(`Bundled research Skill missing: ${id}`)
      expect(found.name).toBe(id)
      return found
    })
    await new ClaudeCodeSkillMaterializer().sync(configDir, selected)
    for (const [id, script, reference] of expected) {
      const root = join(configDir, 'skills', `os-${id}`)
      await expect(readFile(join(root, 'scripts', script), 'utf8')).resolves.toContain(
        'if __name__ == "__main__"'
      )
      await expect(readFile(join(root, 'references', reference), 'utf8')).resolves.toContain('# ')
    }
  })

  it('lets the OpenCode host.skills reader open packaged research references and scripts', async () => {
    const skillsRoot = join(__dirname, '..', '..', '..', 'resources', 'skills')
    const registry = new SkillRegistry(skillsRoot)
    const catalog: HostSkillsCatalog = {
      list: () => registry.list(),
      withSkillRead: async (id, read) => {
        const skill = (await registry.list()).find((entry) => entry.id === id)
        return skill ? read(skill) : undefined
      },
      publishPersonalDirectory: async () => {
        throw new Error('not used')
      },
      deletePublished: async () => {
        throw new Error('not used')
      }
    }
    const service = new HostSkillsService({
      storageRoot: await mkdtemp(join(tmpdir(), 'research-host-skills-')),
      catalog
    })
    for (const [name, path] of [
      ['literature-deep-review', 'references/evidence-contract.md'],
      ['experimental-design-statistics', 'scripts/design.py'],
      ['evidence-synthesis-meta-analysis', 'references/extraction-contract.md'],
      ['research-proposal-writing', 'scripts/proposal.py']
    ]) {
      const result = await service.dispatch({ op: 'read', params: { name, path } })
      expect(result).toMatchObject({ name, path, origin: 'featured' })
      expect((result as { content: string }).content.length).toBeGreaterThan(100)
    }
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
