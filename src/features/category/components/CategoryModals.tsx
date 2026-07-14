import { ItemCreateModal } from '../../item-creation/ItemCreateModal'
import { ItemSelectionModal } from '../../item-creation/ItemSelectionModal'
import { EditItemModal } from '../../item-edit/EditItemModal'
import { InventoryOperationModal } from '../../inventory-operations/InventoryOperationModal'
import type { ItemDetails } from '../../../services/itemsService'
import type { CategoryPageModel } from '../hooks/useCategoryPage'
import { PermanentDeleteModal } from './PermanentDeleteModal'

export function CategoryModals({ model }: { model: CategoryPageModel }) {
  const { category } = model
  if (!category) return null

  return (
    <>
      {model.selectedItemDetails && model.selectedItemId ? (
        <InventoryOperationModal
          category={category}
          itemId={model.selectedItemId}
          itemData={model.selectedItemDetails as Record<string, unknown> & ItemDetails}
          operationType={model.operationType}
          form={model.operationForm}
          formErrors={model.operationFormErrors}
          isSubmitting={model.isSubmitting}
          onClose={model.closeOperationModal}
          onFieldChange={model.updateOperationFormField}
          onSubmit={model.handleOperationSubmit}
        />
      ) : null}

      {model.quickAction ? (
        <ItemSelectionModal
          items={model.rows}
          title={model.quickAction === 'add' ? 'إضافة على صنف موجود' : 'صرف من صنف موجود'}
          description={model.quickAction === 'add'
            ? 'اختر صنفاً موجوداً لإضافة كمية عليه، أو أضف صنفاً جديداً.'
            : 'اختر الصنف الذي تريد تنفيذ الصرف عليه.'}
          emptyMessage={model.quickAction === 'add'
            ? 'لا توجد أصناف حالياً. يمكنك إضافة صنف جديد أولاً.'
            : 'لا توجد أصناف متاحة للصرف في هذا القسم.'}
          confirmLabel={model.quickAction === 'add' ? 'إضافة' : 'صرف'}
          createLabel={model.quickAction === 'add' && category.createFields?.length
            ? 'صنف جديد'
            : undefined}
          onClose={model.closeQuickActionModal}
          onCreateNew={model.quickAction === 'add' && category.createFields?.length
            ? model.openCreateModal
            : undefined}
          onSelectItem={(item) => void model.openOperationModal(
            item,
            model.quickAction === 'add' ? 'add' : 'issue',
          )}
        />
      ) : null}

      {model.isCreateModalOpen ? (
        <ItemCreateModal
          category={category}
          form={model.createForm}
          formErrors={model.createFormErrors}
          isSubmitting={model.isCreateSubmitting}
          onClose={model.closeCreateModal}
          onFieldChange={model.updateCreateFormField}
          onSubmit={model.handleCreateSubmit}
        />
      ) : null}

      {model.editingItem ? (
        <EditItemModal
          category={category}
          itemId={String(model.editingItem.item_id)}
          itemData={model.editingItem}
          onClose={model.closeEditModal}
          onSuccess={model.handleEditSuccess}
        />
      ) : null}

      {model.deletingItem ? (
        <PermanentDeleteModal
          isDeleting={model.isDeleting}
          onClose={model.closeDeleteModal}
          onConfirm={model.handleDeleteConfirm}
        />
      ) : null}
    </>
  )
}
