import { ItemEditorPanel } from '../features/items/components/ItemEditorPanel'
import { ItemsActionCard } from '../features/items/components/ItemsActionCard'
import { ItemsFilterBar } from '../features/items/components/ItemsFilterBar'
import { ItemsTable } from '../features/items/components/ItemsTable'
import { itemActionOptions } from '../features/items/data/itemsDemo'
import { useItemsPage } from '../features/items/hooks/useItemsPage'

export function ItemsPage() {
  const {
    selectedAction,
    setSelectedAction,
    filters,
    editorValues,
    filteredRows,
    updateFilter,
    updateEditor,
    resetEditor,
    saveItem,
  } = useItemsPage()

  return (
    <section className="space-y-8">
      <ItemsFilterBar filters={filters} onUpdateFilter={updateFilter} />

      <div className="overflow-hidden rounded-[28px] border border-[var(--app-border)] bg-[var(--app-panel)] shadow-[var(--app-shadow)]">
        <ItemsTable rows={filteredRows} />
      </div>

      <div className="grid gap-8 lg:grid-cols-[256px_minmax(0,1fr)]">
        <div className="space-y-5">
          {itemActionOptions.map((option) => (
            <ItemsActionCard
              key={option.id}
              option={option}
              isActive={selectedAction === option.id}
              onClick={() => setSelectedAction(option.id)}
            />
          ))}
        </div>

        <ItemEditorPanel
          selectedAction={selectedAction}
          editorValues={editorValues}
          onUpdateEditor={updateEditor}
          onCancel={resetEditor}
          onSave={saveItem}
        />
      </div>
    </section>
  )
}
