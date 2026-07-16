import { createContext, useContext, useMemo, useState, type ReactNode } from 'react'
import { accessUsers, type AccessUser } from '../../config/accessControl'

const storageKey = 'inventory-access-user'

type AccessContextValue = {
  user: AccessUser | null
  unlock: (password: string) => boolean
  lock: () => void
}

const AccessContext = createContext<AccessContextValue | null>(null)

function getStoredUser() {
  const userName = sessionStorage.getItem(storageKey)
  return accessUsers.find((user) => user.name === userName) ?? null
}

export function AccessProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AccessUser | null>(getStoredUser)

  const value = useMemo<AccessContextValue>(
    () => ({
      user,
      unlock(password) {
        const matchedUser = accessUsers.find((item) => item.password === password)
        if (!matchedUser) return false
        sessionStorage.setItem(storageKey, matchedUser.name)
        setUser(matchedUser)
        return true
      },
      lock() {
        sessionStorage.removeItem(storageKey)
        setUser(null)
      },
    }),
    [user],
  )

  return <AccessContext.Provider value={value}>{children}</AccessContext.Provider>
}

export function useAccess() {
  const context = useContext(AccessContext)
  if (!context) throw new Error('useAccess must be used inside AccessProvider')
  return context
}
