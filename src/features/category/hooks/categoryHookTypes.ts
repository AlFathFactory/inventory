import type { Dispatch, SetStateAction } from 'react'
import type { CategoryMessage } from '../types'

export type SetCategoryMessage = Dispatch<SetStateAction<CategoryMessage>>
export type RefreshCategoryRows = () => Promise<void>
