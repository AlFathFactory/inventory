import { useNavigate } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { CategoryHeader } from '../features/category/components/CategoryHeader'
import { CategoryModals } from '../features/category/components/CategoryModals'
import { useCategoryTableColumns } from '../features/category/components/CategoryTableColumns'
import { CategoryTableSection } from '../features/category/components/CategoryTableSection'
import { useCategoryPage } from '../features/category/hooks/useCategoryPage'
import type { CategorySummaryItem } from '../services/itemsService'
import { prefetchInventoryItem } from '../features/inventory/inventoryCache'
import { getItemDetailsRoute } from '../features/items/itemRoutes'

export function CategoryPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const model = useCategoryPage()
  const { category, categoryKey } = model

  function viewDetails(row: CategorySummaryItem) {
    if (!categoryKey) return

    navigate(getItemDetailsRoute(categoryKey, String(row.item_id)), {
      state: {
        tableName: row.table_name,
        categoryName: row.category_name,
      },
    })
  }

  const columns = useCategoryTableColumns({
    category,
    onEdit: (row) => void model.openEditModal(row),
    onDelete: model.openDeleteModal,
    onArchive: (row) => void model.handleArchiveGlove(row),
    onOperation: (row, operationType) => {
      void model.openOperationModal(row, operationType)
    },
  })

  if (!category) {
    return (
      <section>
        <div className="rounded-[28px] border border-[var(--app-border)] bg-[var(--app-panel)] px-6 py-8 shadow-[var(--app-shadow)]">
          <h1 className="text-2xl font-semibold text-slate-900">تصنيف غير موجود</h1>
        </div>
      </section>
    )
  }

  return (
    <section dir="rtl" className="space-y-6">
      <CategoryHeader
        category={category}
        isCustodyCategory={model.isCustodyCategory}
        onAddQuantity={() => model.openQuickAction('add')}
        onIssueQuantity={() => model.openQuickAction('issue')}
        onCreateItem={model.openCreateModal}
      />

      <CategoryTableSection
        category={category}
        isCustodyCategory={model.isCustodyCategory}
        columns={columns}
        onViewDetails={viewDetails}
        onPrefetchItem={(row) => {
          void prefetchInventoryItem(
            queryClient,
            row.table_name,
            String(row.item_id),
          )
        }}
        message={model.message}
        searchTerm={model.searchTerm}
        onSearchChange={model.setSearchTerm}
        rows={model.filteredRows}
        pagination={model.pagination}
        isLoading={model.isLoading}
        isPreparingOperation={model.isPreparingOperation}
        error={model.error}
      />

      <CategoryModals model={model} />
    </section>
  )
}
