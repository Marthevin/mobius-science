import { Notice } from '@/components/notice'
import { InlineNotice } from '@/components/ui/inline-notice'
import { Check, CircleAlert, ExternalLink, FolderOpen, Terminal, TriangleAlert } from 'lucide-react'
import type { TFunction } from 'i18next'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Trans, useTranslation } from 'react-i18next'

import { DiagnosticDetails } from '@/components/diagnostic-details'
import { LanguageSelect } from '@/components/LanguageControls'
import { ThemeSegmentedControl } from '@/components/ThemeControls'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger } from '@/components/ui/select'
import { errorDetail } from '@/lib/error-detail'
import { cn } from '@/lib/utils'
import { useSettingsStore } from '@/stores/settings-store'
import type { CloseActionPreference } from '../../../../shared/window-controls'
import type { CliLauncherStatus } from '../../../../shared/cli'
import type { LogFileStatus, LogWriteFailureCategory } from '../../../../shared/logs'
import { APP } from '../../../../shared/app-config'
import type {
  NotificationDesktopAvailability,
  NotificationTestResult
} from '../../../../shared/notifications'
import { MobiusAppVersionSection } from '../../../../mobius/renderer/MobiusAppVersionSection'
import { MOBIUS_CAPABILITIES } from '../../../../mobius/shared/product-capabilities'
import { AppIconSection } from './AppIconSection'
import { SettingsRow, SettingsSection, SettingsToggle } from './SettingsLayout'

type GeneralActionError = {
  action: 'cli' | 'cli-status' | 'open-log' | 'reveal-log'
  detail?: string
}

const generalActionErrorCopy = (error: GeneralActionError, t: TFunction): string => {
  switch (error.action) {
    case 'cli':
      return t('Could not update the command-line tool.')
    case 'cli-status':
      return t('Could not check the command-line tool.')
    case 'open-log':
      return t('Could not open the log file.')
    case 'reveal-log':
      return t('Could not reveal the log file.')
  }
}

const logFailureCopy = (category: LogWriteFailureCategory | null, t: TFunction): string => {
  switch (category) {
    case 'directory':
      return t('The log folder could not be created.')
    case 'inspect':
      return t('The log file could not be checked.')
    case 'rotation':
      return t('The log backups could not be rotated.')
    case 'append':
      return t('The log record could not be appended.')
    default:
      return ''
  }
}

// General app settings. Hosts the Diagnostics (log file) tools and the community/connect links. The log
// file stays on this device and is never transmitted by the app.
const GeneralPanel = (): React.JSX.Element => {
  const { t } = useTranslation()
  const isMac = window.api.platform === 'darwin'
  const [logStatus, setLogStatus] = useState<LogFileStatus | null>(null)
  const [isCheckingLog, setIsCheckingLog] = useState(true)
  const [logStatusError, setLogStatusError] = useState<string>()
  const logStatusRequest = useRef(0)

  const checkLogStatus = useCallback((): Promise<void> => {
    const request = ++logStatusRequest.current
    return Promise.resolve()
      .then(() => window.api.logs.getStatus())
      .then(
        (status) => {
          if (request !== logStatusRequest.current) return
          setLogStatus(status)
          setLogStatusError(undefined)
        },
        (error: unknown) => {
          if (request !== logStatusRequest.current) return
          setLogStatusError(errorDetail(error) ?? '')
        }
      )
      .finally(() => {
        if (request === logStatusRequest.current) setIsCheckingLog(false)
      })
  }, [])

  const refreshLogStatus = useCallback((): Promise<void> => {
    setIsCheckingLog(true)
    return checkLogStatus()
  }, [checkLogStatus])

  useEffect(() => {
    void checkLogStatus()
    window.addEventListener('focus', refreshLogStatus)
    return () => {
      window.removeEventListener('focus', refreshLogStatus)
      logStatusRequest.current += 1
    }
  }, [checkLogStatus, refreshLogStatus])
  const [message, setMessage] = useState<GeneralActionError | undefined>(undefined)
  const [isOpening, setIsOpening] = useState(false)
  const [cli, setCli] = useState<CliLauncherStatus | null>(null)
  const [isUpdatingCli, setIsUpdatingCli] = useState(false)
  const [cliError, setCliError] = useState<GeneralActionError | undefined>(undefined)
  const [notificationAvailability, setNotificationAvailability] =
    useState<NotificationDesktopAvailability>('unavailable')
  const [notificationTestResult, setNotificationTestResult] = useState<NotificationTestResult>()
  const [isTestingNotification, setIsTestingNotification] = useState(false)
  const notificationsEnabled = useSettingsStore((state) => state.notificationsEnabled)
  const setNotificationsEnabled = useSettingsStore((state) => state.setNotificationsEnabled)
  const showNotificationContent = useSettingsStore((state) => state.showNotificationContent)
  const setShowNotificationContent = useSettingsStore((state) => state.setShowNotificationContent)
  const closePreference = useSettingsStore((state) => state.closePreference)
  const setClosePreference = useSettingsStore((state) => state.setClosePreference)

  const checkCliStatus = async (): Promise<void> => {
    setIsUpdatingCli(true)

    try {
      setCli(await window.api.cli.getStatus())
      setCliError(undefined)
    } catch (error) {
      setCliError({ action: 'cli-status', detail: errorDetail(error) })
    } finally {
      setIsUpdatingCli(false)
    }
  }

  useEffect(() => {
    if (MOBIUS_CAPABILITIES.commandLineTool) {
      void window.api.cli.getStatus().then(setCli, (error) => {
        setCliError({ action: 'cli-status', detail: errorDetail(error) })
      })
    }
    const getAvailability = window.api.notifications.getDesktopAvailability
    if (getAvailability) {
      void getAvailability()
        .then(setNotificationAvailability)
        .catch(() => {
          setNotificationAvailability('unavailable')
        })
    }
  }, [])

  const logPath = logStatus?.path ?? null
  const logExists = logStatus?.existing === true

  const handleTestNotification = async (): Promise<void> => {
    const sendTest = window.api.notifications.sendTest
    if (!sendTest) return

    setIsTestingNotification(true)
    setNotificationTestResult(undefined)
    try {
      setNotificationTestResult(await sendTest())
    } catch {
      setNotificationTestResult('failed')
    } finally {
      setIsTestingNotification(false)
    }
  }

  const handleCli = async (action: 'install' | 'uninstall'): Promise<void> => {
    setIsUpdatingCli(true)
    setCliError(undefined)

    try {
      setCli(
        action === 'install' ? await window.api.cli.install() : await window.api.cli.uninstall()
      )
    } catch (error) {
      setCliError({ action: 'cli', detail: errorDetail(error) })
    } finally {
      setIsUpdatingCli(false)
    }
  }

  const handleOpenLog = async (): Promise<void> => {
    setIsOpening(true)
    setMessage(undefined)

    try {
      const result = await window.api.logs.openFile()

      if (!result.opened) {
        setMessage({ action: 'open-log', detail: result.error })
      }
    } catch (error) {
      setMessage({ action: 'open-log', detail: errorDetail(error) })
    } finally {
      await refreshLogStatus()
      setIsOpening(false)
    }
  }

  const handleReveal = async (): Promise<void> => {
    setMessage(undefined)

    try {
      const result = await window.api.logs.revealInFolder()

      if (!result.revealed) {
        setMessage({ action: 'reveal-log', detail: result.error })
      }
    } catch (error) {
      setMessage({ action: 'reveal-log', detail: errorDetail(error) })
    } finally {
      await refreshLogStatus()
    }
  }

  return (
    <div className="space-y-5 p-5">
      <MobiusAppVersionSection />

      <SettingsSection
        title={t('Appearance')}
        description={t(
          'Choose how the app looks and reads. System follows your device; the other choices stay fixed. Your selection is remembered on this device.'
        )}
        aria-label={t('Appearance')}
      >
        <SettingsRow
          label={t('Theme')}
          description={
            isMac
              ? t(
                  'Follow the system setting, or force light or dark. The Dock icon follows the resolved theme.'
                )
              : t('Follow the system setting, or force light or dark.')
          }

          className="pt-0"
        >
          <ThemeSegmentedControl />
        </SettingsRow>

        <SettingsRow
          label={t('Language')}
          description={t(
            'Follow the system setting, or pick a language. System is detected once at startup, so a change to your device language takes effect the next time the app opens.'
          )}
        >
          <LanguageSelect />
        </SettingsRow>
      </SettingsSection>

      {window.api.platform === 'win32' && window.api.window?.onCloseConfirmRequest ? (
        <SettingsSection
          title={t('Window behavior')}
          description={t('Choose what the titlebar close button does.')}
          aria-label={t('Window behavior')}
        >
          <SettingsRow
            label={t('When closing the window')}
            description={t(
              'Ask each time, keep {{appName}} running in the tray, or quit the app.',
              {
                appName: APP.name
              }
            )}
            className="pt-0"
          >
            <Select
              value={closePreference ?? 'ask'}
              onValueChange={(value) =>
                void setClosePreference(
                  value === 'ask' ? undefined : (value as CloseActionPreference)
                )
              }
            >
              <SelectTrigger aria-label={t('When closing the window')}>
                <span>
                  {closePreference === 'minimize'
                    ? t('Minimize to tray')
                    : closePreference === 'quit'
                      ? t('Quit')
                      : t('Ask every time')}
                </span>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ask">{t('Ask every time')}</SelectItem>
                <SelectItem value="minimize">{t('Minimize to tray')}</SelectItem>
                <SelectItem value="quit">{t('Quit')}</SelectItem>
              </SelectContent>
            </Select>
          </SettingsRow>
        </SettingsSection>
      ) : null}

      <SettingsSection
        title={t('Notifications')}
        description={t(
          "Get a desktop notification when a task finishes, fails, or waits for your approval while you're away from the app."
        )}
        aria-label={t('Notifications')}
      >
        <SettingsRow
          label={t('Task notifications')}
          description={t(
            'Selecting a notification brings {{appName}} back to the front and opens the task.',
            {
              appName: APP.name
            }
          )}
          className="pt-0"
        >
          <SettingsToggle
            enabled={notificationsEnabled}
            aria-label={t('Toggle task notifications')}
            onToggle={() => void setNotificationsEnabled(!notificationsEnabled)}
          />
        </SettingsRow>

        <SettingsRow
          label={t('Show task content in system notifications')}
          description={t(
            'Include task names and request details. Provider errors are always hidden.'
          )}
        >
          <SettingsToggle
            enabled={showNotificationContent}
            disabled={!notificationsEnabled}
            aria-label={t('Toggle task content in system notifications')}
            onToggle={() => void setShowNotificationContent(!showNotificationContent)}
          />
        </SettingsRow>

        <SettingsRow
          label={t('System notification status')}
          description={
            notificationAvailability === 'supported'
              ? t('System notifications are supported on this device.')
              : t('System notifications are unavailable on this device.')
          }
        >
          <div className="flex w-full flex-col items-end">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={notificationAvailability !== 'supported' || isTestingNotification}
              onClick={() => void handleTestNotification()}
            >
              {isTestingNotification ? t('Sending test…') : t('Send test notification')}
            </Button>
            {/* Reserved feedback slot: constant height, idle state only hidden, so a result
                appearing or toggling tone never shifts the button or the row. */}
            <div className="flex min-h-[30px] w-full items-start justify-end pt-1.5">
              <span
                role="status"
                className={cn(
                  'inline-flex items-center gap-[5px] rounded-lg border px-2 py-[3px] text-xs leading-[18px] font-medium whitespace-nowrap',
                  notificationTestResult === undefined
                    ? 'invisible'
                    : notificationTestResult === 'shown'
                      ? 'border-status-success-accent/30 bg-status-success-surface text-status-success-foreground dark:bg-status-success-dark-surface dark:text-status-success-dark-foreground'
                      : notificationTestResult === 'unconfirmed'
                        ? 'border-status-warning-foreground/30 bg-status-warning-surface text-status-warning-foreground dark:border-status-warning-dark-foreground/30 dark:bg-status-warning-dark-surface dark:text-status-warning-dark-foreground'
                        : 'border-status-failure-border bg-status-failure-surface text-status-failure-foreground dark:border-status-failure-dark-border dark:bg-status-failure-dark-surface dark:text-status-failure-dark-foreground'
                )}
              >
                {notificationTestResult === 'shown' || notificationTestResult === undefined ? (
                  <Check className="size-3.5" aria-hidden="true" />
                ) : notificationTestResult === 'unconfirmed' ? (
                  <TriangleAlert className="size-3.5" aria-hidden="true" />
                ) : (
                  <CircleAlert className="size-3.5" aria-hidden="true" />
                )}
                {notificationTestResult === 'failed'
                  ? t('Test notification failed.')
                  : notificationTestResult === 'unconfirmed'
                    ? t('Test notification sent, but display could not be confirmed.')
                    : notificationTestResult === 'unavailable'
                      ? t('System notifications are unavailable on this device.')
                      : t('Test notification shown.')}
              </span>
            </div>
          </div>
        </SettingsRow>

        <p className="mt-1 text-xs text-muted-foreground">
          {t(
            "Notifications only appear while you're using another app. Tasks you cancel and failures the app retries automatically stay silent. Your operating system may ask for notification permission the first time one appears."
          )}
        </p>
      </SettingsSection>

      {/* macOS uses the adaptive build/icon.icon for the installed app and binds its live Dock icon
          to Theme. Hiding the independent picker prevents two controls from racing each other. */}
      {!isMac ? <AppIconSection /> : null}

      <SettingsSection
        title={t('Diagnostics')}
        description={t(
          "View this device's runtime log — it records what the app is doing so problems can be diagnosed."
        )}
        aria-label={t('Diagnostics')}
      >
        <SettingsRow label={t('Log file')} className="pt-0">
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => void handleReveal()}
              disabled={!logExists}
            >
              <FolderOpen className="size-4" aria-hidden="true" />
              {t('Reveal')}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => void handleOpenLog()}
              disabled={isOpening || !logExists}
            >
              <ExternalLink className="size-4" aria-hidden="true" />
              {isOpening ? t('Opening…') : t('Open')}
            </Button>
          </div>
        </SettingsRow>

        <pre
          className="overflow-x-auto rounded-lg border border-border bg-muted/60 px-3 py-2.5 font-mono text-xs text-foreground"
          aria-label={t('Log file path')}
        >
          {logPath ??
            (isCheckingLog
              ? t('Loading…')
              : logStatusError !== undefined
                ? '—'
                : t('Not available yet.'))}
        </pre>

        {logStatus &&
        logPath &&
        !logExists &&
        !isCheckingLog &&
        logStatusError === undefined &&
        !logStatus.lastFailureCategory ? (
          <p className="mt-2 text-xs text-muted-foreground" role="status">
            {t('Not available yet.')}
          </p>
        ) : null}

        {logStatusError !== undefined ? (
          <Notice
            inline
            level="error"
            role="alert"
            className="mt-2"
            description={t('Could not check the log file.')}
            primaryButton={{
              label: isCheckingLog ? t('Loading…') : t('Check again'),
              disabled: isCheckingLog,
              onClick: () => void refreshLogStatus()
            }}
          >
            <DiagnosticDetails detail={logStatusError} />
          </Notice>
        ) : null}

        {logStatus && (logStatus.lastWriteSucceeded === false || logStatus.lastFailureCategory) ? (
          <InlineNotice level="error" className="mt-2" role="status">
            {logStatus.lastWriteSucceeded === false
              ? t('The app could not write to the log file during its most recent attempt.')
              : null}{' '}
            {logFailureCopy(logStatus.lastFailureCategory, t)}
          </InlineNotice>
        ) : null}

        {message ? (
          <Notice
            inline
            level="error"
            role="alert"
            className="mt-2"
            description={generalActionErrorCopy(message, t)}
          >
            <DiagnosticDetails detail={message.detail} />
          </Notice>
        ) : null}
      </SettingsSection>

      {MOBIUS_CAPABILITIES.commandLineTool ? (
        <SettingsSection
          title={t('Command line tool')}
          description={
            <Trans
              i18nKey="Install the <code>open-science</code> command so you can start, stop, and check the backend from a terminal, then use it entirely from your browser."
              components={{ code: <code className="font-mono" /> }}
            />
          }
          aria-label={t('Command line tool')}
        >
          <SettingsRow
            label={t('open-science')}
            controlClassName="w-auto justify-self-end"
            className="pt-0"
          >
            <Button
              type="button"
              variant="outline"
              onClick={() => void handleCli(cli?.installed ? 'uninstall' : 'install')}
              disabled={isUpdatingCli || cli === null}
            >
              <Terminal className="size-4" aria-hidden="true" />
              {isUpdatingCli
                ? t('Working…')
                : cli?.installed
                  ? t('Uninstall command')
                  : t('Install command')}
            </Button>
          </SettingsRow>

          {cli?.installed ? (
            <pre
              className="overflow-x-auto rounded-lg border border-border bg-muted/60 px-3 py-2.5 font-mono text-xs text-foreground"
              aria-label={t('Command line tool path')}
            >
              {cli.target}
            </pre>
          ) : null}

          {cli?.installed && cli.pathHint ? (
            <p className="mt-2 text-xs text-muted-foreground">{cli.pathHint}</p>
          ) : null}

          {cliError ? (
            <Notice
              inline
              level="error"
              role="alert"
              className="mt-2"
              description={generalActionErrorCopy(cliError, t)}
              primaryButton={
                cliError.action === 'cli-status'
                  ? {
                      label: isUpdatingCli ? t('Checking…') : t('Check again'),
                      disabled: isUpdatingCli,
                      onClick: () => void checkCliStatus()
                    }
                  : undefined
              }
            >
              <DiagnosticDetails detail={cliError.detail} />
            </Notice>
          ) : null}

          <p className="mt-3 text-xs text-muted-foreground">
            <Trans
              i18nKey="Once installed, run <code>open-science start</code> to launch the backend and open the authenticated URL, then <code>open-science stop</code> to shut it down. <code>status</code> and <code>url</code> are also available."
              components={{ code: <code className="font-mono" /> }}
            />
          </p>
        </SettingsSection>
      ) : null}
    </div>
  )
}

export { GeneralPanel }
