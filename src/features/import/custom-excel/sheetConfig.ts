import type { StockTableName } from './types'
import { normalizeSheetName } from './normalization'

export type SheetParserKind = 'stock' | 'bearing-count' | 'cylinders' | 'cutting-discs' | 'welding-gloves'

export type CustomSheetConfig = {
  parser: SheetParserKind
  tableName?: StockTableName
  defaultProject?: string
  materialSource?: string
  paintSections?: boolean
}

const configs: Array<{ aliases: string[]; config: CustomSheetConfig }> = [
  { aliases: ['مستهلكات'], config: { parser: 'stock', tableName: 'consumables', defaultProject: 'مستهلكات' } },
  { aliases: ['جرد البلى', 'جرد البلي'], config: { parser: 'bearing-count', tableName: 'consumables', defaultProject: 'جرد البلى' } },
  { aliases: ['الدهانات', 'دهانات'], config: { parser: 'stock', tableName: 'paints', defaultProject: 'دهانات', paintSections: true } },
  { aliases: ['خامات الفتح'], config: { parser: 'stock', tableName: 'raw_materials', defaultProject: 'الفتح', materialSource: 'خامات الفتح' } },
  { aliases: ['خامات'], config: { parser: 'stock', tableName: 'raw_materials', defaultProject: 'خامات', materialSource: 'خامات' } },
  { aliases: ['جريتن مجلفن'], config: { parser: 'stock', tableName: 'raw_materials', defaultProject: 'ITALY', materialSource: 'جريتن مجلفن' } },
  { aliases: ['مسامير ROTTERDAM', 'مساميرROTTERDAM', 'مسامير'], config: { parser: 'stock', tableName: 'screws', defaultProject: 'ROTT' } },
  { aliases: ['مسامير استوك ROTTERDAM', 'مساميراستوكROTTERDAM', 'مسامير استوك'], config: { parser: 'stock', tableName: 'stock_screws', defaultProject: 'ROTT' } },
  { aliases: ['اسطوانات غازات', 'اسطوانات غازات (2)', 'اسطوانات'], config: { parser: 'cylinders', tableName: 'cylinders', defaultProject: 'اسطوانات غازات' } },
  { aliases: ['صواريخ', 'صواربخ'], config: { parser: 'cutting-discs' } },
  { aliases: ['جوانتى لحام طويل', 'جوانتي لحام طويل', 'جاونتي لحام طويل'], config: { parser: 'welding-gloves' } },
]

const exactConfigs = new Map<string, CustomSheetConfig>()
for (const entry of configs) {
  for (const alias of entry.aliases) exactConfigs.set(normalizeSheetName(alias), entry.config)
}

export function getCustomSheetConfig(sheetName: string): CustomSheetConfig | null {
  const normalized = normalizeSheetName(sheetName)
  const exact = exactConfigs.get(normalized)
  if (exact) return exact

  if (normalized.startsWith(normalizeSheetName('اسطوانات غازات'))) {
    return { parser: 'cylinders', tableName: 'cylinders', defaultProject: 'اسطوانات غازات' }
  }
  return null
}
