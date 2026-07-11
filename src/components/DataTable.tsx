import type { Key, ReactNode } from 'react'

type DataTableColumn<Row> = {
  id: string
  header: ReactNode
  renderCell: (row: Row, index: number) => ReactNode
  headerClassName?: string
  cellClassName?: string
}

type DataTableProps<Row> = {
  columns: DataTableColumn<Row>[]
  rows: Row[]
  getRowKey: (row: Row, index: number) => Key
  stickyHeader?: boolean
  maxHeightClassName?: string
  tableClassName?: string
  theadClassName?: string
  tbodyClassName?: string
  rowClassName?: string | ((row: Row, index: number) => string)
  onRowClick?: (row: Row, index: number) => void
}

function joinClassNames(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(' ')
}

export type { DataTableColumn }

export function DataTable<Row>({
  columns,
  rows,
  getRowKey,
  stickyHeader = false,
  maxHeightClassName,
  tableClassName,
  theadClassName,
  tbodyClassName,
  rowClassName,
  onRowClick,
}: DataTableProps<Row>) {
  const headerCellClassName = stickyHeader
    ? 'sticky top-0 z-10 bg-[var(--app-panel-soft)]'
    : ''

  return (
    <div className={joinClassNames('overflow-x-auto', maxHeightClassName)}>
      <table
        className={joinClassNames(
          'min-w-full text-right',
          tableClassName,
        )}
      >
        <thead
          className={joinClassNames(
            'bg-[var(--app-panel-soft)] text-sm font-semibold text-slate-800',
            theadClassName,
          )}
        >
          <tr>
            {columns.map((column) => (
              <th
                key={column.id}
                className={joinClassNames(
                  headerCellClassName,
                  'whitespace-nowrap px-6 py-4',
                  column.headerClassName,
                )}
              >
                {column.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody
          className={joinClassNames(
            'divide-y divide-slate-100 text-sm text-slate-700',
            tbodyClassName,
          )}
        >
          {rows.map((row, index) => (
            <tr
              key={getRowKey(row, index)}
              onClick={onRowClick ? () => onRowClick(row, index) : undefined}
              className={joinClassNames(
                typeof rowClassName === 'function'
                  ? rowClassName(row, index)
                  : rowClassName,
                onRowClick ? 'cursor-pointer' : '',
              )}
            >
              {columns.map((column) => (
                <td
                  key={column.id}
                  className={joinClassNames(
                    'px-6 py-3.5',
                    column.cellClassName,
                  )}
                >
                  {column.renderCell(row, index)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
