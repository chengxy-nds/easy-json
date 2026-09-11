<template>
  <div class="codemirror-editor-wrapper" ref="editorContainerRef" @keydown="handleKeyDown" @mouseup="handleMouseUp">
    <!-- Floating Selection Toolbar (复制 / 在新 Tab 打开) -->
    <Transition name="floating-copy-fade">
      <div
        v-if="floatingCopyVisible"
        class="floating-selection-toolbar"
        :class="{ 'is-dark': darkMode }"
        :style="{ top: `${floatingCopyPos.top}px`, left: `${floatingCopyPos.left}px` }"
        @mousedown.prevent.stop
      >
        <button
          type="button"
          class="floating-toolbar-btn"
          :class="{ 'is-copied': isCopied }"
          @click.stop="handleCopySelection"
          :title="isCopied ? '已复制' : '复制选中内容'"
        >
          <component :is="isCopied ? Check : Copy" class="floating-toolbar-icon" :class="{ 'is-copied': isCopied }" />
        </button>
        <div class="floating-toolbar-sep"></div>
        <button
          type="button"
          class="floating-toolbar-btn"
          @click.stop="handleOpenSelectionInNewTab"
          title="在新 Tab 打开"
        >
          <ExternalLink class="floating-toolbar-icon" />
        </button>
      </div>
    </Transition>
  </div>
</template>

<script setup>
import { ref, onMounted, onBeforeUnmount, watch, inject } from 'vue'
import { Copy, Check, ExternalLink } from 'lucide-vue-next'
import {
  EditorView,
  lineNumbers,
  GutterMarker,
  lineNumberMarkers,
  drawSelection,
  dropCursor,
  keymap,
  placeholder as cmPlaceholder,
  ViewPlugin,
  Decoration
} from '@codemirror/view'
import { EditorState, StateEffect, StateField, Compartment, RangeSetBuilder, RangeSet, EditorSelection } from '@codemirror/state'
import { json } from '@codemirror/lang-json'
import {
  HighlightStyle,
  syntaxHighlighting,
  foldGutter,
  foldKeymap,
  foldService,
  codeFolding,
  foldEffect,
  unfoldEffect,
  foldAll,
  unfoldAll,
  foldedRanges,
  bracketMatching,
  indentOnInput,
  syntaxTree,
  ensureSyntaxTree
} from '@codemirror/language'
import { tags } from '@lezer/highlight'
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands'
import {
  search,
  SearchQuery,
  setSearchQuery,
  findNext,
  findPrevious,
  replaceNext,
  replaceAll,
  getSearchQuery
} from '@codemirror/search'

// Helper to compute JSONPath from AST at cursor position
const getJsonPathAtPos = (state, pos) => {
  try {
    const tree = ensureSyntaxTree(state, pos + 50, 100) || syntaxTree(state)
    let node = tree.resolveInner(pos, 1)
    if (!node || node.name === 'JsonText') {
      node = tree.resolveInner(pos, -1)
    }
    if (!node || node.name === 'JsonText') {
      return { path: null, type: null }
    }

    let targetType = 'value'
    if (node.name === 'PropertyName') {
      targetType = 'key'
    }

    const path = []
    let curr = node
    while (curr && curr.name !== 'JsonText') {
      if (curr.name === 'Property') {
        const keyNode = curr.getChild('PropertyName')
        if (keyNode) {
          let rawKey = state.doc.sliceString(keyNode.from, keyNode.to)
          if (rawKey.startsWith('"') && rawKey.endsWith('"')) {
            rawKey = rawKey.slice(1, -1)
          }
          path.unshift(rawKey)
        }
      } else if (curr.name === 'Array') {
        let idx = 0
        let c = curr.firstChild
        while (c) {
          if (c.from >= pos) break
          if (c.name !== '[' && c.name !== ']' && c.name !== ',') {
            idx++
          }
          c = c.nextSibling
        }
        path.unshift(Math.max(0, idx - 1))
      }
      curr = curr.parent
    }
    return { path: path.length > 0 ? path : null, type: targetType }
  } catch (e) {
    return { path: null, type: null }
  }
}

const props = defineProps({
  modelValue: {
    type: String,
    default: ''
  },
  errorLine: {
    type: Number,
    default: null
  },
  duplicateLines: {
    type: Array,
    default: () => []
  },
  wordWrap: {
    type: Boolean,
    default: true
  },
  showLineNumbers: {
    type: Boolean,
    default: true
  },
  darkMode: {
    type: Boolean,
    default: false
  },
  isPremium: {
    type: Boolean,
    default: true
  },
  fontSize: {
    type: Number,
    default: 13
  },
  lineHeight: {
    type: Number,
    default: 20
  },
  fontFamily: {
    type: String,
    default: ''
  },
  placeholder: {
    type: String,
    default: '在此粘贴或输入你的 JSON 数据...'
  },
  searchQuery: {
    type: String,
    default: ''
  },
  replaceQuery: {
    type: String,
    default: ''
  }
})

const emit = defineEmits(['update:modelValue', 'cursor-change', 'copy-selection', 'focus', 'blur', 'paste', 'scroll', 'toggle-fold'])

const treeExpanded = inject('treeExpanded', ref(true))
const showToast = inject('showToast', null)
const openNestedJsonTab = inject('openNestedJsonTab', null)
const editorContainerRef = ref(null)
let editorView = null
let isInternalFoldSync = false
let isExternalSelectionSync = false
let externalSelectionTimer = null
let activeSelectionTimer = null

// Floating copy selection pill state
const floatingCopyVisible = ref(false)
const floatingCopyPos = ref({ top: 0, left: 0 })
const isCopied = ref(false)
let copyTimeoutId = null
let autoHideTimeoutId = null

const updateFloatingCopyPosition = () => {
  if (!floatingCopyVisible.value || !editorView || !editorContainerRef.value) return
  const sel = editorView.state.selection.main
  if (sel.empty) {
    floatingCopyVisible.value = false
    return
  }
  const from = Math.min(sel.anchor, sel.head)
  const coords = editorView.coordsAtPos(from)
  if (!coords) {
    floatingCopyVisible.value = false
    return
  }
  const containerRect = editorContainerRef.value.getBoundingClientRect()
  
  // Check if position is within visible editor bounds
  if (coords.bottom < containerRect.top || coords.top > containerRect.bottom) {
    floatingCopyVisible.value = false
    return
  }

  const relX = coords.left - containerRect.left
  const relY = coords.top - containerRect.top

  let top = relY - 30
  if (top < 4) {
    top = Math.max(4, relY + 22)
  }
  const left = Math.max(8, Math.min(relX, containerRect.width - 64))

  floatingCopyPos.value = { top, left }
}

const showFloatingCopy = () => {
  if (copyTimeoutId) clearTimeout(copyTimeoutId)
  if (autoHideTimeoutId) clearTimeout(autoHideTimeoutId)
  isCopied.value = false
  floatingCopyVisible.value = true

  requestAnimationFrame(() => {
    updateFloatingCopyPosition()
  })

  // Auto-hide after 6 seconds if inactive
  autoHideTimeoutId = setTimeout(() => {
    floatingCopyVisible.value = false
  }, 6000)
}

const hideFloatingCopy = () => {
  floatingCopyVisible.value = false
  if (autoHideTimeoutId) clearTimeout(autoHideTimeoutId)
}

const handleCopySelection = async () => {
  if (!editorView) return
  const sel = editorView.state.selection.main
  const text = editorView.state.sliceDoc(Math.min(sel.anchor, sel.head), Math.max(sel.anchor, sel.head))
  if (!text) return

  try {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(text)
    } else {
      const ta = document.createElement('textarea')
      ta.value = text
      ta.style.position = 'fixed'
      ta.style.opacity = '0'
      document.body.appendChild(ta)
      ta.select()
      document.execCommand('copy')
      document.body.removeChild(ta)
    }
    isCopied.value = true
    if (showToast) {
      showToast('已复制选中内容')
    }
    emit('copy-selection', text)

    if (copyTimeoutId) clearTimeout(copyTimeoutId)
    copyTimeoutId = setTimeout(() => {
      floatingCopyVisible.value = false
      isCopied.value = false
    }, 1500)
  } catch (err) {
    console.error('Failed to copy selection:', err)
  }
}

const handleOpenSelectionInNewTab = () => {
  if (!editorView) return
  const sel = editorView.state.selection.main
  let text = editorView.state.sliceDoc(Math.min(sel.anchor, sel.head), Math.max(sel.anchor, sel.head))
  if (!text) return

  text = text.trim()
  let cleanText = text
  // 智能剥离最外层包裹的单/双引号 (如 "获取策略成功" -> 获取策略成功)
  if ((cleanText.startsWith('"') && cleanText.endsWith('"')) || (cleanText.startsWith("'") && cleanText.endsWith("'"))) {
    if (cleanText.length >= 2) {
      cleanText = cleanText.slice(1, -1)
    }
  }

  if (openNestedJsonTab) {
    const previewTitle = cleanText.length > 10 ? cleanText.slice(0, 10) + '...' : cleanText
    openNestedJsonTab(cleanText, previewTitle ? `选中: ${previewTitle}` : '选中文本')
  } else if (showToast) {
    showToast('新 Tab 打开功能未就绪')
  }

  hideFloatingCopy()
}

const handleMouseUp = () => {
  if (!editorView) return
  const sel = editorView.state.selection.main
  if (!sel.empty) {
    setTimeout(() => {
      showFloatingCopy()
    }, 20)
  }
}

// Compartments for dynamic reconfiguration without destroying instance
const wrapCompartment = new Compartment()
const gutterCompartment = new Compartment()
const themeCompartment = new Compartment()
const customThemeCompartment = new Compartment()

// Hanging indent wrap plugin: keeps wrapped lines aligned with the line's indent level (never exceeding the key)
const indentWrapPlugin = ViewPlugin.fromClass(
  class {
    constructor(view) {
      this.decorations = this.buildDecorations(view)
    }

    update(update) {
      if (update.docChanged || update.viewportChanged || update.geometryChanged) {
        this.decorations = this.buildDecorations(update.view)
      }
    }

    buildDecorations(view) {
      const decos = []
      for (let { from, to } of view.visibleRanges) {
        let pos = from
        while (pos <= to) {
          const line = view.state.doc.lineAt(pos)
          const lineText = line.text
          // 性能保护：压缩单行或无前导缩进的超长行直接跳过，零开销
          if (lineText.length > 2000 || (!lineText.startsWith(' ') && !lineText.startsWith('\t'))) {
            pos = line.to + 1
            continue
          }
          let indent = 0
          for (let i = 0; i < lineText.length; i++) {
            if (lineText[i] === ' ') {
              indent += 1
            } else if (lineText[i] === '\t') {
              indent += 2
            } else {
              break
            }
          }
          if (indent > 0) {
            decos.push(
              Decoration.line({
                attributes: {
                  style: `padding-left: calc(${indent}ch + 12px); text-indent: -${indent}ch;`
                }
              }).range(line.from)
            )
          }
          pos = line.to + 1
        }
      }
      return Decoration.set(decos, true)
    }
  },
  {
    decorations: (v) => v.decorations
  }
)

const getWrapExtensions = (wrap) => {
  if (!wrap) return []
  return [EditorView.lineWrapping, indentWrapPlugin]
}

// Custom Search Highlight Plugin: highlights all occurrences of searchQuery in matching yellow/amber
const setSearchQueryEffect = StateEffect.define()
const searchMatchMark = Decoration.mark({ class: 'cm-searchMatch' })
const searchMatchSelectedMark = Decoration.mark({ class: 'cm-searchMatch cm-searchMatch-selected' })

const searchHighlightPlugin = ViewPlugin.fromClass(
  class {
    constructor(view) {
      this.currentQuery = props.searchQuery || ''
      this.decorations = this.buildDecorations(view, this.currentQuery)
    }

    update(update) {
      let queryChanged = false
      for (const tr of update.transactions) {
        for (const e of tr.effects) {
          if (e.is(setSearchQueryEffect)) {
            this.currentQuery = e.value
            queryChanged = true
          }
        }
      }
      if (queryChanged || update.docChanged || update.selectionSet || update.viewportChanged) {
        this.decorations = this.buildDecorations(update.view, this.currentQuery)
      }
    }

    buildDecorations(view, query) {
      if (!query) return Decoration.none
      const escaped = query.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&')
      let regex
      try {
        regex = new RegExp(escaped, 'gi')
      } catch (e) {
        return Decoration.none
      }

      const builder = new RangeSetBuilder()
      const sel = view.state.selection.main

      for (let { from, to } of view.visibleRanges) {
        const text = view.state.doc.sliceString(from, to)
        let match
        while ((match = regex.exec(text)) !== null) {
          const mFrom = from + match.index
          const mTo = mFrom + match[0].length
          if (mTo > mFrom) {
            const isSelected = !sel.empty && ((sel.from === mFrom && sel.to === mTo) || (sel.anchor === mFrom && sel.head === mTo))
            builder.add(mFrom, mTo, isSelected ? searchMatchSelectedMark : searchMatchMark)
          }
          if (match.index === regex.lastIndex) {
            regex.lastIndex++
          }
        }
      }
      return builder.finish()
    }
  },
  {
    decorations: (v) => v.decorations
  }
)

// Clamp single-line selections so that selecting to the end of a line stays on the line (doesn't spill over to next line)
const clampLineSelectionFilter = EditorState.transactionFilter.of((tr) => {
  if (!tr.selection) return tr
  const sel = tr.selection.main
  if (sel.empty) return tr
  const startLine = tr.state.doc.lineAt(sel.anchor)
  if (startLine.number < tr.state.doc.lines && sel.head === startLine.to + 1 && sel.anchor >= startLine.from) {
    return [tr, { selection: EditorSelection.single(sel.anchor, startLine.to) }]
  }
  return tr
})

// Focus tracking state field and effect
const setFocusEffect = StateEffect.define()

const focusField = StateField.define({
  create() {
    return false
  },
  update(focused, tr) {
    for (const e of tr.effects) {
      if (e.is(setFocusEffect)) {
        return e.value
      }
    }
    return focused
  }
})

// Line decorations for Error line and Duplicate lines
const setLineDecorationsEffect = StateEffect.define()

// Intelligent Active Line: only highlights when focused (or empty document) and no range selection (matching VSCode)
const customActiveLineField = StateField.define({
  create(state) {
    const isFocused = state.field(focusField, false)
    const isEmpty = state.doc.length === 0
    if ((!isFocused && !isEmpty) || !state.selection.main.empty) return Decoration.none
    const line = state.doc.lineAt(state.selection.main.head)
    return Decoration.set([
      Decoration.line({ attributes: { class: 'cm-activeLine' } }).range(line.from)
    ])
  },
  update(decorations, tr) {
    const isFocused = tr.state.field(focusField, false)
    const isEmpty = tr.state.doc.length === 0
    const sel = tr.state.selection.main

    if ((!isFocused && !isEmpty) || !sel.empty) {
      return Decoration.none
    }

    const line = tr.state.doc.lineAt(sel.head)
    return Decoration.set([
      Decoration.line({ attributes: { class: 'cm-activeLine' } }).range(line.from)
    ])
  },
  provide: (f) => EditorView.decorations.from(f)
})

// Intelligent Active Line Gutter Marker: only active when focused (or empty document) and no text selection
const activeLineGutterMarker = new class extends GutterMarker {
  elementClass = 'cm-activeLineGutter'
}

const customActiveLineGutter = lineNumberMarkers.compute(['selection', 'doc', focusField], (state) => {
  const isFocused = state.field(focusField, false)
  const isEmpty = state.doc.length === 0
  if ((!isFocused && !isEmpty) || !state.selection.main.empty) return RangeSet.empty
  const builder = new RangeSetBuilder()
  const line = state.doc.lineAt(state.selection.main.head)
  builder.add(line.from, line.from, activeLineGutterMarker)
  return builder.finish()
})

const lineDecorationField = StateField.define({
  create() {
    return Decoration.none
  },
  update(decorations, tr) {
    for (const e of tr.effects) {
      if (e.is(setLineDecorationsEffect)) {
        return e.value
      }
    }
    return decorations.map(tr.changes)
  },
  provide: (f) => EditorView.decorations.from(f)
})

const buildLineDecorations = (doc, errLine, dupLines) => {
  const decos = []
  const totalLines = doc.lines

  if (errLine && errLine >= 1 && errLine <= totalLines) {
    const line = doc.line(errLine)
    decos.push(
      Decoration.line({
        attributes: { class: 'cm-error-line' }
      }).range(line.from)
    )
  }

  if (dupLines && dupLines.length > 0) {
    for (const dLine of dupLines) {
      if (dLine >= 1 && dLine <= totalLines && dLine !== errLine) {
        const line = doc.line(dLine)
        decos.push(
          Decoration.line({
            attributes: { class: 'cm-duplicate-line' }
          }).range(line.from)
        )
      }
    }
  }

  // CodeMirror requires decorations to be sorted by from
  decos.sort((a, b) => a.from - b.from)

  return Decoration.set(decos, true)
}

const updateLineDecorations = () => {
  if (!editorView) return
  const decos = buildLineDecorations(editorView.state.doc, props.errorLine, props.duplicateLines)
  editorView.dispatch({
    effects: setLineDecorationsEffect.of(decos)
  })
}

// Custom theme that strictly maps CSS variables (--font-mono, font-size, line-height)
const createBaseTheme = () => {
  return EditorView.theme({
    '&': {
      height: '100%',
      fontSize: `var(--editor-font-size, ${props.fontSize}px)`,
      fontFamily: props.fontFamily || 'var(--font-mono, ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace)'
    },
    '.cm-scroller': {
      fontFamily: 'inherit',
      lineHeight: `var(--editor-line-height, ${props.lineHeight}px)`,
      overflow: 'auto',
      overflowAnchor: 'none'
    },
    '.cm-content': {
      padding: '4px 0 24px 0',
      wordBreak: 'break-all'
    },
    '.cm-line': {
      padding: '0 12px 0 12px',
      transition: 'background-color 0.1s ease',
      wordBreak: 'break-all',
      overflowWrap: 'anywhere'
    },
    '.cm-line:hover': {
      backgroundColor: 'var(--bg-hover, rgba(255, 255, 255, 0.03))'
    },
    '.cm-gutters': {
      position: 'sticky',
      left: 0,
      minHeight: '100%',
      overflow: 'hidden',
      willChange: 'transform'
    },
    '.cm-lineNumbers': {
      minWidth: '28px'
    },
    '.cm-lineNumbers .cm-gutterElement': {
      fontSize: '0.88em',
      letterSpacing: '-0.2px',
      minWidth: '20px',
      textAlign: 'right',
      padding: '0 5px 0 3px',
      boxSizing: 'border-box',
      fontVariantNumeric: 'tabular-nums',
      transition: 'color 0.12s ease'
    },
    '.cm-lineNumbers .cm-gutterElement.cm-activeLineGutter': {
      fontSize: '0.88em',
      fontWeight: '800'
    },
    '.cm-foldGutter': {
      width: '14px',
      backgroundColor: 'transparent'
    },
    '.cm-foldGutter .cm-gutterElement': {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '0',
      cursor: 'pointer',
      color: 'var(--text-muted, #94a3b8)',
      transition: 'color 0.15s ease'
    },
    '.cm-foldGutter .cm-gutterElement:hover': {
      color: 'var(--text-primary, #0f172a)'
    },
    '.cm-custom-fold-marker': {
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      width: '11px',
      height: '11px',
      lineHeight: '1'
    },
    '.cm-custom-fold-marker svg': {
      width: '11px',
      height: '11px',
      display: 'block'
    },
    // Selection Layer stacking fix: lift selectionLayer above line backgrounds (like .cm-error-line)
    '.cm-selectionLayer': {
      zIndex: '10 !important'
    },
    '.cm-selectionBackground': {
      pointerEvents: 'none !important'
    },
    // Error line decoration: flush with left edge (0px from gutter), prominent red bar
    '.cm-error-line': {
      backgroundColor: 'var(--error-bg, rgba(239, 68, 68, 0.12)) !important',
      boxShadow: 'inset 3px 0 0 var(--error-text, #ef4444) !important'
    },
    // Duplicate line warning
    '.cm-duplicate-line': {
      backgroundColor: props.darkMode ? 'rgba(234, 179, 8, 0.12) !important' : 'rgba(234, 179, 8, 0.08) !important',
      boxShadow: 'inset 3px 0 0 #d97706 !important'
    },
    // Fold placeholder widget ({...})
    '.cm-foldPlaceholder': {
      backgroundColor: 'rgba(0, 0, 0, 0.05)',
      border: 'none',
      color: 'var(--text-muted, #94a3b8)',
      borderRadius: '3px',
      margin: '0 2px',
      padding: '0 4px',
      cursor: 'pointer',
      fontSize: '0.85em',
      userSelect: 'none',
      transition: 'all 0.15s ease'
    },
    '.cm-foldPlaceholder:hover': {
      backgroundColor: 'rgba(0, 0, 0, 0.1)',
      color: 'var(--text-primary, #0f172a)'
    },
    // Search match highlights (identical to tree view search match background)
    '.cm-searchMatch': {
      backgroundColor: 'rgba(234, 179, 8, 0.35) !important',
      color: 'inherit !important',
      borderRadius: '2px'
    },
    '.cm-searchMatch.cm-searchMatch-selected': {
      backgroundColor: 'rgba(234, 179, 8, 0.65) !important',
      outline: '1.5px solid rgba(217, 119, 6, 0.8) !important',
      borderRadius: '2px'
    }
  })
}

// 1. Premium Light Highlight Style (Classic VSCode Light)
const premiumLightHighlightStyle = HighlightStyle.define([
  { tag: tags.propertyName, color: '#A31515', fontWeight: '500' },
  { tag: tags.string, color: '#0451A5' },
  { tag: tags.number, color: '#098658' },
  { tag: tags.bool, color: '#0000ff' },
  { tag: tags.null, color: '#64748b' },
  { tag: tags.bracket, color: '#16a34a', fontWeight: '500' },
  { tag: tags.punctuation, color: '#64748b' },
  { tag: tags.separator, color: '#64748b' }
])

// 2. Premium Dark Highlight Style (Classic VSCode Dark+)
const premiumDarkHighlightStyle = HighlightStyle.define([
  { tag: tags.propertyName, color: '#9cdcfe', fontWeight: '500' },
  { tag: tags.string, color: '#ce9178' },
  { tag: tags.number, color: '#b5cea8' },
  { tag: tags.bool, color: '#569cd6' },
  { tag: tags.null, color: '#569cd6' },
  { tag: tags.bracket, color: '#ffd700', fontWeight: '500' },
  { tag: tags.punctuation, color: '#94a3b8' },
  { tag: tags.separator, color: '#94a3b8' }
])

// 3. One Dark Light Highlight Style (One Dark Light / Violet-Emerald)
const oneDarkLightHighlightStyle = HighlightStyle.define([
  { tag: tags.propertyName, color: '#7c3aed', fontWeight: '500' },
  { tag: tags.string, color: '#047857' },
  { tag: tags.number, color: '#b45309' },
  { tag: tags.bool, color: '#0369a1' },
  { tag: tags.null, color: '#9ca3af' },
  { tag: tags.bracket, color: '#374151', fontWeight: '500' },
  { tag: tags.punctuation, color: '#6b7280' },
  { tag: tags.separator, color: '#6b7280' }
])

// 4. One Dark Dark Highlight Style (One Dark Pro Dark / Lavender-Mint)
const oneDarkDarkHighlightStyle = HighlightStyle.define([
  { tag: tags.propertyName, color: '#d2a8ff', fontWeight: '400' },
  { tag: tags.string, color: '#a8d989' },
  { tag: tags.number, color: '#e5c07b' },
  { tag: tags.bool, color: '#70d5e2' },
  { tag: tags.null, color: '#7a889b' },
  { tag: tags.bracket, color: '#cbd5e1', fontWeight: '400' },
  { tag: tags.punctuation, color: '#94a3b8' },
  { tag: tags.separator, color: '#94a3b8' }
])

const lightTheme = EditorView.theme({
  '&': {
    color: '#0f172a',
    backgroundColor: 'var(--bg-input, #ffffff)'
  },
  '.cm-content': {
    caretColor: '#0f172a'
  },
  '.cm-cursor, .cm-dropCursor': {
    borderLeftColor: '#0f172a'
  },
  '&.cm-focused .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection': {
    backgroundColor: 'rgba(37, 99, 235, 0.25) !important'
  },
  '.cm-gutters': {
    color: '#94a3b8',
    backgroundColor: 'var(--bg-input, #ffffff)',
    borderRight: '1px solid var(--border-color, rgba(148, 163, 184, 0.18))'
  },
  '.cm-activeLine': {
    backgroundColor: 'rgba(249, 115, 22, 0.08)'
  },
  '.cm-activeLineGutter': {
    backgroundColor: 'transparent',
    color: '#ea580c',
    fontWeight: '800',
    fontSize: '0.88em'
  }
}, { dark: false })

const darkTheme = EditorView.theme({
  '&': {
    color: '#e2e8f0',
    backgroundColor: 'var(--bg-input, #2e2e33)'
  },
  '.cm-content': {
    caretColor: '#38bdf8'
  },
  '.cm-cursor, .cm-dropCursor': {
    borderLeftColor: '#38bdf8'
  },
  '&.cm-focused .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection': {
    backgroundColor: 'rgba(56, 189, 248, 0.3) !important'
  },
  '.cm-gutters': {
    color: '#6e7681',
    backgroundColor: 'var(--bg-input, #2e2e33)',
    borderRight: '1px solid var(--border-color, rgba(255, 255, 255, 0.08))'
  },
  '.cm-activeLine': {
    backgroundColor: 'rgba(255, 255, 255, 0.04)'
  },
  '.cm-activeLineGutter': {
    backgroundColor: 'transparent',
    color: '#38bdf8',
    fontWeight: '800',
    fontSize: '0.88em'
  },
  '.cm-searchMatch': {
    backgroundColor: 'rgba(250, 204, 21, 0.35) !important',
    color: '#fef9c3 !important'
  },
  '.cm-searchMatch.cm-searchMatch-selected': {
    backgroundColor: 'rgba(250, 204, 21, 0.65) !important',
    outline: '1.5px solid rgba(250, 204, 21, 0.9) !important'
  }
}, { dark: true })

const getThemeExtensions = (isDark, isPremium = true) => {
  const theme = isDark ? darkTheme : lightTheme
  let highlightStyle
  if (isPremium) {
    highlightStyle = isDark ? premiumDarkHighlightStyle : premiumLightHighlightStyle
  } else {
    highlightStyle = isDark ? oneDarkDarkHighlightStyle : oneDarkLightHighlightStyle
  }
  return [theme, syntaxHighlighting(highlightStyle)]
}

const createFoldMarker = (open) => {
  const span = document.createElement('span')
  span.className = 'cm-custom-fold-marker'
  span.innerHTML = open
    ? `<svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg>`
    : `<svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m9 18 6-6-6-6"/></svg>`
  return span
}

const getGutterExtensions = (show) => {
  if (!show) return []
  return [
    lineNumbers(),
    customActiveLineGutter,
    foldGutter({ markerDOM: createFoldMarker })
  ]
}

const handleEditorScrollDOM = (e) => {
  emit('scroll', e)
  if (floatingCopyVisible.value) {
    updateFloatingCopyPosition()
  }
}

const initCodeMirror = () => {
  if (!editorContainerRef.value) return

  const startState = EditorState.create({
    doc: props.modelValue || '',
    extensions: [
      focusField,
      gutterCompartment.of(getGutterExtensions(props.showLineNumbers)),
      codeFolding({
        placeholderText: '...'
      }),
      customActiveLineField,
      clampLineSelectionFilter,
      drawSelection(),
      dropCursor(),
      indentOnInput(),
      bracketMatching(),
      history(),
      json(),
      lineDecorationField,
      cmPlaceholder(props.placeholder),
      wrapCompartment.of(getWrapExtensions(props.wordWrap)),
      search({ top: false }),
      searchHighlightPlugin,
      themeCompartment.of(getThemeExtensions(props.darkMode, props.isPremium)),
      customThemeCompartment.of(createBaseTheme()),
      keymap.of([
        indentWithTab,
        ...defaultKeymap,
        ...historyKeymap,
        ...foldKeymap
      ]),
      EditorView.updateListener.of((update) => {
        if (update.docChanged) {
          const val = update.state.doc.toString()
          emit('update:modelValue', val)
          hideFloatingCopy()
        }
        if (update.selectionSet || update.docChanged) {
          const sel = update.state.selection.main
          if (sel.empty) {
            hideFloatingCopy()
          }
          if (isExternalSelectionSync) {
            return
          }
          const pos = sel.empty ? sel.head : Math.min(sel.anchor, sel.head)
          const line = update.state.doc.lineAt(pos)
          const { path, type } = getJsonPathAtPos(update.state, pos)
          emit('cursor-change', {
            offset: pos,
            line: line.number,
            col: pos - line.from,
            path,
            type
          })

          // 用户在编辑器中主动选中文本时，防抖弹出悬浮工具条 (复制 / 新 Tab 打开)
          if (!sel.empty && !update.docChanged) {
            if (activeSelectionTimer) clearTimeout(activeSelectionTimer)
            activeSelectionTimer = setTimeout(() => {
              activeSelectionTimer = null
              if (editorView && !editorView.state.selection.main.empty) {
                showFloatingCopy()
              }
            }, 80)
          }
        }
        if (update.transactions) {
          for (const tr of update.transactions) {
            for (const effect of tr.effects) {
              if (effect.is(foldEffect)) {
                if (!isInternalFoldSync) {
                  const { path } = getJsonPathAtPos(update.state, effect.value.from)
                  emit('toggle-fold', { path: path || [], isFolded: true })
                }
              } else if (effect.is(unfoldEffect)) {
                if (!isInternalFoldSync) {
                  const { path } = getJsonPathAtPos(update.state, effect.value.from)
                  if (!path || path.length === 0) {
                    setTimeout(() => {
                      if (!editorView) return
                      isInternalFoldSync = true
                      try {
                        unfoldAll(editorView)
                      } finally {
                        setTimeout(() => { isInternalFoldSync = false }, 50)
                      }
                    }, 0)
                  }
                  emit('toggle-fold', { path: path || [], isFolded: false })
                }
              }
            }
          }
        }
      }),
      EditorView.domEventHandlers({
        focus: (event, view) => {
          view.dispatch({ effects: setFocusEffect.of(true) })
          emit('focus', event)
        },
        blur: (event, view) => {
          view.dispatch({ effects: setFocusEffect.of(false) })
          emit('blur', event)
        },
        paste: (event) => emit('paste', event)
      })
    ]
  })

  editorView = new EditorView({
    state: startState,
    parent: editorContainerRef.value
  })

  if (editorView.scrollDOM) {
    editorView.scrollDOM.addEventListener('scroll', handleEditorScrollDOM, { passive: true })
  }

  updateLineDecorations()
  if (props.searchQuery) {
    syncSearchQuery()
  }
}

// Watchers
watch(() => props.modelValue, (newVal) => {
  if (!editorView) return
  const currentVal = editorView.state.doc.toString()
  if (newVal !== currentVal) {
    editorView.dispatch({
      changes: { from: 0, to: editorView.state.doc.length, insert: newVal || '' }
    })
    updateLineDecorations()
    if (props.searchQuery) {
      syncSearchQuery()
    }
  }
})

const syncSearchQuery = () => {
  if (!editorView) return
  const q = props.searchQuery || ''
  editorView.dispatch({
    effects: [
      setSearchQueryEffect.of(q),
      setSearchQuery.of(
        new SearchQuery({
          search: q,
          caseSensitive: false,
          literal: true
        })
      )
    ]
  })
}

watch(() => props.searchQuery, () => {
  syncSearchQuery()
})

watch(() => props.wordWrap, (newWrap) => {
  if (!editorView) return
  editorView.dispatch({
    effects: wrapCompartment.reconfigure(getWrapExtensions(newWrap))
  })
})

watch(() => props.showLineNumbers, (newShow) => {
  if (!editorView) return
  editorView.dispatch({
    effects: gutterCompartment.reconfigure(getGutterExtensions(newShow))
  })
})

watch([() => props.darkMode, () => props.isPremium], ([newDark, newPremium]) => {
  if (!editorView) return
  editorView.dispatch({
    effects: [
      themeCompartment.reconfigure(getThemeExtensions(newDark, newPremium)),
      customThemeCompartment.reconfigure(createBaseTheme())
    ]
  })
})

watch([() => props.fontSize, () => props.lineHeight, () => props.fontFamily], () => {
  if (!editorView) return
  editorView.dispatch({
    effects: customThemeCompartment.reconfigure(createBaseTheme())
  })
})

watch([() => props.errorLine, () => props.duplicateLines], () => {
  updateLineDecorations()
}, { deep: true })

const handleKeyDown = (e) => {
  // Pass through if needed
}

// Public API
const doFindNext = () => {
  if (!editorView) return false
  return findNext(editorView)
}

const doFindPrevious = () => {
  if (!editorView) return false
  return findPrevious(editorView)
}

const doReplaceNext = (replaceWith) => {
  if (!editorView) return false
  if (replaceWith !== undefined) {
    const currentQuery = getSearchQuery(editorView.state)
    if (currentQuery && currentQuery.search) {
      editorView.dispatch({
        effects: setSearchQuery.of(
          new SearchQuery({
            search: currentQuery.search,
            replace: replaceWith,
            caseSensitive: currentQuery.caseSensitive,
            literal: currentQuery.literal
          })
        )
      })
    }
  }
  return replaceNext(editorView)
}

const doReplaceAll = (replaceWith) => {
  if (!editorView) return false
  if (replaceWith !== undefined) {
    const currentQuery = getSearchQuery(editorView.state)
    if (currentQuery && currentQuery.search) {
      editorView.dispatch({
        effects: setSearchQuery.of(
          new SearchQuery({
            search: currentQuery.search,
            replace: replaceWith,
            caseSensitive: currentQuery.caseSensitive,
            literal: currentQuery.literal
          })
        )
      })
    }
  }
  return replaceAll(editorView)
}

const goToMatch = (targetIndex) => {
  if (!editorView || !props.searchQuery) return
  const query = new SearchQuery({
    search: props.searchQuery,
    caseSensitive: false,
    literal: true
  })
  const cursor = query.getCursor(editorView.state.doc)
  let count = 0
  let targetMatch = null
  let match = cursor.next()
  while (!match.done) {
    if (count === targetIndex) {
      targetMatch = match.value
      break
    }
    count++
    match = cursor.next()
  }
  if (targetMatch) {
    editorView.dispatch({
      selection: { anchor: targetMatch.from, head: targetMatch.to },
      effects: [
        EditorView.scrollIntoView(targetMatch.from, { y: 'center' }),
        setSearchQuery.of(query),
        setSearchQueryEffect.of(props.searchQuery)
      ]
    })
  }
}

const scrollToLine = (lineNumber) => {
  if (!editorView) return
  isExternalSelectionSync = true
  if (externalSelectionTimer) clearTimeout(externalSelectionTimer)
  try {
    const total = editorView.state.doc.lines
    const target = Math.max(1, Math.min(lineNumber, total))
    const line = editorView.state.doc.line(target)
    editorView.dispatch({
      selection: { anchor: line.from },
      effects: [
        EditorView.scrollIntoView(line.from, { y: 'center' }),
        setFocusEffect.of(true)
      ]
    })
    editorView.focus()
  } finally {
    externalSelectionTimer = setTimeout(() => {
      isExternalSelectionSync = false
      externalSelectionTimer = null
    }, 100)
  }
}

const focus = () => {
  if (editorView) {
    editorView.dispatch({ effects: setFocusEffect.of(true) })
    editorView.focus()
  }
}

const getSelectionRange = () => {
  if (!editorView) return { from: 0, to: 0 }
  const sel = editorView.state.selection.main
  return { from: sel.from, to: sel.to }
}

const setSelectionRange = (start, end, options = { showCopyPill: true }) => {
  if (!editorView) return
  isExternalSelectionSync = true
  if (externalSelectionTimer) clearTimeout(externalSelectionTimer)
  try {
    const len = editorView.state.doc.length
    const from = Math.max(0, Math.min(start, len))
    const to = Math.max(from, Math.min(end, len))
    editorView.dispatch({
      selection: { anchor: from, head: to },
      effects: [
        EditorView.scrollIntoView(from, { y: 'center' }),
        setFocusEffect.of(true)
      ]
    })
    editorView.focus()

    if (options?.showCopyPill !== false && from !== to) {
      setTimeout(() => {
        showFloatingCopy()
      }, 50)
    }
  } finally {
    externalSelectionTimer = setTimeout(() => {
      isExternalSelectionSync = false
      externalSelectionTimer = null
    }, 100)
  }
}

const scrollToTop = (smooth = false) => {
  if (editorView?.scrollDOM) {
    if (smooth) {
      editorView.scrollDOM.scrollTo({ top: 0, behavior: 'smooth' })
    } else {
      editorView.scrollDOM.scrollTop = 0
    }
  }
}

const scrollToBottom = (smooth = false) => {
  if (editorView?.scrollDOM) {
    if (smooth) {
      editorView.scrollDOM.scrollTo({ top: editorView.scrollDOM.scrollHeight, behavior: 'smooth' })
    } else {
      editorView.scrollDOM.scrollTop = editorView.scrollDOM.scrollHeight
    }
  }
}

const setScrollTop = (top) => {
  if (editorView?.scrollDOM) {
    editorView.scrollDOM.scrollTop = top
  }
}

const setScrollLeft = (left) => {
  if (editorView?.scrollDOM) {
    editorView.scrollDOM.scrollLeft = left
  }
}

const findRangeForJsonPath = (state, path) => {
  try {
    const tree = syntaxTree(state)
    let curr = tree.topNode
    let root = null
    let c = curr.firstChild
    while (c) {
      if (c.name === 'Object' || c.name === 'Array') {
        root = c
        break
      }
      c = c.nextSibling
    }
    if (!root) return null

    if (!path || path.length === 0) {
      return { from: root.from + 1, to: root.to - 1 }
    }

    let target = root
    for (let i = 0; i < path.length; i++) {
      const seg = path[i]
      if (typeof seg === 'string') {
        let found = null
        let child = target.firstChild
        while (child) {
          if (child.name === 'Property') {
            const propName = child.getChild('PropertyName')
            if (propName) {
              let rawKey = state.doc.sliceString(propName.from, propName.to)
              if (rawKey.startsWith('"') && rawKey.endsWith('"')) {
                rawKey = rawKey.slice(1, -1)
              }
              if (rawKey === seg) {
                let valNode = propName.nextSibling
                while (valNode && (valNode.name === ':' || valNode.name === ',')) {
                  valNode = valNode.nextSibling
                }
                found = valNode
                break
              }
            }
          }
          child = child.nextSibling
        }
        if (!found) return null
        target = found
      } else if (typeof seg === 'number') {
        let idx = 0
        let found = null
        let child = target.firstChild
        while (child) {
          if (child.name !== '[' && child.name !== ']' && child.name !== ',') {
            if (idx === seg) {
              found = child
              break
            }
            idx++
          }
          child = child.nextSibling
        }
        if (!found) return null
        target = found
      }
    }

    if (target && (target.name === 'Object' || target.name === 'Array')) {
      return { from: target.from + 1, to: target.to - 1 }
    }
    return null
  } catch (e) {
    return null
  }
}

const foldPath = (path, isFolded) => {
  if (!editorView) return
  const isRoot = !path || path.length === 0
  if (isRoot) {
    isInternalFoldSync = true
    try {
      if (isFolded) {
        foldAll(editorView)
      } else {
        unfoldAll(editorView)
      }
    } finally {
      setTimeout(() => {
        isInternalFoldSync = false
      }, 50)
    }
    return
  }

  const range = findRangeForJsonPath(editorView.state, path)
  if (!range) return
  isInternalFoldSync = true
  try {
    if (isFolded) {
      editorView.dispatch({
        effects: foldEffect.of(range)
      })
    } else {
      editorView.dispatch({
        effects: unfoldEffect.of(range)
      })
    }
  } finally {
    setTimeout(() => {
      isInternalFoldSync = false
    }, 50)
  }
}

const foldAllNodes = () => {
  if (!editorView) return
  isInternalFoldSync = true
  try {
    unfoldAll(editorView)

    const state = editorView.state
    const tree = syntaxTree(state)
    let root = null
    let c = tree.topNode.firstChild
    while (c) {
      if (c.name === 'Object' || c.name === 'Array') {
        root = c
        break
      }
      c = c.nextSibling
    }

    if (!root) {
      foldAll(editorView)
      return
    }

    const effects = []

    const collectFoldableRanges = (node, depth = 0) => {
      let child = node.firstChild
      while (child) {
        if (child.name === 'Property') {
          let valNode = child.getChild('PropertyName')?.nextSibling
          while (valNode && (valNode.name === ':' || valNode.name === ',')) {
            valNode = valNode.nextSibling
          }
          if (valNode && (valNode.name === 'Object' || valNode.name === 'Array')) {
            const startLine = state.doc.lineAt(valNode.from)
            const endLine = state.doc.lineAt(valNode.to)
            if (endLine.number > startLine.number) {
              effects.push(foldEffect.of({ from: valNode.from + 1, to: valNode.to - 1 }))
              collectFoldableRanges(valNode, depth + 1)
            }
          }
        } else if (child.name === 'Object' || child.name === 'Array') {
          if (depth > 0 || node === root) {
            const startLine = state.doc.lineAt(child.from)
            const endLine = state.doc.lineAt(child.to)
            if (endLine.number > startLine.number) {
              effects.push(foldEffect.of({ from: child.from + 1, to: child.to - 1 }))
            }
          }
          collectFoldableRanges(child, depth + 1)
        }
        child = child.nextSibling
      }
    }

    collectFoldableRanges(root, 0)

    if (effects.length > 0) {
      editorView.dispatch({ effects })
    }
  } catch (e) {
    console.warn('foldAllNodes error:', e)
  } finally {
    setTimeout(() => {
      isInternalFoldSync = false
    }, 50)
  }
}

const unfoldAllNodes = () => {
  if (!editorView) return
  isInternalFoldSync = true
  try {
    unfoldAll(editorView)
  } finally {
    setTimeout(() => {
      isInternalFoldSync = false
    }, 50)
  }
}

watch(treeExpanded, (val) => {
  if (val) {
    unfoldAllNodes()
  } else {
    foldAllNodes()
  }
})

defineExpose({
  scrollToLine,
  scrollToTop,
  scrollToBottom,
  setScrollTop,
  setScrollLeft,
  focus,
  getSelectionRange,
  setSelectionRange,
  showFloatingCopy,
  hideFloatingCopy,
  findNext: doFindNext,
  findPrevious: doFindPrevious,
  replaceNext: doReplaceNext,
  replaceAll: doReplaceAll,
  goToMatch,
  syncSearchQuery,
  foldPath,
  foldAll: foldAllNodes,
  unfoldAll: unfoldAllNodes,
  getEditorView: () => editorView,
  getScrollDOM: () => editorView?.scrollDOM
})

onMounted(() => {
  initCodeMirror()
})

onBeforeUnmount(() => {
  if (copyTimeoutId) clearTimeout(copyTimeoutId)
  if (autoHideTimeoutId) clearTimeout(autoHideTimeoutId)
  if (externalSelectionTimer) clearTimeout(externalSelectionTimer)
  if (editorView) {
    if (editorView.scrollDOM) {
      editorView.scrollDOM.removeEventListener('scroll', handleEditorScrollDOM)
    }
    editorView.destroy()
    editorView = null
  }
})
</script>

<style scoped>
.codemirror-editor-wrapper {
  position: relative;
  width: 100%;
  height: 100%;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

:deep(.cm-editor) {
  height: 100%;
  outline: none !important;
}

:deep(.cm-content),
:deep(.cm-content.cm-lineWrapping),
:deep(.cm-lineWrapping .cm-line),
:deep(.cm-line) {
  word-break: break-all !important;
  overflow-wrap: anywhere !important;
}

:deep(.cm-line:hover) {
  background-color: var(--bg-hover, rgba(255, 255, 255, 0.03));
}

:deep(.cm-lineNumbers) {
  min-width: 28px !important;
}

:deep(.cm-lineNumbers .cm-gutterElement) {
  min-width: 20px !important;
  text-align: right !important;
  padding: 0 5px 0 3px !important;
  box-sizing: border-box !important;
  font-variant-numeric: tabular-nums !important;
  transition: color 0.12s ease !important;
}

:deep(.cm-lineNumbers .cm-gutterElement.cm-activeLineGutter) {
  font-size: 0.88em !important;
  font-weight: 800 !important;
}

:deep(.cm-foldGutter) {
  width: 14px !important;
}

:deep(.cm-foldGutter .cm-gutterElement) {
  display: flex !important;
  align-items: center !important;
  justify-content: center !important;
  padding: 0 !important;
  cursor: pointer !important;
  color: var(--text-muted, #94a3b8) !important;
  transition: color 0.15s ease !important;
}

:deep(.cm-foldGutter .cm-gutterElement:hover) {
  color: var(--text-primary, #0f172a) !important;
}

:deep(.cm-custom-fold-marker) {
  display: inline-flex !important;
  align-items: center !important;
  justify-content: center !important;
  width: 11px !important;
  height: 11px !important;
}

:deep(.cm-custom-fold-marker svg) {
  width: 11px !important;
  height: 11px !important;
  display: block !important;
}

:deep(.cm-foldPlaceholder) {
  background-color: rgba(0, 0, 0, 0.05) !important;
  border: none !important;
  color: var(--text-muted, #94a3b8) !important;
  border-radius: 3px !important;
  margin: 0 2px !important;
  padding: 0 4px !important;
  cursor: pointer !important;
  font-size: 0.85em !important;
  user-select: none !important;
  transition: all 0.15s ease !important;
}

:deep(.cm-foldPlaceholder:hover) {
  background-color: rgba(0, 0, 0, 0.1) !important;
  color: var(--text-primary, #0f172a) !important;
}

:global(.dark-mode) :deep(.cm-foldPlaceholder),
:deep(.dark-mode .cm-foldPlaceholder) {
  background-color: rgba(255, 255, 255, 0.08) !important;
  border: none !important;
  color: var(--text-muted, #94a3b8) !important;
}

:global(.dark-mode) :deep(.cm-foldPlaceholder:hover),
:deep(.dark-mode .cm-foldPlaceholder:hover) {
  background-color: rgba(255, 255, 255, 0.15) !important;
  color: #e2e8f0 !important;
}

/* ── Floating Selection Toolbar (复制 / 新 Tab 打开双按钮工具条) ── */
.floating-selection-toolbar {
  position: absolute;
  z-index: 100;
  display: inline-flex;
  align-items: center;
  gap: 2px;
  padding: 2px 3px;
  border-radius: 6px;
  user-select: none;
  border: 1px solid var(--border-color, rgba(148, 163, 184, 0.28));
  background: var(--bg-surface-elevated, #ffffff);
  box-shadow: 0 4px 14px rgba(0, 0, 0, 0.12), 0 1px 3px rgba(0, 0, 0, 0.08);
  transition: all 0.15s cubic-bezier(0.16, 1, 0.3, 1);
  transform-origin: center bottom;
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
}

:global(.dark-mode) .floating-selection-toolbar,
.floating-selection-toolbar.is-dark {
  background: var(--bg-surface-elevated, #242427);
  border-color: var(--border-color, rgba(255, 255, 255, 0.16));
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.45), 0 1px 3px rgba(0, 0, 0, 0.25);
}

.floating-toolbar-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  padding: 0;
  border: none;
  background: transparent;
  border-radius: 4px;
  color: var(--text-secondary, #475569);
  cursor: pointer;
  transition: all 0.15s ease;
}

:global(.dark-mode) .floating-toolbar-btn,
.floating-selection-toolbar.is-dark .floating-toolbar-btn {
  color: var(--text-secondary, #cbd5e1);
}

.floating-toolbar-btn:hover {
  background: var(--primary-light, rgba(59, 130, 246, 0.12));
  color: var(--primary-color, #3b82f6);
  transform: scale(1.06);
}

.floating-toolbar-btn.is-copied {
  color: #22c55e !important;
  background: rgba(34, 197, 94, 0.14) !important;
}

:global(.dark-mode) .floating-toolbar-btn.is-copied,
.floating-selection-toolbar.is-dark .floating-toolbar-btn.is-copied {
  color: #4ade80 !important;
  background: rgba(34, 197, 94, 0.2) !important;
}

.floating-toolbar-sep {
  width: 1px;
  height: 12px;
  background: var(--border-color, rgba(148, 163, 184, 0.25));
  margin: 0 1px;
}

:global(.dark-mode) .floating-toolbar-sep,
.floating-selection-toolbar.is-dark .floating-toolbar-sep {
  background: rgba(255, 255, 255, 0.15);
}

.floating-toolbar-icon {
  width: 13px;
  height: 13px;
  stroke-width: 2;
  transition: transform 0.2s cubic-bezier(0.34, 1.56, 0.64, 1);
}

.floating-toolbar-icon.is-copied {
  transform: scale(1.12);
}

.floating-copy-fade-enter-active,
.floating-copy-fade-leave-active {
  transition: opacity 0.16s cubic-bezier(0.16, 1, 0.3, 1), transform 0.16s cubic-bezier(0.16, 1, 0.3, 1);
}

.floating-copy-fade-enter-from,
.floating-copy-fade-leave-to {
  opacity: 0;
  transform: translateY(3px) scale(0.85);
}

/* Custom minimal scrollbar */
:deep(.cm-scroller::-webkit-scrollbar) {
  width: 7px;
  height: 7px;
}

:deep(.cm-scroller::-webkit-scrollbar-track) {
  background: transparent;
}

:deep(.cm-scroller::-webkit-scrollbar-thumb) {
  background: rgba(148, 163, 184, 0.45);
  border-radius: 4px;
}

:deep(.cm-scroller::-webkit-scrollbar-thumb:hover) {
  background: rgba(148, 163, 184, 0.8);
}

/* Selection Layer stacking fix: ensure selection appears visibly over error & active line backgrounds */
:deep(.cm-selectionLayer) {
  z-index: 10 !important;
  pointer-events: none !important;
}

:deep(.cm-selectionBackground) {
  pointer-events: none !important;
  background-color: rgba(37, 99, 235, 0.25) !important;
}

:global(.dark-mode) :deep(.cm-selectionBackground),
:deep(.dark-mode .cm-selectionBackground) {
  background-color: rgba(56, 189, 248, 0.3) !important;
}
</style>
