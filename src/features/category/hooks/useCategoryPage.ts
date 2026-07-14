import { useState } from 'react'
import { useParams } from 'react-router-dom'
import {
  categoryConfig,
  type CategoryDefinition,
  type CategoryKey,
} from '../../../config/categoryConfig'
import { isCustodyTable } from '../../../services/itemsService'
import type { CategoryMessage } from '../types'
import { useCategoryCreate } from './useCategoryCreate'
import { useCategoryDelete } from './useCategoryDelete'
import { useCategoryEdit } from './useCategoryEdit'
import { useCategoryOperation } from './useCategoryOperation'
import { useCategoryRows } from './useCategoryRows'

function isCategoryKey(value: string): value is CategoryKey {
  return value in categoryConfig
}

export function useCategoryPage() {
  const { categoryKey } = useParams()
  const [message, setMessage] = useState<CategoryMessage>(null)
  const category: CategoryDefinition | null =
    categoryKey && isCategoryKey(categoryKey)
      ? (categoryConfig[categoryKey] as CategoryDefinition)
      : null

  const rowState = useCategoryRows(category)
  const operation = useCategoryOperation({
    category,
    refreshRows: rowState.refreshRows,
    setMessage,
  })
  const creation = useCategoryCreate({
    category,
    refreshRows: rowState.refreshRows,
    setMessage,
    closeQuickAction: operation.closeQuickAction,
  })
  const edit = useCategoryEdit({
    category,
    refreshRows: rowState.refreshRows,
    setMessage,
  })
  const deletion = useCategoryDelete({
    category,
    refreshRows: rowState.refreshRows,
    setMessage,
  })

  return {
    categoryKey,
    category,
    isCustodyCategory: Boolean(category && isCustodyTable(category.table)),
    rows: rowState.rows,
    filteredRows: rowState.filteredRows,
    pagination: rowState.pagination,
    isLoading: rowState.isLoading,
    error: rowState.error,
    searchTerm: rowState.searchTerm,
    setSearchTerm: rowState.setSearchTerm,
    message,
    isPreparingOperation: operation.isPreparing || edit.isPreparing,
    quickAction: operation.quickAction,
    openQuickAction: operation.openQuickAction,
    closeQuickActionModal: operation.closeQuickAction,
    selectedItemDetails: operation.itemDetails,
    selectedItemId: operation.selectedItemId,
    operationType: operation.operationType,
    operationForm: operation.form,
    operationFormErrors: operation.formErrors,
    isSubmitting: operation.isSubmitting,
    openOperationModal: operation.open,
    closeOperationModal: operation.close,
    updateOperationFormField: operation.updateField,
    handleOperationSubmit: operation.submit,
    isCreateModalOpen: creation.isOpen,
    createForm: creation.form,
    createFormErrors: creation.formErrors,
    isCreateSubmitting: creation.isSubmitting,
    openCreateModal: creation.open,
    closeCreateModal: creation.close,
    updateCreateFormField: creation.updateField,
    handleCreateSubmit: creation.submit,
    editingItem: edit.editingItem,
    closeEditModal: edit.close,
    openEditModal: edit.open,
    handleEditSuccess: edit.handleSuccess,
    handleArchiveGlove: edit.archiveGlove,
    deletingItem: deletion.deletingItem,
    isDeleting: deletion.isDeleting,
    openDeleteModal: deletion.open,
    closeDeleteModal: deletion.close,
    handleDeleteConfirm: deletion.confirm,
  }
}

export type CategoryPageModel = ReturnType<typeof useCategoryPage>
