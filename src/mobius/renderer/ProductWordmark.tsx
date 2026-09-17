import * as React from 'react'

import { PRODUCT } from '../shared/product-config'

type ProductWordmarkProps = Readonly<{
  className?: string
}>

export const ProductWordmark = ({ className }: ProductWordmarkProps): React.JSX.Element => (
  <span className={className}>{PRODUCT.displayName}</span>
)
