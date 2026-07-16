import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react'
import { createPortal } from 'react-dom'
import type { InventoryOperationType } from '../../../services/operationsService'

type CategoryActionsDropdownProps = {
  onEdit: () => void
  onDelete: () => void
  onOperation: (operationType: InventoryOperationType) => void
}

type MenuAction = {
  label: string
  className: string
  onClick: () => void
}

export function CategoryActionsDropdown({
  onEdit,
  onDelete,
  onOperation,
}: CategoryActionsDropdownProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [menuStyle, setMenuStyle] = useState<CSSProperties | null>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  useLayoutEffect(() => {
    if (!isOpen || !buttonRef.current) return

    const rect = buttonRef.current.getBoundingClientRect()
    const openUpward = window.innerHeight - rect.bottom < 230 && rect.top > 230

    setMenuStyle({
      right: window.innerWidth - rect.right,
      ...(openUpward
        ? { bottom: window.innerHeight - rect.top + 6 }
        : { top: rect.bottom + 6 }),
    })
  }, [isOpen])

  useEffect(() => {
    if (!isOpen) return

    const closeOnOutsideClick = (event: MouseEvent) => {
      const target = event.target as Node
      if (!buttonRef.current?.contains(target) && !menuRef.current?.contains(target)) {
        setIsOpen(false)
      }
    }
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsOpen(false)
        buttonRef.current?.focus()
      }
    }
    const closeMenu = () => setIsOpen(false)

    document.addEventListener('mousedown', closeOnOutsideClick)
    document.addEventListener('keydown', closeOnEscape)
    window.addEventListener('resize', closeMenu)
    window.addEventListener('scroll', closeMenu, true)

    return () => {
      document.removeEventListener('mousedown', closeOnOutsideClick)
      document.removeEventListener('keydown', closeOnEscape)
      window.removeEventListener('resize', closeMenu)
      window.removeEventListener('scroll', closeMenu, true)
    }
  }, [isOpen])

  const actions: MenuAction[] = [
    { label: 'تعديل الصنف', className: 'text-violet-700 hover:bg-violet-50', onClick: onEdit },
    { label: 'صرف', className: 'text-orange-700 hover:bg-orange-50', onClick: () => onOperation('issue') },
    { label: 'إضافة', className: 'text-emerald-700 hover:bg-emerald-50', onClick: () => onOperation('add') },
    { label: 'جرد', className: 'text-blue-700 hover:bg-blue-50', onClick: () => onOperation('adjust') },
    { label: 'حذف', className: 'text-red-700 hover:bg-red-50', onClick: onDelete },
  ]

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={isOpen}
        onClick={(event) => {
          event.stopPropagation()
          setIsOpen((current) => !current)
        }}
        className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50"
      >
        الإجراءات
        <span aria-hidden="true" className={`text-[10px] transition ${isOpen ? 'rotate-180' : ''}`}>▼</span>
      </button>

      {isOpen && menuStyle ? createPortal(
        <div
          ref={menuRef}
          role="menu"
          dir="rtl"
          style={menuStyle}
          className="fixed z-50 min-w-40 overflow-hidden rounded-2xl border border-slate-200 bg-white p-1.5 text-right shadow-xl"
          onClick={(event) => event.stopPropagation()}
        >
          {actions.map((action) => (
            <button
              key={action.label}
              type="button"
              role="menuitem"
              onClick={() => {
                setIsOpen(false)
                action.onClick()
              }}
              className={`block w-full rounded-xl px-3 py-2 text-right text-sm font-semibold transition ${action.className}`}
            >
              {action.label}
            </button>
          ))}
        </div>,
        document.body,
      ) : null}
    </>
  )
}
