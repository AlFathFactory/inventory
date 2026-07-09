import {
  getSupabaseConfigError,
  isSupabaseConfigured,
  supabaseClient,
} from '../lib/supabaseClient'

export type JsonPrimitive = string | number | boolean | null
export type JsonValue =
  | JsonPrimitive
  | JsonValue[]
  | { [key: string]: JsonValue }

export type InventoryRow = Record<string, JsonValue>

export type ServiceSuccess<TData> = {
  data: TData
  error: null
}

export type ServiceFailure = {
  data: null
  error: string
}

export type ServiceResult<TData> = Promise<ServiceSuccess<TData> | ServiceFailure>

function createSuccess<TData>(data: TData): ServiceSuccess<TData> {
  return {
    data,
    error: null,
  }
}

function createFailure(message: string): ServiceFailure {
  return {
    data: null,
    error: message,
  }
}

function getClientOrFailure(): ServiceFailure | null {
  if (!isSupabaseConfigured || !supabaseClient) {
    return createFailure(getSupabaseConfigError())
  }

  return null
}

function normalizeError(error: unknown, fallbackMessage: string): string {
  if (error instanceof Error && error.message) {
    return error.message
  }

  return fallbackMessage
}

function escapeSearchTerm(searchTerm: string): string {
  return searchTerm.replaceAll('%', '\\%').replaceAll(',', '\\,')
}

function toComparableNumber(value: JsonValue): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value
  }

  if (typeof value === 'string') {
    const normalizedValue = Number(value)
    return Number.isFinite(normalizedValue) ? normalizedValue : null
  }

  return null
}

export async function getCategoryRows<TRow extends InventoryRow = InventoryRow>(
  tableName: string,
): ServiceResult<TRow[]> {
  const clientFailure = getClientOrFailure()

  if (clientFailure) {
    return clientFailure
  }

  try {
    const { data, error } = await supabaseClient!.from(tableName).select('*')

    if (error) {
      return createFailure(error.message)
    }

    return createSuccess((data ?? []) as TRow[])
  } catch (error) {
    return createFailure(
      normalizeError(error, `Failed to fetch rows from table "${tableName}".`),
    )
  }
}

export async function getCategoryRowsByDateRange<
  TRow extends InventoryRow = InventoryRow,
>(
  tableName: string,
  dateField: keyof TRow & string,
  fromDate: string,
  toDate: string,
): ServiceResult<TRow[]> {
  const clientFailure = getClientOrFailure()

  if (clientFailure) {
    return clientFailure
  }

  try {
    const { data, error } = await supabaseClient!
      .from(tableName)
      .select('*')
      .gte(dateField, fromDate)
      .lte(dateField, toDate)
      .order(dateField, { ascending: true })

    if (error) {
      return createFailure(error.message)
    }

    return createSuccess((data ?? []) as TRow[])
  } catch (error) {
    return createFailure(
      normalizeError(
        error,
        `Failed to fetch rows by date range from table "${tableName}".`,
      ),
    )
  }
}

export async function searchCategoryRows<
  TRow extends InventoryRow = InventoryRow,
>(
  tableName: string,
  searchFields: readonly (keyof TRow & string)[],
  searchTerm: string,
): ServiceResult<TRow[]> {
  const clientFailure = getClientOrFailure()

  if (clientFailure) {
    return clientFailure
  }

  if (searchFields.length === 0) {
    return createFailure('At least one search field is required.')
  }

  const trimmedSearchTerm = searchTerm.trim()

  if (!trimmedSearchTerm) {
    return getCategoryRows<TRow>(tableName)
  }

  const escapedSearchTerm = escapeSearchTerm(trimmedSearchTerm)
  const orFilter = searchFields
    .map((field) => `${field}.ilike.%${escapedSearchTerm}%`)
    .join(',')

  try {
    const { data, error } = await supabaseClient!
      .from(tableName)
      .select('*')
      .or(orFilter)

    if (error) {
      return createFailure(error.message)
    }

    return createSuccess((data ?? []) as TRow[])
  } catch (error) {
    return createFailure(
      normalizeError(
        error,
        `Failed to search rows in table "${tableName}".`,
      ),
    )
  }
}

export async function insertRows<
  TRow extends InventoryRow = InventoryRow,
  TInsertRow extends Partial<TRow> = Partial<TRow>,
>(
  tableName: string,
  rows: readonly TInsertRow[],
): ServiceResult<TRow[]> {
  const clientFailure = getClientOrFailure()

  if (clientFailure) {
    return clientFailure
  }

  if (rows.length === 0) {
    return createSuccess([])
  }

  try {
    const { data, error } = await supabaseClient!
      .from(tableName)
      .insert([...rows] as never)
      .select('*')

    if (error) {
      return createFailure(error.message)
    }

    return createSuccess((data ?? []) as TRow[])
  } catch (error) {
    return createFailure(
      normalizeError(error, `Failed to insert rows into table "${tableName}".`),
    )
  }
}

export async function getLowStockRows<
  TRow extends InventoryRow = InventoryRow,
>(
  tableName: string,
  stockField: keyof TRow & string,
  minQuantityField: keyof TRow & string,
): ServiceResult<TRow[]> {
  const clientFailure = getClientOrFailure()

  if (clientFailure) {
    return clientFailure
  }

  try {
    const { data, error } = await supabaseClient!.from(tableName).select('*')

    if (error) {
      return createFailure(error.message)
    }

    const rows = ((data ?? []) as TRow[]).filter((row) => {
      const stockValue = toComparableNumber(row[stockField])
      const minQuantityValue = toComparableNumber(row[minQuantityField])

      if (stockValue === null || minQuantityValue === null) {
        return false
      }

      return stockValue <= minQuantityValue
    })

    return createSuccess(rows)
  } catch (error) {
    return createFailure(
      normalizeError(
        error,
        `Failed to fetch low stock rows from table "${tableName}".`,
      ),
    )
  }
}

export async function getOutOfStockRows<
  TRow extends InventoryRow = InventoryRow,
>(
  tableName: string,
  stockField: keyof TRow & string,
): ServiceResult<TRow[]> {
  const clientFailure = getClientOrFailure()

  if (clientFailure) {
    return clientFailure
  }

  try {
    const { data, error } = await supabaseClient!.from(tableName).select('*')

    if (error) {
      return createFailure(error.message)
    }

    const rows = ((data ?? []) as TRow[]).filter((row) => {
      const stockValue = toComparableNumber(row[stockField])

      if (stockValue === null) {
        return false
      }

      return stockValue <= 0
    })

    return createSuccess(rows)
  } catch (error) {
    return createFailure(
      normalizeError(
        error,
        `Failed to fetch out-of-stock rows from table "${tableName}".`,
      ),
    )
  }
}
