import { describe, expect, it } from 'vitest'
import {
  createInitialOperationFormState,
  validateOperationForm,
  validateOperationQuantity,
} from './operationForm'

describe('validateOperationQuantity', () => {
  it.each(['add', 'issue'] as const)('%s requires a quantity greater than zero', (type) => {
    expect(validateOperationQuantity('0', type)).not.toBeNull()
    expect(validateOperationQuantity('-1', type)).not.toBeNull()
    expect(validateOperationQuantity('1', type)).toBeNull()
  })

  it('allows a non-negative adjustment balance', () => {
    expect(validateOperationQuantity('0', 'adjust')).toBeNull()
    expect(validateOperationQuantity('12', 'adjust')).toBeNull()
    expect(validateOperationQuantity('-1', 'adjust')).not.toBeNull()
  })

  it.each(['add', 'issue', 'adjust'] as const)('%s rejects decimal quantities', (type) => {
    expect(validateOperationQuantity('0.5', type)).not.toBeNull()
    expect(validateOperationQuantity('12.5', type)).not.toBeNull()
  })

  it.each(['NaN', 'not-a-number', 'Infinity'])('rejects non-finite input %s', (value) => {
    expect(validateOperationQuantity(value, 'add')).not.toBeNull()
  })

  it.each(['', '   '])('rejects empty input', (value) => {
    expect(validateOperationQuantity(value, 'adjust')).not.toBeNull()
  })

  it('does not require a project for non-raw-material operations', () => {
    const form = {
      ...createInitialOperationFormState({ project_name: null, stock_balance: 10 }),
      quantity: '1',
      supplierName: 'مورد',
    }

    expect(validateOperationForm({
      details: { project_name: null, stock_balance: 10 },
      form,
      operationType: 'add',
      tableName: 'consumables',
    })).toEqual({ isValid: true, errors: {} })
  })

  it('requires a project id and active supplier selection for raw-material additions', () => {
    const form = {
      ...createInitialOperationFormState({ stock_balance: 10 }),
      quantity: '1',
      supplierName: 'مورد مكتوب فقط',
    }

    const result = validateOperationForm({
      details: { stock_balance: 10 },
      form,
      operationType: 'add',
      tableName: 'raw_materials',
    })

    expect(result.errors.projectId).toBe('المشروع مطلوب')
    expect(result.errors.supplierName).toBe('المورد مطلوب لعملية الإضافة')
  })

  it('accepts a project-aware raw-material issue with one selected employee', () => {
    const form = {
      ...createInitialOperationFormState({ stock_balance: 10 }),
      quantity: '4',
      projectId: 'project-1',
      employeeId: 'employee-1',
      issuedTo: 'موظف أول',
    }

    expect(validateOperationForm({
      details: { stock_balance: 10 },
      form,
      operationType: 'issue',
      tableName: 'raw_materials',
    })).toEqual({ isValid: true, errors: {} })
  })

  it('requires at least two employees for a group issue', () => {
    const form = {
      ...createInitialOperationFormState({ stock_balance: 50 }),
      quantity: '10',
      recipientMode: 'multiple' as const,
      employeeIds: [{ id: 'employee-1', name: 'موظف أول' }],
    }

    const result = validateOperationForm({
      details: { stock_balance: 50 },
      form,
      operationType: 'issue',
    })

    expect(result.isValid).toBe(false)
    expect(result.errors.issuedTo).toBeTruthy()
  })

  it('accepts a group issue with two distinct selected employees', () => {
    const form = {
      ...createInitialOperationFormState({ stock_balance: 50 }),
      quantity: '10',
      recipientMode: 'multiple' as const,
      employeeIds: [
        { id: 'employee-1', name: 'موظف أول' },
        { id: 'employee-2', name: 'موظف ثانٍ' },
      ],
    }

    expect(validateOperationForm({
      details: { stock_balance: 50 },
      form,
      operationType: 'issue',
    })).toEqual({ isValid: true, errors: {} })
  })
})
