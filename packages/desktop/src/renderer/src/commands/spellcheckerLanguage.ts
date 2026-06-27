import bus from '../bus'
import notice from '@/services/notification'
import { delay } from '@/util'
import { SpellChecker } from '@/spellchecker'
import { getLanguageName } from '@/spellchecker/languageMap'
import getCommandDescriptionById from './descriptions'
import { t } from '../i18n'
import { usePreferencesStore } from '@/store/preferences'
import type { PreferencesState } from '@/store/preferences'

interface SpellcheckerSubcommand {
  id: string
  description: string | null
  value: string
}

// Command to switch the spellchecker language(s)
class SpellcheckerLanguageCommand {
  id: string
  description: string
  placeholder: string
  shortcut: string | null
  spellchecker: SpellChecker
  subcommands: SpellcheckerSubcommand[]
  subcommandSelectedIndex: number

  constructor(spellchecker: SpellChecker) {
    this.id = 'spellchecker.switch-language'
    this.description = getCommandDescriptionById('spellchecker.switch-language')
    this.placeholder = t('commandPalette.placeholders.selectLanguage')
    this.shortcut = null

    this.spellchecker = spellchecker

    this.subcommands = []
    this.subcommandSelectedIndex = -1
  }

  run = async(): Promise<void> => {
    const langs = await SpellChecker.getAvailableDictionaries()

    const finalLangs: string[] = langs.length > 0 ? langs : ['en-US']
    const active = this.spellchecker.lang

    this.subcommands = finalLangs.map((lang) => {
      const isActive = active.includes(lang)
      return {
        id: `spellchecker.switch-language-id-${lang}`,
        description: getLanguageName(lang)
          ? `${isActive ? '✓ ' : '  '}${getLanguageName(lang)}`
          : `${isActive ? '✓ ' : '  '}${lang}`,
        value: lang
      }
    })
    // Don't preselect any index (multi-select toggles)
    this.subcommandSelectedIndex = -1
  }

  execute = async(): Promise<void> => {
    await delay(100)
    bus.emit('show-command-palette', this)
  }

  executeSubcommand = async(id: string): Promise<void> => {
    const command = this.subcommands.find((cmd) => cmd.id === id)
    if (!command) return

    if (!this.spellchecker.isEnabled) {
      notice.notify({
        title: 'Spelling',
        type: 'warning',
        message: 'Cannot change language because spellchecker is disabled.'
      })
      return
    }

    const current = [...this.spellchecker.lang]
    const idx = current.indexOf(command.value)

    if (idx >= 0) {
      // Remove if already active (toggle off)
      current.splice(idx, 1)
    } else {
      // Add if not active (toggle on)
      current.push(command.value)
    }

    // If nothing selected, fall back to en-US
    const updated = current.length > 0 ? current : ['en-US']

    // Update store
    const store = usePreferencesStore()
    store.SET_SINGLE_PREFERENCE({ type: 'spellcheckerLanguages' as keyof PreferencesState, value: updated })

    // Apply to spell checker
    await this.spellchecker.setLanguages(updated)
  }

  unload = (): void => {
    this.subcommands = []
  }
}

export default SpellcheckerLanguageCommand
