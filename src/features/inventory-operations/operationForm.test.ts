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
    expect(validateOperationQuantity('12.5', 'adjust')).toBeNull()
    expect(validateOperationQuantity('-1', 'adjust')).not.toBeNull()
  })

  it.each(['NaN', 'not-a-number', 'Infinity'])('rejects non-finite input %s', (value) => {
    expect(validateOperationQuantity(value, 'add')).not.toBeNull()
  })

  it.each(['', '   '])('rejects empty input', (value) => {
    expect(validateOperationQuantity(value, 'adjust')).not.toBeNull()
  })

  it('does not require or accept a manually entered project', () => {
    const form = {
      ...createInitialOperationFormState({ project_name: null, stock_balance: 10 }),
      quantity: '1',
      supplierName: 'مورد',
    }

    expect(validateOperationForm({
      details: { project_name: null, stock_balance: 10 },
      form,
      operationType: 'add',
    })).toEqual({ isValid: true, errors: {} })
    expect('projectName' in form).toBe(false)
  })
})
