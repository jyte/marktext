import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest'

// The notification service renders a DOM toast from a raw HTML template; stub
// it so we can observe `notify` without touching the DOM.
vi.mock('@/services/notification', () => ({
  default: { notify: vi.fn(), name: 'notify' }
}))

// Stub the Pinia store so executeSubcommand can call SET_SINGLE_PREFERENCE.
const mockSetPreference = vi.fn()
vi.mock('@/store/preferences', () => ({
  usePreferencesStore: () => ({
    SET_SINGLE_PREFERENCE: mockSetPreference
  })
}))

import SpellcheckerLanguageCommand from '@/commands/spellcheckerLanguage'
import { SpellChecker } from '@/spellchecker'
import bus from '@/bus'
import notice from '@/services/notification'

// Minimal stand-in for the renderer SpellChecker instance the command reads.
// `lang` is a mutable getter so the command palette's toggle logic sees
// updated state after each `setLanguages` call.
function makeChecker(initialLangs: string[], isEnabled: boolean): SpellChecker {
  let langs = [...initialLangs]
  const setLanguages = vi.fn((update: string[]) => {
    langs = [...update]
  })
  return {
    get lang() { return [...langs] },
    set lang(v: string[]) { langs = [...v] },
    isEnabled,
    setLanguages
  } as unknown as SpellChecker
}

describe('SpellcheckerLanguageCommand', () => {
  let emitSpy: Mock

  beforeEach(() => {
    vi.clearAllMocks()
    emitSpy = vi.spyOn(bus, 'emit') as unknown as Mock
  })

  describe('run() — building subcommands from available dictionaries', () => {
    it('builds one subcommand per available dictionary', async() => {
      vi.spyOn(SpellChecker, 'getAvailableDictionaries').mockResolvedValue([
        'en-US',
        'de-DE',
        'fr-FR'
      ])
      const command = new SpellcheckerLanguageCommand(makeChecker(['de-DE'], true))

      await command.run()

      expect(command.subcommands).toHaveLength(3)
      expect(command.subcommands.map((c) => c.value)).toEqual(['en-US', 'de-DE', 'fr-FR'])
      expect(command.subcommands[1].id).toBe('spellchecker.switch-language-id-de-DE')
    })

    it('falls back to ["en-US"] when the dictionary list is empty', async() => {
      vi.spyOn(SpellChecker, 'getAvailableDictionaries').mockResolvedValue([])
      const command = new SpellcheckerLanguageCommand(makeChecker(['en-US'], true))

      await command.run()

      expect(command.subcommands).toHaveLength(1)
      expect(command.subcommands[0].value).toBe('en-US')
    })

    it('marks active languages with a checkmark prefix', async() => {
      vi.spyOn(SpellChecker, 'getAvailableDictionaries').mockResolvedValue([
        'en-US',
        'de-DE',
        'fr-FR'
      ])
      const command = new SpellcheckerLanguageCommand(makeChecker(['en-US', 'fr-FR'], true))

      await command.run()

      expect(command.subcommands[0].description).toMatch(/^✓/)
      expect(command.subcommands[1].description).not.toMatch(/^✓/)
      expect(command.subcommands[2].description).toMatch(/^✓/)
    })
  })

  describe('executeSubcommand() — enabled vs disabled', () => {
    it('toggles a language on when clicked and off when clicked again', async() => {
      vi.spyOn(SpellChecker, 'getAvailableDictionaries').mockResolvedValue(['en-US', 'de-DE'])
      const spellchecker = makeChecker(['en-US'], true)
      const command = new SpellcheckerLanguageCommand(spellchecker)
      await command.run()

      // Toggle de-DE on
      await command.executeSubcommand('spellchecker.switch-language-id-de-DE')

      expect(spellchecker.setLanguages).toHaveBeenCalledWith(['en-US', 'de-DE'])
      expect(mockSetPreference).toHaveBeenCalledWith({
        type: 'spellcheckerLanguages',
        value: ['en-US', 'de-DE']
      })

      // Toggle de-DE off again
      vi.clearAllMocks()
      await command.executeSubcommand('spellchecker.switch-language-id-de-DE')

      expect(spellchecker.setLanguages).toHaveBeenCalledWith(['en-US'])
    })

    it('falls back to [en-US] when all languages are toggled off', async() => {
      vi.spyOn(SpellChecker, 'getAvailableDictionaries').mockResolvedValue(['en-US', 'de-DE'])
      const spellchecker = makeChecker(['en-US'], true)
      const command = new SpellcheckerLanguageCommand(spellchecker)
      await command.run()

      // Toggle en-US off
      await command.executeSubcommand('spellchecker.switch-language-id-en-US')

      expect(spellchecker.setLanguages).toHaveBeenCalledWith(['en-US'])
    })

    it('does NOT toggle and notifies a warning when the spellchecker is disabled', async() => {
      vi.spyOn(SpellChecker, 'getAvailableDictionaries').mockResolvedValue(['en-US', 'de-DE'])
      const checker = makeChecker(['en-US'], false)
      const command = new SpellcheckerLanguageCommand(checker)
      await command.run()

      await command.executeSubcommand('spellchecker.switch-language-id-de-DE')

      expect(checker.setLanguages).not.toHaveBeenCalled()
      expect(notice.notify).toHaveBeenCalledWith({
        title: 'Spelling',
        type: 'warning',
        message: 'Cannot change language because spellchecker is disabled.'
      })
    })
  })
})
