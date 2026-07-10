import { DashboardTableSection } from '../features/dashboard/components/DashboardTableSection'
import {
  operationTypeOptions,
  operationsCatalog,
} from '../features/operations/data/operationsDemo'
import { OperationTypeCard } from '../features/operations/components/OperationTypeCard'
import { OperationsForm } from '../features/operations/components/OperationsForm'
import { OperationsRecentTable } from '../features/operations/components/OperationsRecentTable'
import { useOperationsPage } from '../features/operations/hooks/useOperationsPage'

export function OperationsPage() {
  const {
    selectedOperation,
    setSelectedOperation,
    formValues,
    itemOptions,
    currentBalance,
    nextBalance,
    recentOperations,
    updateField,
    resetForm,
    saveOperation,
  } = useOperationsPage()

  return (
    <section className="space-y-8">
      <div className="space-y-4 text-right">
        <h2 className="text-[1.9rem] font-bold tracking-tight text-slate-900">
          تنفيذ عملية مخزون
        </h2>

        <div className="grid gap-5 md:grid-cols-3">
          {operationTypeOptions.map((option) => (
            <OperationTypeCard
              key={option.id}
              option={option}
              isActive={selectedOperation === option.id}
              onClick={() => setSelectedOperation(option.id)}
            />
          ))}
        </div>
      </div>

      <OperationsForm
        selectedOperation={selectedOperation}
        projectOptions={operationsCatalog.projects}
        categoryOptions={operationsCatalog.categories}
        itemOptions={itemOptions}
        formValues={formValues}
        currentBalance={currentBalance}
        nextBalance={nextBalance}
        onUpdateField={updateField}
        onCancel={resetForm}
        onSave={saveOperation}
      />

      <DashboardTableSection title="آخر العمليات">
        <OperationsRecentTable rows={recentOperations} />
      </DashboardTableSection>
    </section>
  )
}
