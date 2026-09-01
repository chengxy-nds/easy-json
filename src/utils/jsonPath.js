/**
 * jsonPath.js - 高性能轻量 JSONPath 表达式求值引擎
 */

/**
 * 执行 JSONPath 查询
 * @param {any} root 根 JSON 数据
 * @param {string} pathExpr JSONPath 表达式 (例如: `$.data.list[*].id`, `$..name`, `$[?(@.age > 18)]`)
 * @returns {any[]} 匹配到的结果数组
 */
export function queryJsonPath(root, pathExpr) {
  if (!pathExpr || typeof pathExpr !== 'string') return []
  const expr = pathExpr.trim()
  if (!expr || expr === '$') return [root]

  // 解析 tokens
  // 规范化: 将点语法和中括号语法分词
  // 例如: $.data.list[*].id -> ['data', 'list', '*', 'id']
  // $..name -> ['..', 'name']
  // $[?(@.age > 18)] -> ['?(@.age > 18)']

  function tokenize(path) {
    if (path.startsWith('$')) path = path.slice(1)
    const tokens = []
    let i = 0
    while (i < path.length) {
      if (path[i] === '.') {
        if (path[i + 1] === '.') {
          tokens.push('..')
          i += 2
        } else {
          i++
        }
        continue
      }

      if (path[i] === '[') {
        const closeIdx = path.indexOf(']', i)
        if (closeIdx === -1) break
        let inside = path.slice(i + 1, closeIdx).trim()
        if ((inside.startsWith("'") && inside.endsWith("'")) || (inside.startsWith('"') && inside.endsWith('"'))) {
          inside = inside.slice(1, -1)
        }
        tokens.push(inside)
        i = closeIdx + 1
        continue
      }

      let nextDot = path.indexOf('.', i)
      let nextBracket = path.indexOf('[', i)
      let end = path.length
      if (nextDot !== -1 && nextBracket !== -1) {
        end = Math.min(nextDot, nextBracket)
      } else if (nextDot !== -1) {
        end = nextDot
      } else if (nextBracket !== -1) {
        end = nextBracket
      }

      const segment = path.slice(i, end).trim()
      if (segment) tokens.push(segment)
      i = end
    }
    return tokens
  }

  const tokens = tokenize(expr)
  let currentNodes = [root]

  for (let t = 0; t < tokens.length; t++) {
    const token = tokens[t]

    if (token === '..') {
      // 递归深层搜索下一个 token
      t++
      const targetKey = tokens[t]
      if (!targetKey) break

      const descNodes = []
      function searchRecursive(node) {
        if (node === null || typeof node !== 'object') return

        if (Array.isArray(node)) {
          for (const item of node) {
            searchRecursive(item)
          }
        } else {
          if (targetKey === '*' || Object.prototype.hasOwnProperty.call(node, targetKey)) {
            if (targetKey === '*') {
              Object.values(node).forEach(v => descNodes.push(v))
            } else {
              descNodes.push(node[targetKey])
            }
          }
          for (const k of Object.keys(node)) {
            searchRecursive(node[k])
          }
        }
      }

      for (const node of currentNodes) {
        searchRecursive(node)
      }
      currentNodes = descNodes
      continue
    }

    const nextNodes = []

    for (const node of currentNodes) {
      if (node === null || node === undefined) continue

      // 通配符 *
      if (token === '*') {
        if (Array.isArray(node)) {
          nextNodes.push(...node)
        } else if (typeof node === 'object') {
          nextNodes.push(...Object.values(node))
        }
        continue
      }

      // 条件过滤表达式: ?(@.field > 10) 或 ?(@.status == 'ok')
      if (token.startsWith('?(') && token.endsWith(')')) {
        const predicate = token.slice(2, -1).trim()
        if (Array.isArray(node)) {
          for (const item of node) {
            if (evalPredicate(item, predicate)) {
              nextNodes.push(item)
            }
          }
        }
        continue
      }

      // 切片语法: [start:end]
      if (token.includes(':') && Array.isArray(node)) {
        const parts = token.split(':').map(p => p.trim())
        const start = parts[0] ? parseInt(parts[0], 10) : 0
        const end = parts[1] ? parseInt(parts[1], 10) : node.length
        nextNodes.push(...node.slice(start, end))
        continue
      }

      // 数组索引
      if (Array.isArray(node)) {
        const num = Number(token)
        if (!isNaN(num)) {
          const idx = num < 0 ? node.length + num : num
          if (idx >= 0 && idx < node.length) {
            nextNodes.push(node[idx])
          }
        }
        continue
      }

      // 普通属性访问
      if (typeof node === 'object' && Object.prototype.hasOwnProperty.call(node, token)) {
        nextNodes.push(node[token])
      }
    }

    currentNodes = nextNodes
  }

  return currentNodes
}

// 评估过滤条件
function evalPredicate(item, predicate) {
  if (item === null || typeof item !== 'object') return false

  // 匹配形如: @.prop > 100, @.status == 'SUCCESS', @.active == true, @.name
  const match = predicate.match(/@(?:\.([\w-]+)|\[['"]([^'"]+)['"]\])\s*(==|!=|>=|<=|>|<|=~)?\s*(.*)?/)
  if (!match) return false

  const field = match[1] || match[2]
  const op = match[3]
  let expected = match[4]?.trim()

  const actual = item[field]
  if (!op) return actual !== undefined && actual !== null

  if (expected !== undefined) {
    if ((expected.startsWith("'") && expected.endsWith("'")) || (expected.startsWith('"') && expected.endsWith('"'))) {
      expected = expected.slice(1, -1)
    } else if (expected === 'true') {
      expected = true
    } else if (expected === 'false') {
      expected = false
    } else if (expected === 'null') {
      expected = null
    } else if (!isNaN(Number(expected))) {
      expected = Number(expected)
    }
  }

  switch (op) {
    case '==':
      return actual == expected
    case '!=':
      return actual != expected
    case '>':
      return actual > expected
    case '>=':
      return actual >= expected
    case '<':
      return actual < expected
    case '<=':
      return actual <= expected
    case '=~':
      try {
        return new RegExp(String(expected)).test(String(actual))
      } catch {
        return false
      }
    default:
      return !!actual
  }
}
