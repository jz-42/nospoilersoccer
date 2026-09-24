import type { Group, Tournament } from '../data/types'

export function sectionGroups(t: Tournament, sectionId: string): Group[] {
  const section = t.groupSections?.find((candidate) => candidate.id === sectionId)
  if (!section) return []
  const ids = new Set(section.groupIds)
  return t.groups.filter((group) => ids.has(group.id))
}

export function groupDisplayName(group: Group): string {
  return group.label ?? `Group ${group.id}`
}
