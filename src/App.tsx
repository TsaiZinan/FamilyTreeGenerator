import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type DragEvent,
} from 'react'
import { toPng } from 'html-to-image'

type RelationType = 'spouse' | 'parentChild'
type UiLanguage = 'zh-CN' | 'en'

type Person = {
  id: string
  name: string
  birthDate: string
  imageDataUrl?: string
  createdAt: number
  sortKey: number
}

type Relation = {
  id: string
  type: RelationType
  sourceId: string
  targetId: string
}

type FamilyProject = {
  version: 1
  title: string
  people: Person[]
  relations: Relation[]
  selectedPersonId: string | null
  updatedAt: string
}

type LayoutNode = {
  person: Person
  x: number
  y: number
}

type Segment = {
  id: string
  kind: 'spouse' | 'lineage'
  x1: number
  y1: number
  x2: number
  y2: number
}

type LayoutResult = {
  nodes: LayoutNode[]
  segments: Segment[]
  childAddAnchors: {
    id: string
    parentIds: string[]
    x: number
    y: number
  }[]
  width: number
  height: number
}

type FamilyGroup = {
  id: string
  members: Person[]
  depth: number
  width: number
  x: number
  centerX: number
  sortValue: number
  parentIds: string[]
}

type FamilyUnit = {
  id: string
  depth: number
  parentIds: string[]
  groups: FamilyGroup[]
  width: number
  subtreeWidth: number
  sortValue: number
}

type ImportableProject = Partial<FamilyProject> & {
  people?: unknown
  relations?: unknown
}

const STORAGE_KEY = 'family-tree-editor-project'
const UI_LANGUAGE_KEY = 'family-tree-editor-ui-language'
const CARD_WIDTH = 224
const CARD_HEIGHT = 196
const LEVEL_GAP = 176
const SPOUSE_GAP = 30
const GROUP_GAP = 90
const PADDING_X = 120
const PADDING_Y = 160

const createId = (prefix: string) =>
  `${prefix}-${Math.random().toString(36).slice(2, 10)}`

const MAX_UNDO_STEPS = 50

const getStoredLanguage = (): UiLanguage => {
  if (typeof window === 'undefined') {
    return 'zh-CN'
  }

  return window.localStorage.getItem(UI_LANGUAGE_KEY) === 'en' ? 'en' : 'zh-CN'
}

const getDefaultPersonName = (language: UiLanguage) =>
  language === 'en' ? 'Unnamed Person' : '未命名成员'

const getDefaultProjectTitle = (language: UiLanguage) =>
  language === 'en' ? 'Family Tree' : '家族族谱'

const getUiCopy = (language: UiLanguage) =>
  language === 'en'
    ? {
        locale: 'en-US',
        savedToLocal: 'Saved locally',
        autoSaved: (timestamp: string) => `Auto-saved ${timestamp}`,
        stageCaption: 'FAMILY TREE',
        titlePlaceholder: 'Enter a family tree title',
        defaultTreeTitle: getDefaultProjectTitle(language),
        undo: 'Undo',
        newProject: 'New',
        exportFile: 'Export File',
        importFile: 'Import File',
        saveImage: 'Save Image',
        clearCache: 'Clear Cache',
        noUndo: 'Nothing to undo',
        undoDone: 'Undid the last action',
        spouseAdded: 'Added a spouse',
        childAdded: 'Added a child',
        keepAtLeastOne: 'Keep at least one person card',
        confirmDelete: (name: string) => `Delete "${name}"?`,
        personDeleted: 'Deleted the person',
        fileExported: 'Exported the file',
        fileImported: (name: string) => `Imported ${name}`,
        importInvalid: 'Import failed: invalid file format',
        importReadError: 'Import failed: could not read the file',
        imageUpdated: 'Updated the portrait',
        imageReadError: 'Failed to read the image',
        imageExported: 'Exported the family tree image',
        imageExportFailed: 'Failed to export the image. Please try again.',
        confirmNew: 'Create a new family tree? The current content will be replaced.',
        newCreated: 'Created a new family tree',
        confirmClear:
          'Clear browser cache and reset the current family tree?',
        cacheCleared: 'Cleared the local cache',
        spouseOrderAdjusted: 'Adjusted spouse order',
        childOrderAdjusted: 'Adjusted child order',
        dragRestriction:
          'Only cards in the same spouse group or sibling family can be reordered',
        addMember: 'Add person',
        leftSpouse: 'Add spouse to left',
        rightSpouse: 'Add spouse to right',
        addChild: 'Add child',
        addChildWithSpouse: (name: string, index: number) =>
          `Add child with ${name.trim() || `Spouse ${index + 1}`}`,
        uploadImage: 'Upload portrait',
        personImageAlt: 'Person portrait',
        photoPlaceholder: 'Click to upload portrait',
        deletePerson: 'Delete person',
        namePlaceholder: 'Name',
        birthPlaceholder: 'Birth date',
        cardTip: 'Click portrait to upload an image, drag onto related cards to reorder',
        languageZh: '中文',
        languageEn: 'EN',
      }
    : {
        locale: 'zh-CN',
        savedToLocal: '已自动保存到本地',
        autoSaved: (timestamp: string) => `已自动保存 ${timestamp}`,
        stageCaption: '族谱画布',
        titlePlaceholder: '请输入族谱标题',
        defaultTreeTitle: getDefaultProjectTitle(language),
        undo: '撤回上一步',
        newProject: '新建',
        exportFile: '导出文件',
        importFile: '导入文件',
        saveImage: '保存图片',
        clearCache: '清空缓存',
        noUndo: '没有可撤回的操作',
        undoDone: '已撤回上一步',
        spouseAdded: '已新增配偶',
        childAdded: '已新增子辈',
        keepAtLeastOne: '至少保留一张人物卡片',
        confirmDelete: (name: string) => `确定删除“${name}”吗？`,
        personDeleted: '已删除人物',
        fileExported: '已导出文件',
        fileImported: (name: string) => `已导入 ${name}`,
        importInvalid: '导入失败：文件格式不符合要求',
        importReadError: '导入失败：无法读取文件',
        imageUpdated: '已更新人物图片',
        imageReadError: '图片读取失败',
        imageExported: '已导出族谱图片',
        imageExportFailed: '导出图片失败，请稍后重试',
        confirmNew: '确定新建族谱吗？当前内容会被替换。',
        newCreated: '已新建族谱',
        confirmClear: '确定清空浏览器本地缓存并重置当前族谱吗？',
        cacheCleared: '已清空本地缓存',
        spouseOrderAdjusted: '已调整伴侣顺序',
        childOrderAdjusted: '已调整子辈顺序',
        dragRestriction: '只能在同一组伴侣或同一家子辈中拖动排序',
        addMember: '添加成员',
        leftSpouse: '左侧伴侣',
        rightSpouse: '右侧伴侣',
        addChild: '添加子辈',
        addChildWithSpouse: (name: string, index: number) =>
          `与${name.trim() || `配偶${index + 1}`}添加子辈`,
        uploadImage: '上传人物图片',
        personImageAlt: '人物图片',
        photoPlaceholder: '点击上传头像',
        deletePerson: '删除人物',
        namePlaceholder: '姓名',
        birthPlaceholder: '生辰日期',
        cardTip: '点击头像上传图片，拖到同组卡片上可改顺序',
        languageZh: '中文',
        languageEn: 'EN',
      }

const comparePeople = (left: Person, right: Person) =>
  left.sortKey - right.sortKey || left.createdAt - right.createdAt

const snapshotProject = (project: FamilyProject): FamilyProject => ({
  ...project,
  people: project.people.map((person) => ({ ...person })),
  relations: project.relations.map((relation) => ({ ...relation })),
})

const createPerson = (
  name = getDefaultPersonName('zh-CN'),
  sortKey = Date.now() + Math.random() * 1000,
): Person => ({
  id: createId('person'),
  name,
  birthDate: '',
  createdAt: Date.now() + Math.floor(Math.random() * 1000),
  sortKey,
})

const unique = <T,>(items: T[]) => Array.from(new Set(items))

const createInitialProject = (language: UiLanguage = 'zh-CN'): FamilyProject => {
  const defaultName = getDefaultPersonName(language)
  const root = createPerson(defaultName, 100)
  const spouse = createPerson(defaultName, 200)
  const childA = createPerson(defaultName, 100)
  const childB = createPerson(defaultName, 200)

  return {
    version: 1,
    title: getDefaultProjectTitle(language),
    people: [root, spouse, childA, childB],
    relations: [
      {
        id: createId('relation'),
        type: 'spouse',
        sourceId: root.id,
        targetId: spouse.id,
      },
      {
        id: createId('relation'),
        type: 'parentChild',
        sourceId: root.id,
        targetId: childA.id,
      },
      {
        id: createId('relation'),
        type: 'parentChild',
        sourceId: spouse.id,
        targetId: childA.id,
      },
      {
        id: createId('relation'),
        type: 'parentChild',
        sourceId: root.id,
        targetId: childB.id,
      },
      {
        id: createId('relation'),
        type: 'parentChild',
        sourceId: spouse.id,
        targetId: childB.id,
      },
    ],
    selectedPersonId: root.id,
    updatedAt: new Date().toISOString(),
  }
}

const isPerson = (value: unknown): value is Person => {
  if (!value || typeof value !== 'object') {
    return false
  }

  const person = value as Record<string, unknown>
  return (
    typeof person.id === 'string' &&
    typeof person.name === 'string' &&
    typeof person.birthDate === 'string'
  )
}

const isRelation = (value: unknown): value is Relation => {
  if (!value || typeof value !== 'object') {
    return false
  }

  const relation = value as Record<string, unknown>
  return (
    typeof relation.id === 'string' &&
    (relation.type === 'spouse' || relation.type === 'parentChild') &&
    typeof relation.sourceId === 'string' &&
    typeof relation.targetId === 'string'
  )
}

const normalizeProject = (input: unknown): FamilyProject | null => {
  if (!input || typeof input !== 'object') {
    return null
  }

  const candidate = input as ImportableProject
  const people = Array.isArray(candidate.people)
    ? candidate.people.filter(isPerson).map((person, index) => ({
        ...person,
        createdAt:
          typeof person.createdAt === 'number' ? person.createdAt : Date.now() + index,
        sortKey:
          typeof person.sortKey === 'number'
            ? person.sortKey
            : typeof person.createdAt === 'number'
              ? person.createdAt
              : (index + 1) * 100,
      }))
    : []

  const peopleIds = new Set(people.map((person) => person.id))
  const relations = Array.isArray(candidate.relations)
    ? candidate.relations
        .filter(isRelation)
        .filter(
          (relation) =>
            peopleIds.has(relation.sourceId) && peopleIds.has(relation.targetId),
        )
    : []

  if (people.length === 0) {
    return null
  }

  const fallbackSelected = people.slice().sort(comparePeople)[0]?.id ?? people[0].id
  const selectedPersonId =
    typeof candidate.selectedPersonId === 'string' &&
    peopleIds.has(candidate.selectedPersonId)
      ? candidate.selectedPersonId
      : fallbackSelected

  return {
    version: 1,
    title:
      typeof candidate.title === 'string'
        ? candidate.title
        : getDefaultProjectTitle('zh-CN'),
    people,
    relations,
    selectedPersonId,
    updatedAt:
      typeof candidate.updatedAt === 'string'
        ? candidate.updatedAt
        : new Date().toISOString(),
  }
}

const downloadFile = (filename: string, content: string, mimeType: string) => {
  const blob = new Blob([content], { type: mimeType })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  URL.revokeObjectURL(url)
}

const readFileAsText = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result ?? ''))
    reader.onerror = () => reject(reader.error)
    reader.readAsText(file)
  })

const readFileAsDataUrl = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result ?? ''))
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(file)
  })

const buildRelationshipMaps = (project: FamilyProject) => {
  const parentsByChild = new Map<string, string[]>()
  const spousesByPerson = new Map<string, string[]>()

  for (const relation of project.relations) {
    if (relation.type === 'parentChild') {
      const parents = parentsByChild.get(relation.targetId) ?? []
      parents.push(relation.sourceId)
      parentsByChild.set(relation.targetId, unique(parents))
    }

    if (relation.type === 'spouse') {
      const sourceSpouses = spousesByPerson.get(relation.sourceId) ?? []
      sourceSpouses.push(relation.targetId)
      spousesByPerson.set(relation.sourceId, unique(sourceSpouses))

      const targetSpouses = spousesByPerson.get(relation.targetId) ?? []
      targetSpouses.push(relation.sourceId)
      spousesByPerson.set(relation.targetId, unique(targetSpouses))
    }
  }

  return { parentsByChild, spousesByPerson }
}

const getSpouseClusterIds = (
  personId: string,
  spousesByPerson: Map<string, string[]>,
) => {
  const queue = [personId]
  const visited = new Set<string>()

  while (queue.length > 0) {
    const current = queue.shift()
    if (!current || visited.has(current)) {
      continue
    }

    visited.add(current)
    for (const spouseId of spousesByPerson.get(current) ?? []) {
      if (!visited.has(spouseId)) {
        queue.push(spouseId)
      }
    }
  }

  return Array.from(visited)
}

const getParentIdsForChild = (
  childId: string,
  parentsByChild: Map<string, string[]>,
) => [...(parentsByChild.get(childId) ?? [])].sort()

const sameIds = (left: string[], right: string[]) =>
  left.length === right.length && left.every((item, index) => item === right[index])

const moveId = (ids: string[], draggedId: string, targetId: string) => {
  const next = [...ids]
  const draggedIndex = next.indexOf(draggedId)
  const targetIndex = next.indexOf(targetId)

  if (draggedIndex < 0 || targetIndex < 0 || draggedIndex === targetIndex) {
    return next
  }

  const [dragged] = next.splice(draggedIndex, 1)
  next.splice(targetIndex, 0, dragged)
  return next
}

const reorderPeopleSubset = (people: Person[], orderedIds: string[]) => {
  if (orderedIds.length === 0) {
    return people
  }

  const peopleById = new Map(people.map((person) => [person.id, person]))
  const subset = orderedIds
    .map((id) => peopleById.get(id))
    .filter((person): person is Person => Boolean(person))

  if (subset.length !== orderedIds.length) {
    return people
  }

  const base = Math.min(...subset.map((person) => person.sortKey))
  const sortKeyById = new Map(orderedIds.map((id, index) => [id, base + index * 100]))

  return people.map((person) =>
    sortKeyById.has(person.id)
      ? { ...person, sortKey: sortKeyById.get(person.id) ?? person.sortKey }
      : person,
  )
}

const ensureRelation = (
  relations: Relation[],
  relation: Omit<Relation, 'id'>,
): Relation[] => {
  const exists = relations.some((item) => {
    if (item.type !== relation.type) {
      return false
    }

    if (relation.type === 'spouse') {
      return (
        (item.sourceId === relation.sourceId && item.targetId === relation.targetId) ||
        (item.sourceId === relation.targetId && item.targetId === relation.sourceId)
      )
    }

    return item.sourceId === relation.sourceId && item.targetId === relation.targetId
  })

  if (exists) {
    return relations
  }

  return [...relations, { ...relation, id: createId('relation') }]
}

const buildLayout = (project: FamilyProject): LayoutResult => {
  if (project.people.length === 0) {
    return { nodes: [], segments: [], childAddAnchors: [], width: 1200, height: 900 }
  }

  const orderedPeople = [...project.people].sort(comparePeople)
  const { parentsByChild } = buildRelationshipMaps(project)

  const depthMemo = new Map<string, number>()
  const measureDepth = (personId: string, trail = new Set<string>()): number => {
    if (depthMemo.has(personId)) {
      return depthMemo.get(personId) ?? 0
    }

    if (trail.has(personId)) {
      return 0
    }

    trail.add(personId)
    const parents = parentsByChild.get(personId) ?? []
    const depth =
      parents.length === 0
        ? 0
        : Math.max(...parents.map((parentId) => measureDepth(parentId, new Set(trail)))) + 1

    depthMemo.set(personId, depth)
    return depth
  }

  for (const person of orderedPeople) {
    measureDepth(person.id)
  }

  for (let index = 0; index < orderedPeople.length; index += 1) {
    for (const relation of project.relations) {
      if (relation.type !== 'spouse') {
        continue
      }

      const sourceDepth = depthMemo.get(relation.sourceId) ?? 0
      const targetDepth = depthMemo.get(relation.targetId) ?? 0
      const syncedDepth = Math.max(sourceDepth, targetDepth)
      depthMemo.set(relation.sourceId, syncedDepth)
      depthMemo.set(relation.targetId, syncedDepth)
    }
  }

  const parent = new Map<string, string>()
  const find = (id: string): string => {
    const root = parent.get(id)
    if (!root || root === id) {
      return id
    }

    const resolved = find(root)
    parent.set(id, resolved)
    return resolved
  }

  const union = (left: string, right: string) => {
    const leftRoot = find(left)
    const rightRoot = find(right)
    if (leftRoot !== rightRoot) {
      parent.set(rightRoot, leftRoot)
    }
  }

  for (const person of orderedPeople) {
    parent.set(person.id, person.id)
  }

  for (const relation of project.relations) {
    if (relation.type === 'spouse') {
      union(relation.sourceId, relation.targetId)
    }
  }

  const groups = new Map<string, FamilyGroup>()
  const groupIdByPerson = new Map<string, string>()

  for (const person of orderedPeople) {
    const groupId = find(person.id)
    groupIdByPerson.set(person.id, groupId)
    const existing = groups.get(groupId)
    if (existing) {
      existing.members.push(person)
      existing.depth = Math.max(existing.depth, depthMemo.get(person.id) ?? 0)
      existing.sortValue = Math.min(existing.sortValue, person.sortKey)
    } else {
      groups.set(groupId, {
        id: groupId,
        members: [person],
        depth: depthMemo.get(person.id) ?? 0,
        width: CARD_WIDTH,
        x: 0,
        centerX: 0,
        sortValue: person.sortKey,
        parentIds: [],
      })
    }
  }

  for (const group of groups.values()) {
    group.members.sort(comparePeople)
    group.width =
      group.members.length * CARD_WIDTH + (group.members.length - 1) * SPOUSE_GAP

    const parentIds = unique(
      group.members.flatMap((member) => parentsByChild.get(member.id) ?? []),
    )
      .filter((parentId) => groupIdByPerson.get(parentId) !== group.id)
      .sort()

    group.parentIds = parentIds
  }

  const memberIdsByGroup = new Map(
    Array.from(groups.values()).map((group) => [
      group.id,
      new Set(group.members.map((member) => member.id)),
    ]),
  )

  const getPersonCenterX = (personId: string) => {
    const groupId = groupIdByPerson.get(personId)
    if (!groupId) {
      return null
    }

    const group = groups.get(groupId)
    if (!group) {
      return null
    }

    const personIndex = group.members.findIndex((member) => member.id === personId)
    if (personIndex === -1) {
      return null
    }

    return group.x + personIndex * (CARD_WIDTH + SPOUSE_GAP) + CARD_WIDTH / 2
  }

  const units = new Map<string, FamilyUnit>()
  const childUnitIdsByGroup = new Map<string, string[]>()

  for (const group of groups.values()) {
    childUnitIdsByGroup.set(group.id, [])

    if (group.parentIds.length === 0) {
      continue
    }

    const unitId = `unit:${group.depth}:${group.parentIds.join('|')}`
    const existing = units.get(unitId)
    if (existing) {
      existing.groups.push(group)
      existing.sortValue = Math.min(existing.sortValue, group.sortValue)
    } else {
      units.set(unitId, {
        id: unitId,
        depth: group.depth,
        parentIds: [...group.parentIds],
        groups: [group],
        width: 0,
        subtreeWidth: 0,
        sortValue: group.sortValue,
      })
    }
  }

  for (const unit of units.values()) {
    unit.groups.sort((left, right) => left.sortValue - right.sortValue)
    unit.width =
      unit.groups.reduce((sum, group) => sum + group.width, 0) +
      Math.max(0, unit.groups.length - 1) * GROUP_GAP

    const parentGroup = Array.from(groups.values()).find(
      (group) =>
        group.depth === unit.depth - 1 &&
        unit.parentIds.every((parentId) => memberIdsByGroup.get(group.id)?.has(parentId)),
    )

    if (parentGroup) {
      childUnitIdsByGroup.get(parentGroup.id)?.push(unit.id)
    }
  }

  const getUnitParentAnchorWithinGroup = (group: FamilyGroup, unit: FamilyUnit) => {
    const anchors = unit.parentIds
      .map((parentId) => {
        const memberIndex = group.members.findIndex((member) => member.id === parentId)
        if (memberIndex === -1) {
          return null
        }

        return memberIndex * (CARD_WIDTH + SPOUSE_GAP) + CARD_WIDTH / 2
      })
      .filter((anchor): anchor is number => anchor !== null)

    if (anchors.length === 0) {
      return unit.sortValue
    }

    return anchors.reduce((sum, anchor) => sum + anchor, 0) / anchors.length
  }

  for (const group of groups.values()) {
    const unitIds = childUnitIdsByGroup.get(group.id) ?? []
    unitIds.sort((leftId, rightId) => {
      const leftUnit = units.get(leftId)
      const rightUnit = units.get(rightId)
      if (!leftUnit || !rightUnit) {
        return 0
      }

      const leftAnchor = getUnitParentAnchorWithinGroup(group, leftUnit)
      const rightAnchor = getUnitParentAnchorWithinGroup(group, rightUnit)
      if (leftAnchor !== rightAnchor) {
        return leftAnchor - rightAnchor
      }

      return leftUnit.sortValue - rightUnit.sortValue
    })
  }

  const groupSubtreeWidthMemo = new Map<string, number>()
  const unitSubtreeWidthMemo = new Map<string, number>()

  const measureGroupSubtreeWidth = (groupId: string): number => {
    if (groupSubtreeWidthMemo.has(groupId)) {
      return groupSubtreeWidthMemo.get(groupId) ?? CARD_WIDTH
    }

    const group = groups.get(groupId)
    if (!group) {
      return CARD_WIDTH
    }

    const childUnitIds = childUnitIdsByGroup.get(group.id) ?? []
    const childUnitsWidth =
      childUnitIds.reduce((sum, unitId) => sum + measureUnitSubtreeWidth(unitId), 0) +
      Math.max(0, childUnitIds.length - 1) * GROUP_GAP
    const subtreeWidth = Math.max(group.width, childUnitsWidth)

    groupSubtreeWidthMemo.set(groupId, subtreeWidth)
    return subtreeWidth
  }

  const measureUnitSubtreeWidth = (unitId: string): number => {
    if (unitSubtreeWidthMemo.has(unitId)) {
      return unitSubtreeWidthMemo.get(unitId) ?? CARD_WIDTH
    }

    const unit = units.get(unitId)
    if (!unit) {
      return CARD_WIDTH
    }

    const childrenWidth =
      unit.groups.reduce((sum, group) => sum + measureGroupSubtreeWidth(group.id), 0) +
      Math.max(0, unit.groups.length - 1) * GROUP_GAP
    const subtreeWidth = Math.max(unit.width, childrenWidth)

    unit.subtreeWidth = subtreeWidth
    unitSubtreeWidthMemo.set(unitId, subtreeWidth)
    return subtreeWidth
  }

  const getChildAnchorXsForGroup = (group: FamilyGroup) => {
    const unitIds = childUnitIdsByGroup.get(group.id) ?? []

    return unitIds
      .flatMap((unitId) => {
        const unit = units.get(unitId)
        if (!unit) {
          return []
        }

        return unit.groups.flatMap((childGroup) =>
          childGroup.members
            .filter((member) =>
              sameIds(getParentIdsForChild(member.id, parentsByChild), unit.parentIds),
            )
            .map((member) => getPersonCenterX(member.id))
            .filter((centerX): centerX is number => centerX !== null),
        )
      })
      .sort((left, right) => left - right)
  }

  const placeGroupSubtree = (groupId: string, boxLeft: number): number => {
    const group = groups.get(groupId)
    if (!group) {
      return boxLeft
    }

    const subtreeWidth = measureGroupSubtreeWidth(groupId)
    const childUnitIds = childUnitIdsByGroup.get(group.id) ?? []

    if (childUnitIds.length > 0) {
      const childUnitsWidth =
        childUnitIds.reduce((sum, unitId) => sum + measureUnitSubtreeWidth(unitId), 0) +
        Math.max(0, childUnitIds.length - 1) * GROUP_GAP
      let childCursorX = boxLeft + (subtreeWidth - childUnitsWidth) / 2

      for (const unitId of childUnitIds) {
        placeUnitSubtree(unitId, childCursorX)
        childCursorX += measureUnitSubtreeWidth(unitId) + GROUP_GAP
      }
    }

    const childAnchorXs = getChildAnchorXsForGroup(group)
    const desiredCenter =
      childAnchorXs.length === 0
        ? boxLeft + subtreeWidth / 2
        : (childAnchorXs[0] + childAnchorXs[childAnchorXs.length - 1]) / 2

    group.x = desiredCenter - group.width / 2
    group.centerX = group.x + group.width / 2
    return group.x
  }

  const placeUnitSubtree = (unitId: string, boxLeft: number) => {
    const unit = units.get(unitId)
    if (!unit) {
      return
    }

    const subtreeWidth = measureUnitSubtreeWidth(unitId)
    const groupsWidth =
      unit.groups.reduce((sum, group) => sum + measureGroupSubtreeWidth(group.id), 0) +
      Math.max(0, unit.groups.length - 1) * GROUP_GAP
    let groupCursorX = boxLeft + (subtreeWidth - groupsWidth) / 2

    for (const group of unit.groups) {
      placeGroupSubtree(group.id, groupCursorX)
      groupCursorX += measureGroupSubtreeWidth(group.id) + GROUP_GAP
    }
  }

  const rootGroups = [...groups.values()]
    .filter((group) => group.parentIds.length === 0)
    .sort((left, right) => left.sortValue - right.sortValue)

  let rootCursorX = PADDING_X
  for (const rootGroup of rootGroups) {
    placeGroupSubtree(rootGroup.id, rootCursorX)
    rootCursorX += measureGroupSubtreeWidth(rootGroup.id) + GROUP_GAP
  }

  const minGroupX = Math.min(...Array.from(groups.values()).map((group) => group.x))
  if (minGroupX < PADDING_X) {
    const shiftX = PADDING_X - minGroupX
    for (const group of groups.values()) {
      group.x += shiftX
      group.centerX += shiftX
    }
  }

  const nodes: LayoutNode[] = []
  const positions = new Map<string, LayoutNode>()

  for (const group of groups.values()) {
    const y = PADDING_Y + group.depth * (CARD_HEIGHT + LEVEL_GAP)
    group.members.forEach((member, index) => {
      const x = group.x + index * (CARD_WIDTH + SPOUSE_GAP)
      const node = { person: member, x, y }
      nodes.push(node)
      positions.set(member.id, node)
    })
  }

  const segments: Segment[] = []
  const childAddAnchors: LayoutResult['childAddAnchors'] = []

  for (const relation of project.relations) {
    if (relation.type !== 'spouse') {
      continue
    }

    const source = positions.get(relation.sourceId)
    const target = positions.get(relation.targetId)
    if (!source || !target) {
      continue
    }

    const left = source.x < target.x ? source : target
    const right = source.x < target.x ? target : source
    const y = left.y + 96

    segments.push({
      id: relation.id,
      kind: 'spouse',
      x1: left.x + CARD_WIDTH,
      y1: y,
      x2: right.x,
      y2: y,
    })
    childAddAnchors.push({
      id: `child-anchor-${relation.id}`,
      parentIds: [relation.sourceId, relation.targetId],
      x: (left.x + CARD_WIDTH + right.x) / 2,
      y,
    })
  }

  for (const person of orderedPeople) {
    const childNode = positions.get(person.id)
    const parentIds = unique(parentsByChild.get(person.id) ?? [])
    if (!childNode || parentIds.length === 0) {
      continue
    }

    const parentNodes = parentIds
      .map((parentId) => positions.get(parentId))
      .filter((node): node is LayoutNode => Boolean(node))
      .sort((left, right) => left.x - right.x)

    if (parentNodes.length === 0) {
      continue
    }

    const childCenterX = childNode.x + CARD_WIDTH / 2
    const childTopY = childNode.y

    if (parentNodes.length === 1) {
      const parentNode = parentNodes[0]
      const parentCenterX = parentNode.x + CARD_WIDTH / 2
      const parentBottomY = parentNode.y + CARD_HEIGHT
      const bridgeY = parentBottomY + Math.max(26, (childTopY - parentBottomY) / 2)

      segments.push({
        id: `${person.id}-p-top`,
        kind: 'lineage',
        x1: parentCenterX,
        y1: parentBottomY,
        x2: parentCenterX,
        y2: bridgeY,
      })
      segments.push({
        id: `${person.id}-p-mid`,
        kind: 'lineage',
        x1: parentCenterX,
        y1: bridgeY,
        x2: childCenterX,
        y2: bridgeY,
      })
      segments.push({
        id: `${person.id}-p-bottom`,
        kind: 'lineage',
        x1: childCenterX,
        y1: bridgeY,
        x2: childCenterX,
        y2: childTopY,
      })
      continue
    }

    const parentBottomY = Math.max(...parentNodes.map((node) => node.y + CARD_HEIGHT))
    const bridgeY = parentBottomY + 30
    const minParentX = parentNodes[0].x + CARD_WIDTH / 2
    const maxParentX = parentNodes[parentNodes.length - 1].x + CARD_WIDTH / 2
    const familyCenterX = (minParentX + maxParentX) / 2
    const childBridgeY = childTopY - 28

    for (const parentNode of parentNodes) {
      const parentCenterX = parentNode.x + CARD_WIDTH / 2
      segments.push({
        id: `${person.id}-${parentNode.person.id}-branch`,
        kind: 'lineage',
        x1: parentCenterX,
        y1: parentNode.y + CARD_HEIGHT,
        x2: parentCenterX,
        y2: bridgeY,
      })
    }

    segments.push({
      id: `${person.id}-parents-line`,
      kind: 'lineage',
      x1: minParentX,
      y1: bridgeY,
      x2: maxParentX,
      y2: bridgeY,
    })
    segments.push({
      id: `${person.id}-trunk-top`,
      kind: 'lineage',
      x1: familyCenterX,
      y1: bridgeY,
      x2: familyCenterX,
      y2: childBridgeY,
    })
    segments.push({
      id: `${person.id}-trunk-mid`,
      kind: 'lineage',
      x1: familyCenterX,
      y1: childBridgeY,
      x2: childCenterX,
      y2: childBridgeY,
    })
    segments.push({
      id: `${person.id}-trunk-bottom`,
      kind: 'lineage',
      x1: childCenterX,
      y1: childBridgeY,
      x2: childCenterX,
      y2: childTopY,
    })
  }

  const width = Math.max(...nodes.map((node) => node.x + CARD_WIDTH), 1200) + PADDING_X
  const height =
    Math.max(...nodes.map((node) => node.y + CARD_HEIGHT), 760) + PADDING_Y

  return { nodes, segments, childAddAnchors, width, height }
}

function App() {
  const [uiLanguage, setUiLanguage] = useState<UiLanguage>(() => getStoredLanguage())
  const copy = useMemo(() => getUiCopy(uiLanguage), [uiLanguage])
  const [project, setProject] = useState<FamilyProject>(() => {
    const cached = localStorage.getItem(STORAGE_KEY)
    if (!cached) {
      return createInitialProject(getStoredLanguage())
    }

    try {
      return normalizeProject(JSON.parse(cached)) ?? createInitialProject(getStoredLanguage())
    } catch {
      return createInitialProject(getStoredLanguage())
    }
  })
  const [message, setMessage] = useState(() => getUiCopy(getStoredLanguage()).savedToLocal)
  const [pendingImagePersonId, setPendingImagePersonId] = useState<string | null>(
    null,
  )
  const [openAddMenuPersonId, setOpenAddMenuPersonId] = useState<string | null>(null)
  const [isExportingImage, setIsExportingImage] = useState(false)
  const [draggedPersonId, setDraggedPersonId] = useState<string | null>(null)
  const [dropTargetPersonId, setDropTargetPersonId] = useState<string | null>(null)
  const [canUndo, setCanUndo] = useState(false)
  const viewportRef = useRef<HTMLDivElement | null>(null)
  const treeRef = useRef<HTMLDivElement | null>(null)
  const jsonInputRef = useRef<HTMLInputElement | null>(null)
  const imageInputRef = useRef<HTMLInputElement | null>(null)
  const shouldAutoCenterRef = useRef(true)
  const projectRef = useRef(project)
  const undoStackRef = useRef<FamilyProject[]>([])

  useEffect(() => {
    localStorage.setItem(UI_LANGUAGE_KEY, uiLanguage)
  }, [uiLanguage])

  useEffect(() => {
    projectRef.current = project
  }, [project])

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(project))
    setMessage(copy.autoSaved(new Date().toLocaleString(copy.locale)))
  }, [project, copy])

  const layout = useMemo(() => buildLayout(project), [project])
  const personMap = useMemo(
    () => new Map(project.people.map((person) => [person.id, person])),
    [project.people],
  )
  const { parentsByChild, spousesByPerson } = useMemo(
    () => buildRelationshipMaps(project),
    [project],
  )

  useEffect(() => {
    if (!shouldAutoCenterRef.current || !viewportRef.current) {
      return
    }

    const frameId = window.requestAnimationFrame(() => {
      const viewport = viewportRef.current
      if (!viewport) {
        return
      }

      viewport.scrollTo({
        left: Math.max((viewport.scrollWidth - viewport.clientWidth) / 2, 0),
        top: Math.max((viewport.scrollHeight - viewport.clientHeight) / 2, 0),
      })
      shouldAutoCenterRef.current = false
    })

    return () => window.cancelAnimationFrame(frameId)
  }, [layout.width, layout.height, project.updatedAt])

  const pushUndoSnapshot = (current: FamilyProject) => {
    undoStackRef.current = [
      ...undoStackRef.current.slice(-(MAX_UNDO_STEPS - 1)),
      snapshotProject(current),
    ]
    setCanUndo(undoStackRef.current.length > 0)
  }

  const commitProject = (
    nextProject: FamilyProject,
    options?: {
      autoCenter?: boolean
      recordHistory?: boolean
    },
  ) => {
    if (options?.recordHistory !== false) {
      pushUndoSnapshot(projectRef.current)
    }

    if (options?.autoCenter) {
      shouldAutoCenterRef.current = true
    }

    setProject({
      ...snapshotProject(nextProject),
      updatedAt: new Date().toISOString(),
    })
  }

  const updateProject = (updater: (current: FamilyProject) => FamilyProject) => {
    commitProject(updater(projectRef.current))
  }

  const handleUndo = () => {
    const previous = undoStackRef.current[undoStackRef.current.length - 1]
    if (!previous) {
      setMessage(copy.noUndo)
      return
    }

    undoStackRef.current = undoStackRef.current.slice(0, -1)
    setCanUndo(undoStackRef.current.length > 0)
    setOpenAddMenuPersonId(null)
    setDraggedPersonId(null)
    setDropTargetPersonId(null)
    setPendingImagePersonId(null)
    setProject({
      ...snapshotProject(previous),
      updatedAt: new Date().toISOString(),
    })
    setMessage(copy.undoDone)
  }

  const updatePerson = (personId: string, patch: Partial<Person>) => {
    updateProject((current) => ({
      ...current,
      people: current.people.map((person) =>
        person.id === personId ? { ...person, ...patch } : person,
      ),
      selectedPersonId: personId,
    }))
  }

  const getSortedSpouseCluster = (personId: string) =>
    getSpouseClusterIds(personId, spousesByPerson)
      .map((id) => personMap.get(id))
      .filter((person): person is Person => Boolean(person))
      .sort(comparePeople)

  const getChildFamilyIds = (parentIds: string[]) => {
    const sortedParentIds = [...parentIds].sort()
    return project.people
      .filter((person) =>
        sameIds(getParentIdsForChild(person.id, parentsByChild), sortedParentIds),
      )
      .sort(comparePeople)
      .map((person) => person.id)
  }

  const getSiblingUnitIds = (parentIds: string[]) =>
    getChildFamilyIds(parentIds).map((childId) => ({
      anchorId: childId,
      memberIds: getSortedSpouseCluster(childId).map((person) => person.id),
    }))

  const addSpouse = (personId: string, side: 'left' | 'right') => {
    const anchor = personMap.get(personId)
    if (!anchor) {
      return
    }

    const cluster = getSortedSpouseCluster(personId)
    const anchorIndex = cluster.findIndex((person) => person.id === personId)
    const insertIndex = side === 'left' ? anchorIndex : anchorIndex + 1
    const before = cluster[insertIndex - 1]?.sortKey
    const after = cluster[insertIndex]?.sortKey
    const sortKey =
      before === undefined && after === undefined
        ? 100
        : before === undefined
          ? after - 100
          : after === undefined
            ? before + 100
            : (before + after) / 2

    const spouse = createPerson(getDefaultPersonName(uiLanguage), sortKey)
    updateProject((current) => ({
      ...current,
      people: [...current.people, spouse],
      relations: ensureRelation(current.relations, {
        type: 'spouse',
        sourceId: personId,
        targetId: spouse.id,
      }),
      selectedPersonId: spouse.id,
    }))
    setMessage(copy.spouseAdded)
  }

  const addChild = (parentIds: string[]) => {
    const familyParentIds = unique(parentIds.filter((parentId) => personMap.has(parentId))).sort()
    if (familyParentIds.length === 0) {
      return
    }

    const familyParents = familyParentIds
      .map((id) => personMap.get(id))
      .filter((person): person is Person => Boolean(person))
      .sort(comparePeople)
    const siblingIds = getChildFamilyIds(familyParentIds)
    const siblingPeople = siblingIds
      .map((id) => personMap.get(id))
      .filter((person): person is Person => Boolean(person))
      .sort(comparePeople)
    const lastSibling = siblingPeople[siblingPeople.length - 1]

    const child = createPerson(
      getDefaultPersonName(uiLanguage),
      lastSibling ? lastSibling.sortKey + 100 : familyParents[0]?.sortKey ?? Date.now(),
    )

    updateProject((current) => {
      let relations = current.relations
      for (const parentId of familyParentIds) {
        relations = ensureRelation(relations, {
          type: 'parentChild',
          sourceId: parentId,
          targetId: child.id,
        })
      }

      return {
        ...current,
        people: [...current.people, child],
        relations,
        selectedPersonId: child.id,
      }
    })
    setMessage(copy.childAdded)
  }

  const deletePerson = (personId: string) => {
    const person = personMap.get(personId)
    if (!person) {
      return
    }

    if (project.people.length <= 1) {
      setMessage(copy.keepAtLeastOne)
      return
    }

    if (!window.confirm(copy.confirmDelete(person.name || getDefaultPersonName(uiLanguage)))) {
      return
    }

    updateProject((current) => {
      const people = current.people.filter((item) => item.id !== personId)
      const relations = current.relations.filter(
        (relation) => relation.sourceId !== personId && relation.targetId !== personId,
      )
      const fallbackSelected =
        current.selectedPersonId === personId ? people[0]?.id ?? null : current.selectedPersonId

      return {
        ...current,
        people,
        relations,
        selectedPersonId: fallbackSelected,
      }
    })
    setMessage(copy.personDeleted)
  }

  const handleExportJson = () => {
    downloadFile(
      `${project.title || copy.defaultTreeTitle}.json`,
      JSON.stringify(project, null, 2),
      'application/json',
    )
    setMessage(copy.fileExported)
  }

  const handleImportJson = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) {
      return
    }

    try {
      const text = await readFileAsText(file)
      const parsed = normalizeProject(JSON.parse(text))
      if (!parsed) {
        setMessage(copy.importInvalid)
        return
      }

      commitProject(parsed, { autoCenter: true })
      setMessage(copy.fileImported(file.name))
    } catch {
      setMessage(copy.importReadError)
    } finally {
      event.target.value = ''
    }
  }

  const handleImageChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file || !pendingImagePersonId) {
      return
    }

    try {
      const dataUrl = await readFileAsDataUrl(file)
      updatePerson(pendingImagePersonId, { imageDataUrl: dataUrl })
      setMessage(copy.imageUpdated)
    } catch {
      setMessage(copy.imageReadError)
    } finally {
      event.target.value = ''
      setPendingImagePersonId(null)
    }
  }

  const handleExportImage = async () => {
    if (!treeRef.current) {
      return
    }

    try {
      setIsExportingImage(true)
      await new Promise<void>((resolve) => {
        window.requestAnimationFrame(() => resolve())
      })
      const dataUrl = await toPng(treeRef.current, {
        cacheBust: true,
        backgroundColor: '#fff',
        pixelRatio: 2,
      })
      const link = document.createElement('a')
      link.href = dataUrl
      link.download = `${project.title || copy.defaultTreeTitle}.png`
      link.click()
      setMessage(copy.imageExported)
    } catch {
      setMessage(copy.imageExportFailed)
    } finally {
      setIsExportingImage(false)
    }
  }

  const handleNewProject = () => {
    if (!window.confirm(copy.confirmNew)) {
      return
    }

    commitProject(createInitialProject(uiLanguage), { autoCenter: true })
    setMessage(copy.newCreated)
  }

  const handleClearLocalCache = () => {
    if (!window.confirm(copy.confirmClear)) {
      return
    }

    localStorage.removeItem(STORAGE_KEY)
    commitProject(createInitialProject(uiLanguage), { autoCenter: true })
    setMessage(copy.cacheCleared)
  }

  const startDrag = (event: DragEvent<HTMLDivElement>, personId: string) => {
    event.dataTransfer.effectAllowed = 'move'
    event.dataTransfer.setData('text/plain', personId)
    setDraggedPersonId(personId)
  }

  const handleDrop = (targetId: string) => {
    if (!draggedPersonId || draggedPersonId === targetId) {
      setDropTargetPersonId(null)
      return
    }

    const draggedSpouseIds = getSortedSpouseCluster(draggedPersonId).map(
      (person) => person.id,
    )
    const targetSpouseIds = getSortedSpouseCluster(targetId).map(
      (person) => person.id,
    )
    const draggedParents = getParentIdsForChild(draggedPersonId, parentsByChild)
    const targetParents = getParentIdsForChild(targetId, parentsByChild)

    if (
      draggedSpouseIds.length > 1 &&
      sameIds([...draggedSpouseIds].sort(), [...targetSpouseIds].sort())
    ) {
      const orderedIds = moveId(draggedSpouseIds, draggedPersonId, targetId)
      updateProject((current) => ({
        ...current,
        people: reorderPeopleSubset(current.people, orderedIds),
      }))
      setMessage(copy.spouseOrderAdjusted)
    } else if (draggedParents.length > 0 && sameIds(draggedParents, targetParents)) {
      const siblingUnits = getSiblingUnitIds(draggedParents)
      const siblingIds = siblingUnits.map((unit) => unit.anchorId)
      const orderedSiblingIds = moveId(siblingIds, draggedPersonId, targetId)
      const orderedIds = orderedSiblingIds.flatMap((siblingId) => {
        return siblingUnits.find((unit) => unit.anchorId === siblingId)?.memberIds ?? []
      })
      updateProject((current) => ({
        ...current,
        people: reorderPeopleSubset(current.people, orderedIds),
      }))
      setMessage(copy.childOrderAdjusted)
    } else {
      setMessage(copy.dragRestriction)
    }

    setDraggedPersonId(null)
    setDropTargetPersonId(null)
  }

  const getChildAddOptions = (personId: string) => {
    const spouses = [...(spousesByPerson.get(personId) ?? [])]
      .map((id) => personMap.get(id))
      .filter((person): person is Person => Boolean(person))
      .sort(comparePeople)

    if (spouses.length === 0) {
      return [
        {
          key: `child-solo-${personId}`,
          label: copy.addChild,
          parentIds: [personId],
        },
      ]
    }

    if (spouses.length === 1) {
      return [
        {
          key: `child-family-${personId}-${spouses[0].id}`,
          label: copy.addChild,
          parentIds: [personId, spouses[0].id],
        },
      ]
    }

    return spouses.map((spouse, index) => ({
      key: `child-family-${personId}-${spouse.id}`,
      label: copy.addChildWithSpouse(spouse.name, index),
      parentIds: [personId, spouse.id],
    }))
  }

  return (
    <div className="canvas-shell" onClick={() => setOpenAddMenuPersonId(null)}>
      <input
        ref={jsonInputRef}
        className="hidden-input"
        type="file"
        accept="application/json"
        onChange={handleImportJson}
      />
      <input
        ref={imageInputRef}
        className="hidden-input"
        type="file"
        accept="image/*"
        onChange={handleImageChange}
      />

      <div className="floating-toolbar">
        <div className="title-stack">
          <span className="title-caption">{copy.stageCaption}</span>
          <input
            className="title-input"
            value={project.title}
            onChange={(event) =>
              updateProject((current) => ({
                ...current,
                title: event.target.value,
              }))
            }
            placeholder={copy.titlePlaceholder}
          />
        </div>
        <div className="toolbar-actions">
          <div className="language-toggle">
            <button
              type="button"
              className={`language-option ${uiLanguage === 'zh-CN' ? 'is-active' : ''}`}
              onClick={() => setUiLanguage('zh-CN')}
            >
              {copy.languageZh}
            </button>
            <button
              type="button"
              className={`language-option ${uiLanguage === 'en' ? 'is-active' : ''}`}
              onClick={() => setUiLanguage('en')}
            >
              {copy.languageEn}
            </button>
          </div>
          <button type="button" onClick={handleUndo} disabled={!canUndo}>
            {copy.undo}
          </button>
          <button type="button" onClick={handleNewProject}>
            {copy.newProject}
          </button>
          <button type="button" onClick={handleExportJson}>
            {copy.exportFile}
          </button>
          <button type="button" onClick={() => jsonInputRef.current?.click()}>
            {copy.importFile}
          </button>
          <button type="button" onClick={handleExportImage}>
            {copy.saveImage}
          </button>
          <button type="button" className="ghost-button" onClick={handleClearLocalCache}>
            {copy.clearCache}
          </button>
        </div>
      </div>

      <div className="status-chip">{message}</div>

      <div ref={viewportRef} className="canvas-viewport">
        <div className="tree-stage-shell">
          <div
            ref={treeRef}
            className={`tree-stage ${isExportingImage ? 'exporting-stage' : ''}`}
            style={{ width: layout.width, height: layout.height }}
          >
          <div className="stage-title">
            <span className="stage-title-line" />
            <h1>{project.title || copy.defaultTreeTitle}</h1>
            <span className="stage-title-line" />
          </div>

          <svg
            className="connectors"
            xmlns="http://www.w3.org/2000/svg"
            width={layout.width}
            height={layout.height}
            viewBox={`0 0 ${layout.width} ${layout.height}`}
          >
            {layout.segments.map((segment) => (
              <line
                key={segment.id}
                className={`connector connector-${segment.kind}`}
                x1={segment.x1}
                y1={segment.y1}
                x2={segment.x2}
                y2={segment.y2}
                stroke="#111"
                strokeWidth={2.5}
                strokeDasharray={segment.kind === 'spouse' ? '9 7' : undefined}
                strokeLinecap="round"
                fill="none"
              />
            ))}
          </svg>

          {layout.nodes.map((node) => {
            const isDropTarget = dropTargetPersonId === node.person.id
            const isAddMenuOpen = openAddMenuPersonId === node.person.id
            const childAddOptions = getChildAddOptions(node.person.id)

            return (
              <div
                key={node.person.id}
                className={`person-card ${draggedPersonId === node.person.id ? 'dragging' : ''} ${isDropTarget ? 'drop-target' : ''}`}
                style={{ left: node.x, top: node.y }}
                draggable
                onDragStart={(event) => startDrag(event, node.person.id)}
                onDragEnd={() => {
                  setDraggedPersonId(null)
                  setDropTargetPersonId(null)
                }}
                onDragOver={(event) => {
                  event.preventDefault()
                  if (draggedPersonId && draggedPersonId !== node.person.id) {
                    setDropTargetPersonId(node.person.id)
                  }
                }}
                onDragLeave={() => {
                  if (dropTargetPersonId === node.person.id) {
                    setDropTargetPersonId(null)
                  }
                }}
                onDrop={(event) => {
                  event.preventDefault()
                  handleDrop(node.person.id)
                }}
              >
                <div className="card-topbar">
                  <div
                    className="add-menu-wrap no-export"
                    onClick={(event) => event.stopPropagation()}
                  >
                    <button
                      type="button"
                      className="add-menu-trigger"
                      title={copy.addMember}
                      onClick={() =>
                        setOpenAddMenuPersonId((current) =>
                          current === node.person.id ? null : node.person.id,
                        )
                      }
                    >
                      +
                    </button>
                    {isAddMenuOpen ? (
                      <div className="add-menu-panel">
                        <button
                          type="button"
                          className="add-menu-item"
                          onClick={() => {
                            addSpouse(node.person.id, 'left')
                            setOpenAddMenuPersonId(null)
                          }}
                        >
                          {copy.leftSpouse}
                        </button>
                        <button
                          type="button"
                          className="add-menu-item"
                          onClick={() => {
                            addSpouse(node.person.id, 'right')
                            setOpenAddMenuPersonId(null)
                          }}
                        >
                          {copy.rightSpouse}
                        </button>
                        {childAddOptions.map((option) => (
                          <button
                            key={option.key}
                            type="button"
                            className="add-menu-item"
                            onClick={() => {
                              addChild(option.parentIds)
                              setOpenAddMenuPersonId(null)
                            }}
                          >
                            {option.label}
                          </button>
                        ))}
                      </div>
                    ) : null}
                  </div>
                  <button
                    type="button"
                    className="photo-button"
                    title={copy.uploadImage}
                    onClick={() => {
                      setPendingImagePersonId(node.person.id)
                      imageInputRef.current?.click()
                    }}
                  >
                    {node.person.imageDataUrl ? (
                      <img
                        src={node.person.imageDataUrl}
                        alt={node.person.name || copy.personImageAlt}
                      />
                    ) : (
                      <span className="photo-placeholder">{copy.photoPlaceholder}</span>
                    )}
                  </button>
                  <button
                    type="button"
                    className="delete-button no-export"
                    title={copy.deletePerson}
                    onClick={() => deletePerson(node.person.id)}
                  >
                    ×
                  </button>
                </div>

                <input
                  className="card-name"
                  value={node.person.name}
                  onChange={(event) => updatePerson(node.person.id, { name: event.target.value })}
                  placeholder={copy.namePlaceholder}
                />
                <input
                  className="card-birth"
                  value={node.person.birthDate}
                  onChange={(event) =>
                    updatePerson(node.person.id, { birthDate: event.target.value })
                  }
                  placeholder={copy.birthPlaceholder}
                />
                <div className="card-tip no-export">{copy.cardTip}</div>
              </div>
            )
          })}
          </div>
        </div>
      </div>
    </div>
  )
}

export default App
