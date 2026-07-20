import * as XLSX from 'xlsx'
import { describe, expect, it } from 'vitest'
import { parseCustomInventoryWorkbook } from './parser'
import { normalizeArabicDigits, normalizeExcelText, parseExcelNumber } from './normalization'

type MonthlyRow = {
  meta: unknown[]
  movements?: Partial<Record<`${number}-${'add' | 'issue'}`, unknown>>
  final: unknown
}

function monthlySheet(
  headers: string[],
  rows: MonthlyRow[],
  order: Array<'issue' | 'add'> = ['issue', 'add'],
) {
  const movementStart = headers.length
  const groupRow: unknown[] = Array(headers.length).fill(null)
  const headerRow: unknown[] = [...headers]
  const merges: XLSX.Range[] = []

  for (let day = 1; day <= 31; day += 1) {
    const start = movementStart + (day - 1) * 2
    groupRow[start] = day
    headerRow[start] = order[0] === 'add' ? 'إضافة' : 'صرف'
    headerRow[start + 1] = order[1] === 'add' ? 'إضافة' : 'صرف'
    merges.push({ s: { r: 0, c: start }, e: { r: 0, c: start + 1 } })
  }

  const totalAddedColumn = movementStart + 62
  const totalIssuedColumn = totalAddedColumn + 1
  const finalColumn = totalIssuedColumn + 1
  groupRow[totalAddedColumn] = 'إجمالي المضاف'
  groupRow[totalIssuedColumn] = 'إجمالي صرف'
  groupRow[finalColumn] = 'رصيد مخزني'

  const dataRows = rows.map((row) => {
    const values: unknown[] = [...row.meta]
    for (let day = 1; day <= 31; day += 1) {
      for (let offset = 0; offset < order.length; offset += 1) {
        values[movementStart + (day - 1) * 2 + offset] = row.movements?.[`${day}-${order[offset]}`]
      }
    }
    values[finalColumn] = row.final
    return values
  })
  const sheet = XLSX.utils.aoa_to_sheet([groupRow, headerRow, ...dataRows])
  sheet['!merges'] = merges
  return sheet
}

function workbook(sheets: Record<string, XLSX.WorkSheet>) {
  const value = XLSX.utils.book_new()
  for (const [name, sheet] of Object.entries(sheets)) XLSX.utils.book_append_sheet(value, sheet, name)
  return value
}

describe('monthly warehouse parser', () => {
  it('treats 30/06/2026 as opening balance and respects physical movement order', () => {
    const sheet = monthlySheet(
      ['المشروع', 'الصنف', '30/06/2026'],
      [{
        meta: ['ROTT', 'Bolt', 6],
        movements: { '1-issue': 2, '1-add': 3, '31-issue': 7 },
        final: 0,
      }],
    )
    const preview = parseCustomInventoryWorkbook(workbook({ مستهلكات: sheet }), 'مخزن 07-2026.xlsx')!

    expect(preview.items[0]).toMatchObject({ opening_balance: 6, total_added: 3, total_issued: 9, stock_balance: 0 })
    expect(preview.movements).toHaveLength(3)
    expect(preview.movements[0]).toMatchObject({
      operation_type: 'issue', operation_date: '2026-07-01', previous_balance: 6, new_balance: 4,
    })
    expect(preview.movements[1]).toMatchObject({
      operation_type: 'add', operation_date: '2026-07-01', previous_balance: 4, new_balance: 7,
    })
    expect(preview.movements[2]).toMatchObject({
      operation_type: 'issue', operation_date: '2026-07-31', previous_balance: 7, new_balance: 0,
    })
    expect(preview.movements.some((movement) => movement.operation_date === '2026-06-30')).toBe(false)
    expect(preview.items[0].client_key).toBe(`مخزن 07-2026.xlsx|مستهلكات|3|${preview.items[0].item_key}`)
  })

  it('creates a non-blocking adjustment and preserves a negative final balance', () => {
    const sheet = monthlySheet(
      ['المشروع', 'الصنف', '30/06/2026'],
      [{ meta: ['ROTT', 'Negative item', 6], movements: { '31-issue': 7 }, final: -2 }],
    )
    const preview = parseCustomInventoryWorkbook(workbook({ مستهلكات: sheet }), 'مخزن 07-2026.xlsx')!

    expect(preview.items[0].stock_balance).toBe(-2)
    expect(preview.movements.at(-1)).toMatchObject({
      operation_type: 'adjust', operation_date: '2026-07-31', quantity: 1,
      previous_balance: -1, new_balance: -2,
    })
    expect(preview.errors).toEqual([])
    expect(preview.warnings.some((warning) => warning.includes('حركة تسوية'))).toBe(true)
  })

  it('detects merged day headers, Arabic digits, and blank movement cells', () => {
    const sheet = monthlySheet(
      ['المشروع', 'الصنف', '٣٠/٠٦/٢٠٢٦'],
      [{ meta: ['ROTT', 'Arabic digits', '٦'], movements: { '1-add': '٣' }, final: '٩' }],
      ['add', 'issue'],
    )
    const preview = parseCustomInventoryWorkbook(workbook({ مستهلكات: sheet }), 'arabic.xlsx')!
    expect(preview.items[0]).toMatchObject({ opening_balance: 6, total_added: 3, total_issued: 0, stock_balance: 9 })
    expect(preview.movements).toHaveLength(1)
    expect(preview.movements[0]).toMatchObject({ operation_type: 'add', operation_date: '2026-07-01' })
  })

  it('reports real data rows without an item and silently skips decorative rows', () => {
    const sheet = monthlySheet(
      ['المشروع', 'الصنف', '30/06/2026'],
      [
        { meta: ['ROTT', '', 2], final: 2 },
        { meta: ['عنوان فقط', '', null], final: null },
      ],
    )
    const preview = parseCustomInventoryWorkbook(workbook({ مستهلكات: sheet }), 'missing.xlsx')!
    expect(preview.errors.some((error) => error.includes('بدون اسم صنف'))).toBe(true)
    expect(preview.sheetDiagnoses?.[0].skippedRows).toBeGreaterThan(0)
  })
})

describe('sheet mapping and identities', () => {
  it('imports جرد البلى into consumables and aggregates duplicate names', () => {
    const sheet = XLSX.utils.aoa_to_sheet([
      ['ملاحظات', 'العدد', 'الصنف', 'التاريخ'],
      ['', 2, 'بلى6205', '2026-01-01'],
      ['', 3, 'بلى6205', '2026-02-01'],
    ])
    const preview = parseCustomInventoryWorkbook(workbook({ 'جرد البلى': sheet }), 'bearing.xlsx')!
    expect(preview.items).toHaveLength(1)
    expect(preview.items[0]).toMatchObject({ table_name: 'consumables', project_name: 'جرد البلى', stock_balance: 5 })
  })

  it.each([
    ['خامات الفتح', 'خامات الفتح'],
    ['جريتن مجلفن', 'جريتن مجلفن'],
  ])('maps %s to raw materials with its material source', (sheetName, materialSource) => {
    const sheet = monthlySheet(
      ['الصنف', '30/06/2026'],
      [{ meta: ['PIPE 6000 x 60 x 4', 1], final: 1 }],
    )
    const preview = parseCustomInventoryWorkbook(workbook({ [sheetName]: sheet }), 'raw.xlsx')!
    expect(preview.items[0]).toMatchObject({
      table_name: 'raw_materials',
      fields: { material_source: materialSource },
    })
  })

  it('keeps DIN and code number as text and always creates an item key', () => {
    const sheet = monthlySheet(
      ['المشروع', 'الصنف', 'DIN', 'Code Number', '30/06/2026'],
      [{ meta: ['ROTT', 'Bolt', 'DIN-0933/A', '0007-B', 5], final: 5 }],
    )
    const preview = parseCustomInventoryWorkbook(workbook({ 'مسامير ROTTERDAM': sheet }), 'screws.xlsx')!
    expect(preview.items[0].fields).toMatchObject({ din: 'DIN-0933/A', code_number: '0007-B' })
    expect(preview.items[0].item_key).not.toBe('')
  })

  it('does not merge different raw-material dimensions', () => {
    const sheet = monthlySheet(
      ['النوع', 'LENGTH', 'WIDTH', 'TH', 'الوزن', '30/06/2026'],
      [
        { meta: ['PIPE', 6000, 60, 4, 33, 1], final: 1 },
        { meta: ['PIPE', 6000, 60, 6, 44, 1], final: 1 },
      ],
    )
    const preview = parseCustomInventoryWorkbook(workbook({ خامات: sheet }), 'dimensions.xlsx')!
    expect(preview.items).toHaveLength(2)
    expect(new Set(preview.items.map((item) => item.item_key)).size).toBe(2)
  })

  it('warns about unsupported sheets without blocking supported data', () => {
    const supported = monthlySheet(['المشروع', 'الصنف', '30/06/2026'], [{ meta: ['P', 'I', 1], final: 1 }])
    const preview = parseCustomInventoryWorkbook(workbook({ مستهلكات: supported, Notes: XLSX.utils.aoa_to_sheet([['x']]) }), 'mixed.xlsx')!
    expect(preview.ignoredSheets).toEqual(['Notes'])
    expect(preview.errors).toEqual([])
    expect(preview.warnings.some((warning) => warning.includes('Notes'))).toBe(true)
  })
})

describe('custody parsers', () => {
  it('imports cutting discs only as custody and deduplicates codes', () => {
    const sheet = XLSX.utils.aoa_to_sheet([
      ['م', 'Type', 'اسم صاحب الصاروخ', 'تاريخ الاستلام', 'تكهين'],
      ['B01', '9-BOSCH', 'عامل', '2026-07-01', '2026-07-20'],
      ['B01', '9-BOSCH', 'عامل', '2026-07-01', '2026-07-20'],
    ])
    const preview = parseCustomInventoryWorkbook(workbook({ صواريخ: sheet }), 'custody.xlsx')!
    expect(preview.items).toEqual([])
    expect(preview.movements).toEqual([])
    expect(preview.cuttingDiscs).toHaveLength(1)
  })

  it('imports welding gloves only as custody and warns about invalid optional dates', () => {
    const sheet = XLSX.utils.aoa_to_sheet([
      ['الاسم', 'التاريخ', 'جوانتي اصفر', 'جوانتي اسود'],
      ['عامل', 'not-a-date', 2, 1],
    ])
    const preview = parseCustomInventoryWorkbook(workbook({ 'جوانتي لحام طويل': sheet }), 'gloves.xlsx')!
    expect(preview.items).toEqual([])
    expect(preview.movements).toEqual([])
    expect(preview.longWeldingGloves).toHaveLength(2)
    expect(preview.warnings.some((warning) => warning.includes('غير صالحة'))).toBe(true)
  })
})

describe('normalization', () => {
  it('parses Arabic digits and parentheses negatives', () => {
    expect(normalizeArabicDigits('١٢۳')).toBe('123')
    expect(parseExcelNumber('(١٬٢٥٠)')).toBe(-1250)
    expect(parseExcelNumber('')).toBeNull()
  })

  it('normalizes Arabic spacing and alef variants', () => {
    expect(normalizeExcelText('  إختبار   أصناف  ')).toBe(normalizeExcelText('اختبار اصناف'))
  })
})
