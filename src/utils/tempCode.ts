export function getCategoryPrefix(tableName: string) {
  const prefixes: Record<string, string> = {
    consumables: 'CO', paints: 'PA', screws: 'SC', stock_screws: 'SS',
    raw_materials: 'RM', cylinders: 'CY', cutting_discs: 'CD',
    long_welding_gloves: 'WG',
  }
  return prefixes[tableName] ?? 'GN'
}

export function generateTempInternalCode(tableName: string) {
  const suffix = `${Date.now().toString(36)}${crypto.randomUUID().slice(0, 4)}`.toUpperCase()
  return `TEMP-${getCategoryPrefix(tableName)}-${suffix}`
}
