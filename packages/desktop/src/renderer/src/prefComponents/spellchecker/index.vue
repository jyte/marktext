<template>
  <div class="pref-spellchecker">
    <h4>{{ t('preferences.spellchecker.title') }}</h4>
    <compound>
      <template #head>
        <bool
          :description="t('preferences.spellchecker.enableSpellChecking')"
          :bool="spellcheckerEnabled"
          :on-change="handleSpellcheckerEnabled"
        />
      </template>
      <template #children>
        <bool
          :description="t('preferences.spellchecker.hideMarksForErrors')"
          :bool="spellcheckerNoUnderline"
          :disable="!spellcheckerEnabled"
          :on-change="(value) => onSelectChange('spellcheckerNoUnderline', value)"
        />
        <bool
          v-show="isOsx"
          :description="t('preferences.spellchecker.autoDetectLanguage')"
          :bool="true"
          :disable="true"
          :on-change="noop"
        />
        <div
          v-show="!isOsx"
          class="transfer-wrapper"
        >
          <div class="description">
            {{ t('preferences.spellchecker.defaultLanguage') }}
          </div>
          <el-transfer
            v-model="activeLanguages"
            :data="availableTransferData"
            :disabled="!spellcheckerEnabled"
            @change="handleSpellcheckerLanguages"
          />
        </div>
      </template>
    </compound>

    <div
      v-if="isOsx && spellcheckerEnabled"
      class="description"
    >
      {{ t('preferences.spellchecker.autoDetectDescription') }}
    </div>

    <div v-if="!isOsx && spellcheckerEnabled">
      <h6 class="title">
        {{ t('preferences.spellchecker.customDictionary.title') }}
      </h6>
      <div class="description">
        {{ t('preferences.spellchecker.customDictionary.description') }}
      </div>
      <el-table
        :data="wordsInCustomDictionary"
        :empty-text="t('preferences.spellchecker.customDictionary.noWordsAvailable')"
        style="width: 100%"
      >
        <el-table-column
          prop="word"
          :label="t('preferences.spellchecker.customDictionary.word')"
        />

        <el-table-column
          fixed="right"
          :label="t('preferences.spellchecker.customDictionary.options')"
          width="90"
        >
          <template #default="scope">
            <el-button
              type="text"
              size="small"
              :title="t('preferences.spellchecker.customDictionary.delete')"
              @click="handleDeleteClick(scope.row)"
            >
              <Delete
                width="16"
                height="16"
              />
            </el-button>
          </template>
        </el-table-column>
      </el-table>
    </div>
  </div>
</template>

<script setup lang="ts">
import log from 'electron-log'
import { usePreferencesStore } from '@/store/preferences'
import type { PreferencesState } from '@/store/preferences'
import { ref, onMounted } from 'vue'
import { storeToRefs } from 'pinia'
import Compound from '../common/compound/index.vue'
import Bool from '../common/bool/index.vue'
import { isOsx as checkIsOsx } from '@/util'
import { SpellChecker } from '@/spellchecker'
import { getLanguageName } from '@/spellchecker/languageMap'
import notice from '@/services/notification'
import { useI18n } from 'vue-i18n'
import { Delete } from '@element-plus/icons-vue'

interface CustomDictionaryWord {
  word: string
}

const { t } = useI18n()
const isOsx = checkIsOsx
const availableTransferData = ref<{ key: string; label: string }[]>([])
const activeLanguages = ref<string[]>([])
const wordsInCustomDictionary = ref<CustomDictionaryWord[]>([])

const preferenceStore = usePreferencesStore()

const { spellcheckerEnabled, spellcheckerNoUnderline, spellcheckerLanguages } =
  storeToRefs(preferenceStore)

onMounted(async () => {
  if (isOsx) {
    return
  }

  const dictionaries = await SpellChecker.getAvailableDictionaries()

  availableTransferData.value = dictionaries.map((code) => ({
    key: code,
    label: getLanguageName(code) ?? code
  }))

  // Initialize transfer with current value; fall back to old single-language
  // preference for users who haven't migrated yet.
  const current = spellcheckerLanguages.value
  activeLanguages.value = Array.isArray(current) && current.length > 0
    ? [...current]
    : ['en-US']

  window.electron.ipcRenderer
    .invoke('mt::spellchecker-get-custom-dictionary-words')
    .then((words) => {
      wordsInCustomDictionary.value = words.map((word) => {
        return { word }
      })
    })
})

const handleSpellcheckerLanguages = async (
  _value: string[],
  _direction: 'left' | 'right',
  _movedKeys: string[]
): Promise<void> => {
  const langs = activeLanguages.value
  onSelectChange('spellcheckerLanguages', langs)
  await window.electron.ipcRenderer.invoke('mt::spellchecker-switch-language', langs)
}

const handleSpellcheckerEnabled = (isEnabled: boolean): void => {
  onSelectChange('spellcheckerEnabled', isEnabled)
}

const onSelectChange = (type: keyof PreferencesState, value: unknown): void => {
  preferenceStore.SET_SINGLE_PREFERENCE({ type, value })
}

// No-op handler for the disabled "auto-detect language" toggle. The control
// is permanently disabled, so the callback is never invoked, but the typed
// bool component requires `onChange` to be present.
const noop = (): void => {}

const handleDeleteClick = (selectedItem: CustomDictionaryWord): void => {
  if (selectedItem && typeof selectedItem.word === 'string') {
    window.electron.ipcRenderer
      .invoke('mt::spellchecker-remove-word', selectedItem.word)
      .then((result) => {
        // The IPC contract types `ret` as void, but the main handler returns
        // a boolean indicating success. Coerce to boolean for the branch.
        const success = result as unknown as boolean
        if (success) {
          wordsInCustomDictionary.value = wordsInCustomDictionary.value.filter(
            (item) => item.word !== selectedItem.word
          )
        } else {
          notice.notify({
            title: t('spellchecker.failedToRemoveWord'),
            type: 'error',
            message: t('spellchecker.unexpectedError')
          })
        }
      })
      .catch((error) => log.error(error))
  }
}
</script>

<style scoped>
.pref-spellchecker {
  & div.description {
    margin-top: 10px;
    margin-bottom: 2px;
    color: var(--editorColor);
    font-size: 14px;
  }
}
.transfer-wrapper {
  margin: 12px 0;
}
.el-table,
.el-table__expanded-cell {
  background: var(--editorBgColor);
}
.el-table button {
  padding: 1px 2px;
  margin: 5px 10px;
  color: var(--themeColor);
  background: none;
  border: none;
}
.el-table button:hover,
.el-table button:active {
  opacity: 0.9;
  background: none;
  border: none;
}
</style>
<style>
.pref-spellchecker .el-table table {
  margin: 0;
  border: none;
}
.pref-spellchecker .el-table th,
.pref-spellchecker .el-table tr {
  background: var(--editorBgColor);
}
.pref-spellchecker .el-table th.el-table__cell.is-leaf,
.pref-spellchecker .el-table th,
.pref-spellchecker .el-table td {
  border: none;
}
.pref-spellchecker .el-table th.el-table__cell.is-leaf:last-child,
.pref-spellchecker .el-table th:last-child,
.pref-spellchecker .el-table td:last-child {
  border-right: 1px solid var(--tableBorderColor);
}
.pref-spellchecker .el-table--border::after,
.pref-spellchecker .el-table--group::after,
.pref-spellchecker .el-table::before,
.pref-spellchecker .el-table__fixed-right::before,
.pref-spellchecker .el-table__fixed::before {
  background: var(--tableBorderColor);
}
.pref-spellchecker .el-table__body tr.hover-row.current-row > td,
.pref-spellchecker .el-table__body tr.hover-row.el-table__row--striped.current-row > td,
.pref-spellchecker .el-table__body tr.hover-row.el-table__row--striped > td,
.pref-spellchecker .el-table__body tr.hover-row > td {
  background: var(--selectionColor);
}
.pref-spellchecker .el-table .el-table__cell {
  padding: 2px 0;
  margin: 4px 6px;
}

.pref-spellchecker li.el-select-dropdown__item {
  color: var(--editorColor);
  height: 30px;
}
.pref-spellchecker li.el-select-dropdown__item.hover,
li.el-select-dropdown__item:hover {
  background: var(--floatHoverColor);
}
.pref-spellchecker div.el-select-dropdown {
  background: var(--floatBgColor);
  border-color: var(--floatBorderColor);
  & .popper__arrow {
    display: none;
  }
}
.pref-spellchecker input.el-input__inner {
  height: 30px;
  background: transparent;
  color: var(--editorColor);
  border-color: var(--editorColor10);
}
.pref-spellchecker .el-input__icon,
.pref-spellchecker .el-input__inner {
  line-height: 30px;
}
.pref-spellchecker .el-transfer {
  display: flex;
  justify-content: center;
  gap: 24px;
}
.pref-spellchecker .el-transfer-panel {
  width: 220px;
  background: var(--editorBgColor);
  border-color: var(--editorColor10);
}
.pref-spellchecker .el-transfer-panel__header {
  background: var(--editorBgColor);
  color: var(--editorColor);
  border-color: var(--editorColor10);
}
.pref-spellchecker .el-transfer-panel__body {
  background: var(--editorBgColor);
}
.pref-spellchecker .el-transfer-panel__item {
  color: var(--editorColor);
}
.pref-spellchecker .el-transfer-panel__item.is-checked {
  color: var(--themeColor);
}
.pref-spellchecker .el-transfer__button {
  background: var(--themeColor);
  border-color: var(--themeColor);
}
.pref-spellchecker .el-transfer__button:hover {
  background: var(--themeColor);
  opacity: 0.85;
}
.pref-spellchecker .el-transfer-panel__filter .el-input__inner {
  height: 28px;
}
</style>
