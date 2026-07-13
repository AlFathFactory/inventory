import { describe, expect, it } from 'vitest'
import { validateOperationQuantity } from './operationForm'

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
})
