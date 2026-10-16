export const presentStartupError = (
  message: string,
  showDialog: () => void,
  argv: readonly string[] = process.argv
): void => {
  if (argv.includes('--open-science-headless')) console.error(message)
  else showDialog()
}
