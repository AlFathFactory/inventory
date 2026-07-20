import * as XLSX from 'xlsx'

const ARABIC_DIGITS = '٠١٢٣٤٥٦٧٨٩'
const PERSIAN_DIGITS = '۰۱۲۳۴۵۶۷۸۹'

export function normalizeArabicDigits(value: unknown): string {
  return String(value ?? '')
    .replace(/[٠-٩]/g, (digit) => String(ARABIC_DIGITS.indexOf(digit)))
    .replace(/[۰-۹]/g, (digit) => String(PERSIAN_DIGITS.indexOf(digit)))
}

export function displayExcelText(value: unknown): string {
  return normalizeArabicDigits(value)
    .replace(/\u00a0/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export function normalizeExcelText(value: unknown): string {
  return displayExcelText(value)
    .replace(/ـ/g, '')
    .replace(/[أإآ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .toLocaleLowerCase('en-US')
}

export function normalizeMatchText(value: unknown): string {
  return normalizeExcelText(value).replace(/ة/g, 'ه')
}

export function normalizeHeader(value: unknown): string {
  return normalizeMatchText(value).replace(/[\s_\-–—:؛،,.()/\\]+/g, '')
}

export function normalizeSheetName(value: unknown): string {
  return normalizeHeader(value)
}

export function normalizeKeyPart(value: unknown): string {
  return normalizeExcelText(value)
    .replace(/[|]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export function parseExcelNumber(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null
  if (value === null || value === undefined || value instanceof Date) return null

  let text = normalizeArabicDigits(value).trim()
  if (!text || /^[-–—]+$/.test(text)) return null

  const negativeParentheses = /^\(.*\)$/.test(text)
  text = text
    .replace(/^\((.*)\)$/, '$1')
    .replace(/[٬,،\s]/g, '')
    .replace(/٫/g, '.')

  const parsed = Number(text)
  if (!Number.isFinite(parsed)) return null
  return negativeParentheses ? -parsed : parsed
}

function toIsoDate(year: number, month: number, day: number): string | null {
  if (year < 1900 || year > 2200 || month < 1 || month > 12 || day < 1 || day > 31) {
    return null
  }
  const date = new Date(Date.UTC(year, month - 1, day))
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null
  }
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

function normalizeYear(value: number) {
  if (value === 206) return 2026
  if (value < 100) return 2000 + value
  return value
}

export function parseExcelDate(value: unknown, formattedValue?: unknown): string | null {
  const candidates = [formattedValue, value]
  for (const candidate of candidates) {
    if (candidate === null || candidate === undefined || candidate === '') continue

    if (candidate instanceof Date && !Number.isNaN(candidate.getTime())) {
      return toIsoDate(candidate.getFullYear(), candidate.getMonth() + 1, candidate.getDate())
    }

    if (typeof candidate === 'number' && candidate > 20_000) {
      const parsed = XLSX.SSF.parse_date_code(candidate)
      if (parsed) return toIsoDate(parsed.y, parsed.m, parsed.d)
    }

    const text = normalizeArabicDigits(candidate).trim()
    const isoMatch = text.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/)
    if (isoMatch) return toIsoDate(Number(isoMatch[1]), Number(isoMatch[2]), Number(isoMatch[3]))

    const dateMatch = text.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})$/)
    if (dateMatch) {
      const first = Number(dateMatch[1])
      const second = Number(dateMatch[2])
      const year = normalizeYear(Number(dateMatch[3]))
      const dayFirst = toIsoDate(year, second, first)
      if (first > 12 || second <= 12) return dayFirst
      return toIsoDate(year, first, second) ?? dayFirst
    }
  }
  return null
}

export function formatJulyDate(day: number): string {
  return `2026-07-${String(day).padStart(2, '0')}`
}
