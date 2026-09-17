import * as React from 'react'
import { useTranslation } from 'react-i18next'

import { AppLogo } from '@/components/AppLogo'
import { SettingsRow, SettingsSection } from '@/pages/settings/SettingsLayout'
import { license, version } from '../../../package.json'
import { PRODUCT } from '../shared/product-config'

export const MobiusAppVersionSection = (): React.JSX.Element => {
  const { t } = useTranslation()

  return (
    <SettingsSection title={t('About')} aria-label={t('App version')}>
      <SettingsRow
        label={
          <div className="flex min-w-0 items-center gap-3">
            <AppLogo className="size-12 rounded-lg" />
            <div className="min-w-0">
              <p className="flex items-baseline gap-2">
                <span className="text-sm font-semibold text-foreground">{PRODUCT.displayName}</span>
                <span className="text-xs text-muted-foreground tabular-nums">v{version}</span>
              </p>
              <p className="mt-0.5 text-xs font-normal text-muted-foreground">
                {PRODUCT.copyright}
              </p>
            </div>
          </div>
        }
        className="pt-0 sm:grid-cols-[minmax(0,1fr)_auto]"
        controlClassName="w-auto justify-self-end"
      >
        <span className="rounded-md border border-border bg-muted/60 px-2.5 py-1.5 text-xs font-medium text-muted-foreground">
          {license}
        </span>
      </SettingsRow>
    </SettingsSection>
  )
}
