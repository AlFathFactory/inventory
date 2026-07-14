export type ExpiryAlertStatus = 'expiring' | 'expired'

const EXPIRY_WARNING_DAYS = 30
const DAY_IN_MILLISECONDS = 24 * 60 * 60 * 1000

function toUtcDay(value: string): number | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value.trim())

  if (!match) {
    return null
  }

  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  const timestamp = Date.UTC(year, month - 1, day)
  const date = new Date(timestamp)

  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null
  }

  return timestamp
}

export function getExpiryAlertStatus(
  expireDate: string,
  today = new Date(),
): ExpiryAlertStatus | null {
  const expiryDay = toUtcDay(expireDate)

  if (expiryDay === null) {
    return null
  }

  const todayDay = Date.UTC(
    today.getFullYear(),
    today.getMonth(),
    today.getDate(),
  )

  if (expiryDay < todayDay) {
    return 'expired'
  }

  const warningLimit = todayDay + EXPIRY_WARNING_DAYS * DAY_IN_MILLISECONDS
  return expiryDay <= warningLimit ? 'expiring' : null
}
