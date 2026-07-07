export const Platform = {
  isIosApp: false,
  isMacOS: false,
}

export class Notice {
  constructor(
    public message: string | DocumentFragment,
    public timeout?: number
  ) {}
}

export function getAllTags(metadata: {
  tags?: { tag: string }[]
  frontmatter?: Record<string, unknown>
}): string[] {
  return metadata.tags?.map(t => t.tag) ?? []
}

export function parseFrontMatterAliases(
  frontmatter: Record<string, unknown>
): string[] | undefined {
  const aliases = frontmatter.aliases
  if (Array.isArray(aliases)) {
    return aliases
  }
  if (typeof aliases === 'string') {
    return aliases
      .split(',')
      .map(alias => alias.trim())
      .filter(Boolean)
  }
  return undefined
}
