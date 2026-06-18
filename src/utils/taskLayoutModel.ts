export type LayoutDirection = 'left' | 'right'
export type LayoutVisitStrategy = 'nearest' | 'row'

export type LayoutRange = {
  rowStart: number
  rowEnd: number
  colStart: number
  colEnd: number
}

export type LayoutRangeInput = {
  rowStart: string | number
  rowEnd: string | number
  colStart: string | number
  colEnd: string | number
}

export type LayoutConnector =
  | {
    type: 'col'
    rowStart: number
    rowEnd: number
    afterCol: number
    length: number
  }
  | {
    type: 'row'
    colStart: number
    colEnd: number
    afterRow: number
    length: number
  }

export type LayoutConnectorInput = {
  type: 'col' | 'row' | string
  rowStart?: string | number
  rowEnd?: string | number
  afterCol?: string | number
  colStart?: string | number
  colEnd?: string | number
  afterRow?: string | number
  length?: string | number
}

export type LayoutV2 = {
  returnToOrigin?: boolean
  visitStrategy?: LayoutVisitStrategy
  areas: LayoutRange[]
  holes: LayoutRange[]
  extras: LayoutRange[]
  connectors: LayoutConnector[]
}

export type LayoutV2Form = {
  taskName: string
  areaNumber: string
  direction: LayoutDirection
  areasText?: string
  holesText?: string
  extrasText?: string
  connectorsText?: string
  areas?: LayoutRangeInput[]
  holes?: LayoutRangeInput[]
  extras?: LayoutRangeInput[]
  connectors?: LayoutConnectorInput[]
}

export type LayoutPreviewOptions = {
  panelWidth: number
  panelHeight: number
  gapX: number
  gapY: number
  panelAngle?: number
  panelAngleX?: number
  direction: LayoutDirection
  returnToOrigin?: boolean
  visitStrategy?: LayoutVisitStrategy
}

export type LayoutPreviewPanel = {
  row: number
  col: number
  x: number
  y: number
  width: number
  height: number
}

export type LayoutPreviewPoint = {
  x: number
  y: number
}

export type LayoutPreview = {
  panels: LayoutPreviewPanel[]
  path: LayoutPreviewPoint[]
}

export type PointTaskModelInput = {
  x: string | number
  y: string | number
  lat?: string | number
  lon?: string | number
}

export type PointTaskModelPoint = {
  x: number
  y: number
  lat?: number
  lon?: number
}

export type PointTaskModel = {
  pointCount: number
  outline: PointTaskModelPoint[]
  closedOutline: PointTaskModelPoint[]
  bounds: {
    minX: number
    maxX: number
    minY: number
    maxY: number
    width: number
    height: number
  }
  centroid: PointTaskModelPoint
  area: number
  perimeter: number
}

export type LayoutRenderOptions = {
  paddingPct?: number
}

export type LayoutRenderPanel = LayoutPreviewPanel & {
  leftPct: number
  topPct: number
  widthPct: number
  heightPct: number
}

export type LayoutRenderSegment = {
  x1Pct: number
  y1Pct: number
  x2Pct: number
  y2Pct: number
  leftPct: number
  topPct: number
  widthPct: number
  heightPct: number
  isVertical: boolean
}

export type LayoutRenderModel = {
  panels: LayoutRenderPanel[]
  pathSegments: LayoutRenderSegment[]
  origin: {
    leftPct: number
    topPct: number
  }
  bounds: {
    minX: number
    maxX: number
    minY: number
    maxY: number
  }
}

export type PointTaskRenderPoint = PointTaskModelPoint & {
  leftPct: number
  topPct: number
}

export type PointTaskRenderModel = {
  points: PointTaskRenderPoint[]
  pathSegments: LayoutRenderSegment[]
  origin: {
    leftPct: number
    topPct: number
  }
  bounds: PointTaskModel['bounds']
}

export type PointDraftRenderModel = PointTaskRenderModel & {
  pointCount: number
  invalidCount: number
  isClosed: boolean
}

const toFiniteNumber = (value: string | number | undefined, label: string): number => {
  const text = String(value ?? '').trim()
  if (!text) {
    throw new Error(`${label} is required`)
  }

  const num = Number(text)
  if (!Number.isFinite(num)) {
    throw new Error(`${label} must be a number`)
  }

  return num
}

const toOptionalFiniteNumber = (
  value: string | number | undefined,
  label: string,
): number | undefined => {
  if (value == null || String(value).trim() === '') {
    return undefined
  }

  return toFiniteNumber(value, label)
}

const samePoint = (left: PointTaskModelPoint, right: PointTaskModelPoint) => (
  left.x === right.x && left.y === right.y
)

const distanceBetweenPoints = (left: PointTaskModelPoint, right: PointTaskModelPoint) => (
  Math.hypot(right.x - left.x, right.y - left.y)
)

const buildPointSegments = (
  path: PointTaskModelPoint[],
  toXPct: (x: number) => number,
  toYPct: (y: number) => number,
): LayoutRenderSegment[] => (
  path.slice(1).map((point, index) => {
    const prev = path[index]
    const x1Pct = toXPct(prev.x)
    const y1Pct = toYPct(prev.y)
    const x2Pct = toXPct(point.x)
    const y2Pct = toYPct(point.y)
    const isVertical = Math.abs(x1Pct - x2Pct) < Math.abs(y1Pct - y2Pct)
    return {
      x1Pct,
      y1Pct,
      x2Pct,
      y2Pct,
      leftPct: Math.min(x1Pct, x2Pct),
      topPct: Math.min(y1Pct, y2Pct),
      widthPct: Math.max(0.8, Math.abs(x2Pct - x1Pct)),
      heightPct: Math.max(0.8, Math.abs(y2Pct - y1Pct)),
      isVertical,
    }
  })
)

export const buildPointTaskModel = (points: PointTaskModelInput[]): PointTaskModel => {
  const outline = points.map((point, index) => ({
    x: toFiniteNumber(point.x, `point ${index + 1} x`),
    y: toFiniteNumber(point.y, `point ${index + 1} y`),
    lat: toOptionalFiniteNumber(point.lat, `point ${index + 1} lat`),
    lon: toOptionalFiniteNumber(point.lon, `point ${index + 1} lon`),
  }))

  if (outline.length > 1 && samePoint(outline[0], outline[outline.length - 1])) {
    outline.pop()
  }

  const uniquePointCount = new Set(outline.map(point => `${point.x}:${point.y}`)).size
  if (outline.length < 3 || uniquePointCount < 3) {
    throw new Error('at least 3 perimeter points are required')
  }

  const closedOutline = [...outline, outline[0]]
  let signedAreaTwice = 0
  let perimeter = 0

  for (let index = 0; index < outline.length; index += 1) {
    const current = outline[index]
    const next = outline[(index + 1) % outline.length]
    signedAreaTwice += current.x * next.y - next.x * current.y
    perimeter += distanceBetweenPoints(current, next)
  }

  const area = Math.abs(signedAreaTwice) / 2
  if (area === 0) {
    throw new Error('perimeter points must form a non-zero area model')
  }

  const xs = outline.map(point => point.x)
  const ys = outline.map(point => point.y)
  const minX = Math.min(...xs)
  const maxX = Math.max(...xs)
  const minY = Math.min(...ys)
  const maxY = Math.max(...ys)
  const centroid = outline.reduce<PointTaskModelPoint>((total, point) => ({
    x: total.x + point.x / outline.length,
    y: total.y + point.y / outline.length,
  }), { x: 0, y: 0 })

  return {
    pointCount: outline.length,
    outline,
    closedOutline,
    bounds: {
      minX,
      maxX,
      minY,
      maxY,
      width: maxX - minX,
      height: maxY - minY,
    },
    centroid,
    area,
    perimeter,
  }
}

export const buildPointTaskRenderModel = (
  model: PointTaskModel,
  options: LayoutRenderOptions = {},
): PointTaskRenderModel => {
  const paddingPct = options.paddingPct ?? 8
  const { minX, maxX, minY, maxY } = model.bounds
  const spanX = Math.max(1, maxX - minX)
  const spanY = Math.max(1, maxY - minY)
  const toXPct = (x: number) => percentInBounds(x, minX, spanX, paddingPct)
  const toYPct = (y: number) => percentInBounds(y, minY, spanY, paddingPct)

  return {
    points: model.outline.map(point => ({
      ...point,
      leftPct: toXPct(point.x),
      topPct: toYPct(point.y),
    })),
    pathSegments: buildPointSegments(model.closedOutline, toXPct, toYPct),
    origin: {
      leftPct: toXPct(0),
      topPct: toYPct(0),
    },
    bounds: model.bounds,
  }
}

export const buildPointDraftRenderModel = (
  draftPoints: PointTaskModelInput[],
  options: LayoutRenderOptions = {},
): PointDraftRenderModel => {
  const paddingPct = options.paddingPct ?? 8
  let invalidCount = 0
  const outline: PointTaskModelPoint[] = []

  draftPoints.forEach((point, index) => {
    try {
      outline.push({
        x: toFiniteNumber(point.x, `point ${index + 1} x`),
        y: toFiniteNumber(point.y, `point ${index + 1} y`),
        lat: toOptionalFiniteNumber(point.lat, `point ${index + 1} lat`),
        lon: toOptionalFiniteNumber(point.lon, `point ${index + 1} lon`),
      })
    } catch {
      invalidCount += 1
    }
  })

  const boundsPoints = outline.length ? [...outline, { x: 0, y: 0 }] : [{ x: 0, y: 0 }]
  const xs = boundsPoints.map(point => point.x)
  const ys = boundsPoints.map(point => point.y)
  const minX = Math.min(...xs)
  const maxX = Math.max(...xs)
  const minY = Math.min(...ys)
  const maxY = Math.max(...ys)
  const spanX = Math.max(1, maxX - minX)
  const spanY = Math.max(1, maxY - minY)
  const toXPct = (x: number) => percentInBounds(x, minX, spanX, paddingPct)
  const toYPct = (y: number) => percentInBounds(y, minY, spanY, paddingPct)
  const isClosed = outline.length >= 3
  const drawPath = isClosed ? [...outline, outline[0]] : outline

  return {
    pointCount: outline.length,
    invalidCount,
    isClosed,
    points: outline.map(point => ({
      ...point,
      leftPct: toXPct(point.x),
      topPct: toYPct(point.y),
    })),
    pathSegments: buildPointSegments(drawPath, toXPct, toYPct),
    origin: {
      leftPct: toXPct(0),
      topPct: toYPct(0),
    },
    bounds: {
      minX,
      maxX,
      minY,
      maxY,
      width: maxX - minX,
      height: maxY - minY,
    },
  }
}

const toNumber = (value: string | number | undefined, label: string): number => {
  const text = String(value ?? '').trim()
  if (!text) {
    throw new Error(`${label}不能为空`)
  }

  const num = Number(text)
  if (!Number.isFinite(num)) {
    throw new Error(`${label}必须是数字`)
  }

  return Math.trunc(num)
}

const normalizeRange = (range: LayoutRange): LayoutRange => ({
  rowStart: Math.min(range.rowStart, range.rowEnd),
  rowEnd: Math.max(range.rowStart, range.rowEnd),
  colStart: Math.min(range.colStart, range.colEnd),
  colEnd: Math.max(range.colStart, range.colEnd),
})

export const parseLayoutRanges = (text: string, label: string): LayoutRange[] => {
  const rows = (text || '')
    .split(/\r?\n/)
    .map(row => row.trim())
    .filter(Boolean)

  return rows.map((row, index) => {
    const parts = row.split(/[,\s]+/).filter(Boolean)
    if (parts.length !== 4) {
      throw new Error(`${label}第${index + 1}行格式应为 rowStart,rowEnd,colStart,colEnd`)
    }

    return normalizeRange({
      rowStart: toNumber(parts[0], `${label}第${index + 1}行 rowStart`),
      rowEnd: toNumber(parts[1], `${label}第${index + 1}行 rowEnd`),
      colStart: toNumber(parts[2], `${label}第${index + 1}行 colStart`),
      colEnd: toNumber(parts[3], `${label}第${index + 1}行 colEnd`),
    })
  })
}

const normalizeStructuredRange = (
  range: LayoutRangeInput,
  label: string,
  index: number,
): LayoutRange => normalizeRange({
  rowStart: toNumber(range.rowStart, `${label}第${index + 1}项 rowStart`),
  rowEnd: toNumber(range.rowEnd, `${label}第${index + 1}项 rowEnd`),
  colStart: toNumber(range.colStart, `${label}第${index + 1}项 colStart`),
  colEnd: toNumber(range.colEnd, `${label}第${index + 1}项 colEnd`),
})

export const normalizeLayoutRanges = (
  ranges: LayoutRangeInput[] | undefined,
  text: string | undefined,
  label: string,
): LayoutRange[] => {
  if (Array.isArray(ranges)) {
    return ranges.map((range, index) => normalizeStructuredRange(range, label, index))
  }

  return parseLayoutRanges(text || '', label)
}

export const parseLayoutConnectors = (text: string): LayoutConnector[] => {
  const rows = (text || '')
    .split(/\r?\n/)
    .map(row => row.trim())
    .filter(Boolean)

  return rows.map((row, index) => {
    const parts = row.split(/[,\s]+/).filter(Boolean)
    if (parts.length !== 5) {
      throw new Error(
        `连接段第${index + 1}行格式应为 col,rowStart,rowEnd,afterCol,length 或 row,colStart,colEnd,afterRow,length`,
      )
    }

    const type = parts[0]
    if (type === 'col') {
      const rowStart = toNumber(parts[1], `连接段第${index + 1}行 rowStart`)
      const rowEnd = toNumber(parts[2], `连接段第${index + 1}行 rowEnd`)
      return {
        type,
        rowStart: Math.min(rowStart, rowEnd),
        rowEnd: Math.max(rowStart, rowEnd),
        afterCol: toNumber(parts[3], `连接段第${index + 1}行 afterCol`),
        length: toNumber(parts[4], `连接段第${index + 1}行 length`),
      }
    }

    if (type === 'row') {
      const colStart = toNumber(parts[1], `连接段第${index + 1}行 colStart`)
      const colEnd = toNumber(parts[2], `连接段第${index + 1}行 colEnd`)
      return {
        type,
        colStart: Math.min(colStart, colEnd),
        colEnd: Math.max(colStart, colEnd),
        afterRow: toNumber(parts[3], `连接段第${index + 1}行 afterRow`),
        length: toNumber(parts[4], `连接段第${index + 1}行 length`),
      }
    }

    throw new Error(`连接段第${index + 1}行方向只能是 col 或 row`)
  })
}

const normalizeLayoutConnector = (connector: LayoutConnectorInput, index: number): LayoutConnector => {
  if (connector.type === 'col') {
    const rowStart = toNumber(connector.rowStart, `连接段第${index + 1}项 rowStart`)
    const rowEnd = toNumber(connector.rowEnd, `连接段第${index + 1}项 rowEnd`)
    return {
      type: 'col',
      rowStart: Math.min(rowStart, rowEnd),
      rowEnd: Math.max(rowStart, rowEnd),
      afterCol: toNumber(connector.afterCol, `连接段第${index + 1}项 afterCol`),
      length: toNumber(connector.length, `连接段第${index + 1}项 length`),
    }
  }

  if (connector.type === 'row') {
    const colStart = toNumber(connector.colStart, `连接段第${index + 1}项 colStart`)
    const colEnd = toNumber(connector.colEnd, `连接段第${index + 1}项 colEnd`)
    return {
      type: 'row',
      colStart: Math.min(colStart, colEnd),
      colEnd: Math.max(colStart, colEnd),
      afterRow: toNumber(connector.afterRow, `连接段第${index + 1}项 afterRow`),
      length: toNumber(connector.length, `连接段第${index + 1}项 length`),
    }
  }

  throw new Error(`连接段第${index + 1}项方向只能是 col 或 row`)
}

export const normalizeLayoutConnectors = (
  connectors: LayoutConnectorInput[] | undefined,
  text: string | undefined,
): LayoutConnector[] => {
  if (Array.isArray(connectors)) {
    return connectors.map(normalizeLayoutConnector)
  }

  return parseLayoutConnectors(text || '')
}

export const buildLayoutV2 = (form: LayoutV2Form): LayoutV2 => {
  const layout = {
    returnToOrigin: true,
    visitStrategy: 'nearest' as LayoutVisitStrategy,
    areas: normalizeLayoutRanges(form.areas, form.areasText, '基础区域'),
    holes: normalizeLayoutRanges(form.holes, form.holesText, '挖掉区域'),
    extras: normalizeLayoutRanges(form.extras, form.extrasText, '额外区域'),
    connectors: normalizeLayoutConnectors(form.connectors, form.connectorsText),
  }

  if (layout.areas.length === 0 && layout.extras.length === 0) {
    throw new Error('至少需要一个基础区域或额外区域')
  }

  return layout
}

export const buildLayoutV2Payload = (form: LayoutV2Form) => {
  const taskName = form.taskName.trim()
  if (!taskName) {
    throw new Error('任务名称不能为空')
  }

  return {
    taskName,
    areaList: [{
      areaNumber: toNumber(form.areaNumber, '区域编号'),
      direction: form.direction,
      layoutVersion: 2 as const,
      layout: buildLayoutV2(form),
    }],
  }
}

const percentInBounds = (value: number, min: number, span: number, paddingPct: number) => {
  const usablePct = Math.max(1, 100 - paddingPct * 2)
  return paddingPct + ((value - min) / Math.max(1, span)) * usablePct
}

export const buildLayoutRenderModel = (
  preview: LayoutPreview,
  options: LayoutRenderOptions = {},
): LayoutRenderModel => {
  const paddingPct = options.paddingPct ?? 6
  const xs: number[] = []
  const ys: number[] = []

  preview.panels.forEach(panel => {
    xs.push(panel.x, panel.x + panel.width)
    ys.push(panel.y, panel.y + panel.height)
  })
  preview.path.forEach(point => {
    xs.push(point.x)
    ys.push(point.y)
  })

  const minX = xs.length ? Math.min(...xs) : 0
  const maxX = xs.length ? Math.max(...xs) : 1
  const minY = ys.length ? Math.min(...ys) : 0
  const maxY = ys.length ? Math.max(...ys) : 1
  const spanX = Math.max(1, maxX - minX)
  const spanY = Math.max(1, maxY - minY)
  const toXPct = (x: number) => percentInBounds(x, minX, spanX, paddingPct)
  const toYPct = (y: number) => 100 - percentInBounds(y, minY, spanY, paddingPct)

  const panels = preview.panels.map(panel => ({
    ...panel,
    leftPct: toXPct(panel.x),
    topPct: Math.min(toYPct(panel.y), toYPct(panel.y + panel.height)),
    widthPct: Math.max(1, toXPct(panel.x + panel.width) - toXPct(panel.x)),
    heightPct: Math.max(1, Math.abs(toYPct(panel.y + panel.height) - toYPct(panel.y))),
  }))

  const pathSegments = preview.path.slice(1).map((point, index) => {
    const prev = preview.path[index]
    const x1Pct = toXPct(prev.x)
    const y1Pct = toYPct(prev.y)
    const x2Pct = toXPct(point.x)
    const y2Pct = toYPct(point.y)
    const isVertical = Math.abs(x1Pct - x2Pct) < Math.abs(y1Pct - y2Pct)
    return {
      x1Pct,
      y1Pct,
      x2Pct,
      y2Pct,
      leftPct: Math.min(x1Pct, x2Pct),
      topPct: Math.min(y1Pct, y2Pct),
      widthPct: Math.max(0.8, Math.abs(x2Pct - x1Pct)),
      heightPct: Math.max(0.8, Math.abs(y2Pct - y1Pct)),
      isVertical,
    }
  }).filter(segment => segment.widthPct > 0.8 || segment.heightPct > 0.8)

  return {
    panels,
    pathSegments,
    origin: {
      leftPct: toXPct(0),
      topPct: toYPct(0),
    },
    bounds: { minX, maxX, minY, maxY },
  }
}

const cellKey = (row: number, col: number) => `${row}:${col}`

const addRangeCells = (cells: Set<string>, range: LayoutRange) => {
  for (let row = range.rowStart; row <= range.rowEnd; row += 1) {
    for (let col = range.colStart; col <= range.colEnd; col += 1) {
      cells.add(cellKey(row, col))
    }
  }
}

const removeRangeCells = (cells: Set<string>, range: LayoutRange) => {
  for (let row = range.rowStart; row <= range.rowEnd; row += 1) {
    for (let col = range.colStart; col <= range.colEnd; col += 1) {
      cells.delete(cellKey(row, col))
    }
  }
}

const expandCells = (layout: LayoutV2): Set<string> => {
  const cells = new Set<string>()
  layout.areas.forEach(range => addRangeCells(cells, range))
  layout.extras.forEach(range => addRangeCells(cells, range))
  layout.holes.forEach(range => removeRangeCells(cells, range))
  return cells
}

const buildCellsByRow = (cells: Set<string>): Map<number, number[]> => {
  const rows = new Map<number, number[]>()
  cells.forEach(key => {
    const [row, col] = key.split(':').map(Number)
    if (!rows.has(row)) {
      rows.set(row, [])
    }
    rows.get(row)!.push(col)
  })
  rows.forEach((cols, row) => {
    rows.set(row, Array.from(new Set(cols)).sort((a, b) => a - b))
  })
  return rows
}

const buildCellsByCol = (cells: Set<string>): Map<number, number[]> => {
  const cols = new Map<number, number[]>()
  cells.forEach(key => {
    const [row, col] = key.split(':').map(Number)
    if (!cols.has(col)) {
      cols.set(col, [])
    }
    cols.get(col)!.push(row)
  })
  cols.forEach((rows, col) => {
    cols.set(col, Array.from(new Set(rows)).sort((a, b) => a - b))
  })
  return cols
}

const connectorEdges = (cells: Set<string>, connectors: LayoutConnector[]): Array<[string, string]> => {
  const rows = buildCellsByRow(cells)
  const cols = buildCellsByCol(cells)
  const edges: Array<[string, string]> = []

  connectors.forEach(connector => {
    if (connector.type === 'col') {
      for (let row = connector.rowStart; row <= connector.rowEnd; row += 1) {
        const rowCols = rows.get(row) || []
        const leftCols = rowCols.filter(col => col <= connector.afterCol)
        const rightCols = rowCols.filter(col => col > connector.afterCol)
        if (leftCols.length && rightCols.length) {
          edges.push([cellKey(row, Math.max(...leftCols)), cellKey(row, Math.min(...rightCols))])
        }
      }
    }

    if (connector.type === 'row') {
      for (let col = connector.colStart; col <= connector.colEnd; col += 1) {
        const colRows = cols.get(col) || []
        const topRows = colRows.filter(row => row <= connector.afterRow)
        const bottomRows = colRows.filter(row => row > connector.afterRow)
        if (topRows.length && bottomRows.length) {
          edges.push([cellKey(Math.max(...topRows), col), cellKey(Math.min(...bottomRows), col)])
        }
      }
    }
  })

  return edges
}

export const connectedLayoutComponents = (
  cells: Set<string>,
  connectors: LayoutConnector[] = [],
): Array<Set<string>> => {
  const adjacency = new Map<string, Set<string>>()
  cells.forEach(key => adjacency.set(key, new Set<string>()))

  cells.forEach(key => {
    const [row, col] = key.split(':').map(Number)
    const neighbors = [
      cellKey(row - 1, col),
      cellKey(row + 1, col),
      cellKey(row, col - 1),
      cellKey(row, col + 1),
    ]
    neighbors.forEach(neighbor => {
      if (cells.has(neighbor)) {
        adjacency.get(key)!.add(neighbor)
        adjacency.get(neighbor)!.add(key)
      }
    })
  })

  connectorEdges(cells, connectors).forEach(([left, right]) => {
    if (cells.has(left) && cells.has(right)) {
      adjacency.get(left)!.add(right)
      adjacency.get(right)!.add(left)
    }
  })

  const components: Array<Set<string>> = []
  const seen = new Set<string>()
  Array.from(cells).sort().forEach(key => {
    if (seen.has(key)) return
    const stack = [key]
    const component = new Set<string>()
    seen.add(key)
    while (stack.length) {
      const current = stack.pop()!
      component.add(current)
        ; (adjacency.get(current) || new Set<string>()).forEach(neighbor => {
          if (!seen.has(neighbor)) {
            seen.add(neighbor)
            stack.push(neighbor)
          }
        })
    }
    components.push(component)
  })

  return components.sort((a, b) => {
    const aCells = Array.from(a).map(key => key.split(':').map(Number))
    const bCells = Array.from(b).map(key => key.split(':').map(Number))
    const aMaxRow = Math.max(...aCells.map(([row]) => row))
    const bMaxRow = Math.max(...bCells.map(([row]) => row))
    const aMinCol = Math.min(...aCells.map(([, col]) => col))
    const bMinCol = Math.min(...bCells.map(([, col]) => col))
    return bMaxRow - aMaxRow || aMinCol - bMinCol
  })
}

const pointXY = (
  row: number,
  col: number,
  stepX: number,
  stepY: number,
  connectors: LayoutConnector[],
): LayoutPreviewPoint => {
  let x = col * stepX
  let y = row * stepY
  connectors.forEach(connector => {
    if (connector.type === 'col' && row >= connector.rowStart && row <= connector.rowEnd && col > connector.afterCol) {
      x += connector.length
    }
    if (connector.type === 'row' && col >= connector.colStart && col <= connector.colEnd && row > connector.afterRow) {
      y += connector.length
    }
  })
  return { x, y }
}

const addPathPoint = (path: LayoutPreviewPoint[], point: LayoutPreviewPoint) => {
  const last = path[path.length - 1]
  if (last && last.x === point.x && last.y === point.y) {
    return
  }
  path.push(point)
}

const appendTransition = (
  path: LayoutPreviewPoint[],
  current: LayoutPreviewPoint,
  target: LayoutPreviewPoint,
): LayoutPreviewPoint => {
  let next = current
  if (next.y !== target.y) {
    next = { x: next.x, y: target.y }
    addPathPoint(path, next)
  }
  if (next.x !== target.x) {
    next = { x: target.x, y: target.y }
    addPathPoint(path, next)
  }
  return next
}

const pathLength = (points: LayoutPreviewPoint[], start: LayoutPreviewPoint) => {
  let total = 0
  let current = start
  points.forEach(point => {
    total += Math.abs(point.x - current.x) + Math.abs(point.y - current.y)
    current = point
  })
  return total
}

const buildPanelSegmentsForPreview = (cells: Set<string>): Array<{ row: number; segments: Array<[number, number]> }> => {
  const rowMap = new Map<number, number[]>()

  cells.forEach(key => {
    const [row, col] = key.split(':').map(Number)
    if (!rowMap.has(row)) {
      rowMap.set(row, [])
    }
    rowMap.get(row)!.push(col)
  })

  return Array.from(rowMap.entries()).sort((a, b) => b[0] - a[0]).map(([row, cols]) => {
    const sorted = Array.from(new Set(cols)).sort((a, b) => a - b)
    const segments: Array<[number, number]> = []
    let start = sorted[0]
    let prev = sorted[0]
    for (let i = 1; i < sorted.length; i += 1) {
      if (sorted[i] === prev + 1) {
        prev = sorted[i]
      } else {
        segments.push([start, prev])
        start = sorted[i]
        prev = sorted[i]
      }
    }
    if (sorted.length > 0) {
      segments.push([start, prev])
    }

    return { row, segments }
  })
}

const buildComponentPath = (
  component: Set<string>,
  startPoint: LayoutPreviewPoint,
  stepX: number,
  stepY: number,
  connectors: LayoutConnector[],
  leftToRightStart: boolean,
) => {
  const points: LayoutPreviewPoint[] = []
  let current = { ...startPoint }
  let leftToRight = leftToRightStart

  buildPanelSegmentsForPreview(component).forEach(rowInfo => {
    const ordered = leftToRight ? rowInfo.segments : rowInfo.segments.slice().reverse()
    ordered.forEach(([colStart, colEnd]) => {
      const startCol = leftToRight ? colStart : colEnd
      const endCol = leftToRight ? colEnd : colStart
      const start = pointXY(rowInfo.row, startCol, stepX, stepY, connectors)
      const end = pointXY(rowInfo.row, endCol, stepX, stepY, connectors)
      current = appendTransition(points, current, start)
      current = end
      addPathPoint(points, current)
    })
    leftToRight = !leftToRight
  })

  return {
    current,
    points,
    length: pathLength(points, startPoint),
  }
}

export const buildLayoutPreview = (layout: LayoutV2, options: LayoutPreviewOptions): LayoutPreview => {
  const panelAngle = options.panelAngle || 0
  const panelAngleX = options.panelAngleX || 0
  const xProjection = Math.cos(panelAngleX * Math.PI / 180)
  const yProjection = Math.cos(panelAngle * Math.PI / 180)
  const panelWidth = Math.round(options.panelWidth * xProjection)
  const panelHeight = Math.round(options.panelHeight * yProjection)
  const stepX = Math.round((options.panelWidth + options.gapX) * xProjection)
  const stepY = Math.round((options.panelHeight + options.gapY) * yProjection)
  const cells = expandCells(layout)
  const components = connectedLayoutComponents(cells, layout.connectors)
  // 面板列表生成 布局中每个独立单元格的位置和尺寸
  const panels = Array.from(cells).map(key => {
    const [row, col] = key.split(':').map(Number)
    const point = pointXY(row, col, stepX, stepY, layout.connectors)
    return { row, col, x: point.x, y: point.y, width: panelWidth, height: panelHeight }
  }).sort((a, b) => b.row - a.row || a.col - b.col)
  // 遍历所有单元格的优化运动轨迹
  const path: LayoutPreviewPoint[] = [{ x: 0, y: 0 }]
  let current = { x: 0, y: 0 }
  const preferredLeftToRight = options.direction !== 'right'
  const remaining = components.slice()

  while (remaining.length) {//剩余待访问列表
    let selectedIndex = 0
    let selectedPlan:
      | ReturnType<typeof buildComponentPath>
      | (ReturnType<typeof buildComponentPath> & { score: [number, number, number] })
      | null = null

    if ((layout.visitStrategy || options.visitStrategy) === 'row') {
      selectedPlan = buildComponentPath(remaining[0], current, stepX, stepY, layout.connectors, preferredLeftToRight)
    } else {
      remaining.forEach((component, componentIndex) => {
        ;[preferredLeftToRight, !preferredLeftToRight].forEach(leftToRight => {
          const plan = buildComponentPath(component, current, stepX, stepY, layout.connectors, leftToRight)
          const score: [number, number, number] = [
            plan.length,
            leftToRight === preferredLeftToRight ? 0 : 1,
            componentIndex,
          ]
          if (
            !selectedPlan ||
            !('score' in selectedPlan) ||
            score[0] < selectedPlan.score[0] ||
            (score[0] === selectedPlan.score[0] && score[1] < selectedPlan.score[1]) ||
            (score[0] === selectedPlan.score[0] && score[1] === selectedPlan.score[1] && score[2] < selectedPlan.score[2])
          ) {
            selectedIndex = componentIndex
            selectedPlan = { ...plan, score }
          }
        })
      })
    }

    selectedPlan?.points.forEach(point => addPathPoint(path, point))
    current = selectedPlan?.current || current
    remaining.splice(selectedIndex, 1)
  }

  if (layout.returnToOrigin || options.returnToOrigin) {
    current = appendTransition(path, current, { x: 0, y: 0 })
  }

  return { panels, path }
}
