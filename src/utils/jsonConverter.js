// ─── JSON → 其他格式转换工具 ───

import { safeParse, safeStringify } from './jsonBigInt.js'

// 递归判断 JSON 值是对象还是数组
const isObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v)
const isArray  = (v) => v !== null && typeof v === 'object' &&  Array.isArray(v)

// ═══ 1. JSON → XML ═══
export const jsonToXml = (jsonStr) => {
  const obj = safeParse(jsonStr)
  const build = (node, name) => {
    if (isArray(node)) {
      return node.map((item, i) => build(item, name || 'item')).join('\n')
    }
    if (isObject(node)) {
      const children = Object.entries(node)
        .map(([k, v]) => build(v, k))
        .join('\n')
      return name
        ? `<${name}>\n${indent(children)}\n</${name}>`
        : children
    }
    // primitive
    const esc = String(node).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    return name ? `<${name}>${esc}</${name}>` : esc
  }
  const rootName = Object.keys(obj)[0] || 'root'
  if (isObject(obj) && Object.keys(obj).length === 1) {
    return `<?xml version="1.0" encoding="UTF-8"?>\n${build(obj[rootName], rootName)}`
  }
  return `<?xml version="1.0" encoding="UTF-8"?>\n<root>\n${indent(build(obj, ''))}\n</root>`
}

const indent = (s) => s.split('\n').map(l => '  ' + l).join('\n')

// ═══ 2. JSON → CSV ═══
export const jsonToCsv = (jsonStr) => {
  const obj = safeParse(jsonStr)
  let rows = isArray(obj) ? obj : [obj]
  rows = rows.map(r => {
    if (isObject(r)) return r
    return { value: r }
  })
  const headers = [...new Set(rows.flatMap(r => Object.keys(r)))]
  const formatCsvVal = (v) => {
    if (v === null || v === undefined) return ''
    if (isObject(v)) return JSON.stringify(v)
    if (isArray(v)) return v.map(formatCsvVal).join('; ')
    const s = String(v)
    if (s.includes(',') || s.includes('"') || s.includes('\n') || s.includes(';')) {
      return '"' + s.replace(/"/g, '""') + '"'
    }
    return s
  }
  const headerLine = headers.map(h => '"' + h + '"').join(',')
  const dataLines = rows.map(r =>
    headers.map(h => formatCsvVal(r[h] ?? '')).join(',')
  )
  return [headerLine, ...dataLines].join('\n')
}

// ═══ 3. JSON → YAML ═══
export const jsonToYaml = (jsonStr) => {
  const obj = safeParse(jsonStr)
  const toYaml = (node, depth = 0) => {
    const pad = '  '.repeat(depth)
    if (isArray(node)) {
      if (node.length === 0) return '[]'
      return node.map(item => {
        if (isObject(item)) {
          const entries = Object.entries(item)
          return entries.map(([k, v], i) => {
            if (isObject(v) || isArray(v)) {
              return `${pad}${i === 0 ? '- ' : '  '}${k}:\n${toYaml(v, depth + 1)}`
            }
            return `${pad}${i === 0 ? '- ' : '  '}${k}: ${formatScalar(v)}`
          }).join('\n')
        }
        return `${pad}- ${formatScalar(item)}`
      }).join('\n')
    }
    if (isObject(node)) {
      const entries = Object.entries(node)
      return entries.map(([k, v]) => {
        if (isObject(v) || isArray(v)) {
          return `${pad}${k}:\n${toYaml(v, depth + 1)}`
        }
        return `${pad}${k}: ${formatScalar(v)}`
      }).join('\n')
    }
    return String(node)
  }
  return toYaml(obj)
}

const formatScalar = (v) => {
  if (v === null) return 'null'
  if (typeof v === 'boolean') return v ? 'true' : 'false'
  if (typeof v === 'number' || typeof v === 'bigint') return String(v)
  const s = String(v)
  if (s.includes(':') || s.includes('#') || s.includes('"') || s.includes("'") || s.includes('\n')) {
    return '"' + s.replace(/"/g, '\\"') + '"'
  }
  return s
}

// ═══ 4. JSON → TOML ═══
export const jsonToToml = (jsonStr) => {
  const obj = safeParse(jsonStr)
  const toToml = (node, prefix = '') => {
    const lines = []
    for (const [k, v] of Object.entries(node)) {
      const fullKey = prefix ? `${prefix}.${k}` : k
      if (isObject(v)) {
        lines.push('')
        lines.push(`[${fullKey}]`)
        for (const [sk, sv] of Object.entries(v)) {
          if (isObject(sv) || isArray(sv)) {
            lines.push(...toToml({ [sk]: sv }, fullKey).split('\n').filter(l => l))
          } else {
            lines.push(`${sk} = ${tomlValue(sv)}`)
          }
        }
      } else if (isArray(v)) {
        if (v.every(item => isObject(item))) {
          // Array of tables
          for (const item of v) {
            lines.push('')
            lines.push(`[[${fullKey}]]`)
            for (const [ik, iv] of Object.entries(item)) {
              lines.push(`${ik} = ${tomlValue(iv)}`)
            }
          }
        } else {
          lines.push(`${k} = [${v.map(tomlValue).join(', ')}]`)
        }
      } else {
        lines.push(`${k} = ${tomlValue(v)}`)
      }
    }
    return lines.join('\n')
  }
  return toToml(obj).replace(/^\n+/, '')
}

const tomlValue = (v) => {
  if (v === null) return 'null'
  if (typeof v === 'boolean') return v ? 'true' : 'false'
  if (typeof v === 'number' || typeof v === 'bigint') return String(v)
  return '"' + String(v).replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n').replace(/\r/g, '\\r').replace(/\t/g, '\\t') + '"'
}

// ═══ 5. JSON → Java POJO ═══
export const jsonToJavaPojo = (jsonStr, rootName = 'Root') => {
  const obj = safeParse(jsonStr)
  const classes = []
  const generated = new Set()

  const javaType = (val, key) => {
    if (val === null) return 'Object'
    if (typeof val === 'boolean') return 'Boolean'
    if (typeof val === 'bigint') return 'Long'
    if (typeof val === 'number') {
      return Number.isInteger(val) ? 'Integer' : 'Double'
    }
    if (typeof val === 'string') return 'String'
    if (isArray(val)) {
      if (val.length > 0) return `List<${javaType(val[0], key)}>`
      return 'List<Object>'
    }
    // 嵌套对象
    const className = toPascalCase(key)
    if (!generated.has(className)) {
      generated.add(className)
      classes.push(generateClass(className, val))
    }
    return className
  }

  const generateClass = (name, node) => {
    const fields = Object.entries(node).map(([k, v]) => {
      const type = javaType(v, k)
      return { name: toCamelCase(k), type, originalKey: k }
    })
    const lines = []
    lines.push(`public class ${name} {`)
    // Fields
    for (const f of fields) {
      lines.push(`    private ${f.type} ${f.name};`)
    }
    lines.push('')
    // Getters and setters
    for (const f of fields) {
      const getter = f.type === 'Boolean' ? 'is' : 'get'
      const cap = toPascalCase(f.name)
      lines.push(`    public ${f.type} ${getter}${cap}() {`)
      lines.push(`        return ${f.name};`)
      lines.push(`    }`)
      lines.push('')
      lines.push(`    public void set${cap}(${f.type} ${f.name}) {`)
      lines.push(`        this.${f.name} = ${f.name};`)
      lines.push(`    }`)
      if (f !== fields[fields.length - 1]) lines.push('')
    }
    lines.push('}')
    return lines.join('\n')
  }

  classes.push(generateClass(rootName, obj))
  return classes.reverse().join('\n\n')
}

// ═══ 6. JSON → TypeScript Interface ═══
export const jsonToTsInterface = (jsonStr, rootName = 'Root') => {
  const obj = safeParse(jsonStr)
  const interfaces = []
  const generated = new Set()

  const tsType = (val, key) => {
    if (val === null) return 'null'
    if (typeof val === 'boolean') return 'boolean'
    if (typeof val === 'number' || typeof val === 'bigint') return 'number'
    if (typeof val === 'string') return 'string'
    if (isArray(val)) {
      if (val.length > 0) return `${tsType(val[0], key)}[]`
      return 'any[]'
    }
    const name = toPascalCase(key)
    if (!generated.has(name)) {
      generated.add(name)
      interfaces.push(generateInterface(name, val))
    }
    return name
  }

  const generateInterface = (name, node) => {
    const lines = []
    lines.push(`export interface ${name} {`)
    for (const [k, v] of Object.entries(node)) {
      const type = tsType(v, k)
      const optional = v === null ? '?' : ''
      lines.push(`  ${toCamelCase(k)}${optional}: ${type};`)
    }
    lines.push('}')
    return lines.join('\n')
  }

  interfaces.push(generateInterface(rootName, obj))
  return interfaces.reverse().join('\n\n')
}

// ═══ 7. JSON → MySQL CREATE TABLE ═══
export const jsonToMysql = (jsonStr, tableName = 'my_table') => {
  const obj = safeParse(jsonStr)
  const rows = isArray(obj) ? obj : [obj]
  // 从多行数据推断列类型（取最宽泛的类型）
  const columns = {}
  for (const row of rows) {
    if (!isObject(row)) continue
    for (const [k, v] of Object.entries(row)) {
      if (v === null) {
        if (columns[k]) columns[k].nullable = true
        continue
      }
      const inferred = mysqlType(v)
      if (!columns[k]) {
        columns[k] = { type: inferred, nullable: false }
      } else {
        // 合并类型：JSON > TEXT > DOUBLE > BIGINT > BOOLEAN
        const current = columns[k]
        const newType = mysqlType(v)
        if (newType === 'JSON' || current.type === 'JSON') current.type = 'JSON'
        else if (newType === 'TEXT' || current.type === 'TEXT') current.type = 'TEXT'
        else if (newType === 'DOUBLE' || current.type === 'DOUBLE') current.type = 'DOUBLE'
        else if (newType === 'BIGINT' || current.type === 'BIGINT') current.type = 'BIGINT'
        else if (newType === 'BOOLEAN' && current.type === 'BOOLEAN') current.type = 'BOOLEAN'
      }
    }
  }

  const lines = []
  // 如果没有推断出任何列，添加一个兜底 id 列
  const colEntries = Object.keys(columns).length > 0
    ? Object.entries(columns)
    : [['id', { type: 'BIGINT', nullable: false }]]
  lines.push(`CREATE TABLE \`${tableName}\` (`)
  const cols = colEntries.map(([name, info], i) => {
    const comma = i < colEntries.length - 1 ? ',' : ''
    const nullable = info.nullable ? ' DEFAULT NULL' : ' NOT NULL'
    return `  \`${name}\` ${info.type}${nullable}${comma}`
  })
  lines.push(cols.join('\n'))
  lines.push(') ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;')
  return lines.join('\n')
}

const mysqlType = (v) => {
  if (v === null) return 'TEXT'
  if (typeof v === 'boolean') return 'BOOLEAN'
  if (typeof v === 'bigint') return 'BIGINT'
  if (typeof v === 'number') {
    return Number.isInteger(v) ? 'BIGINT' : 'DOUBLE'
  }
  if (isArray(v)) return 'JSON'
  if (isObject(v)) return 'JSON'
  const s = String(v)
  if (s.length > 255) return 'TEXT'
  if (s.length > 100) return 'VARCHAR(255)'
  if (/^\d{4}-\d{2}-\d{2}([ T]\d{2}:\d{2}:\d{2})?$/.test(s)) return 'DATETIME'
  return 'VARCHAR(100)'
}

// ═══ 8. JSON → Go Struct ═══
export const jsonToGoStruct = (jsonStr, rootName = 'Root') => {
  const obj = safeParse(jsonStr)
  const structs = []
  const generated = new Set()

  const goType = (val, key) => {
    if (val === null) return 'interface{}'
    if (typeof val === 'boolean') return 'bool'
    if (typeof val === 'bigint') return 'int64'
    if (typeof val === 'number') {
      return Number.isInteger(val) ? 'int64' : 'float64'
    }
    if (typeof val === 'string') return 'string'
    if (isArray(val)) {
      if (val.length > 0) return `[]${goType(val[0], key)}`
      return '[]interface{}'
    }
    const name = toPascalCase(key)
    if (!generated.has(name)) {
      generated.add(name)
      structs.push(generateStruct(name, val))
    }
    return '*' + name
  }

  const generateStruct = (name, node) => {
    const lines = []
    lines.push(`type ${name} struct {`)
    for (const [k, v] of Object.entries(node)) {
      const type = goType(v, k)
      const tag = `\`json:"${k}"\``
      const fieldName = toPascalCase(k)
      lines.push(`  ${fieldName} ${type} ${tag}`)
    }
    lines.push('}')
    return lines.join('\n')
  }

  structs.push(generateStruct(rootName, obj))
  return structs.reverse().join('\n\n')
}

// ═══ 9. JSON → Protobuf ═══
export const jsonToProtobuf = (jsonStr, rootName = 'Root') => {
  const obj = safeParse(jsonStr)
  const messages = []
  const generated = new Set()
  let fieldNum = 1

  const protoType = (val, key) => {
    if (val === null) return 'string'
    if (typeof val === 'boolean') return 'bool'
    if (typeof val === 'bigint') return 'int64'
    if (typeof val === 'number') {
      return Number.isInteger(val) ? 'int64' : 'double'
    }
    if (typeof val === 'string') return 'string'
    if (isArray(val)) {
      if (val.length > 0) return `repeated ${protoType(val[0], key)}`
      return 'repeated string'
    }
    const name = toPascalCase(key)
    if (!generated.has(name)) {
      generated.add(name)
      messages.push(generateMessage(name, val))
    }
    return name
  }

  const generateMessage = (name, node) => {
    let num = 1
    const lines = []
    lines.push(`message ${name} {`)
    for (const [k, v] of Object.entries(node)) {
      const type = protoType(v, k)
      const fieldName = toSnakeCase(k)
      lines.push(`  ${type} ${fieldName} = ${num++};`)
    }
    lines.push('}')
    return lines.join('\n')
  }

  messages.push(generateMessage(rootName, obj))
  return 'syntax = "proto3";\n\n' + messages.reverse().join('\n\n')
}

// ═══ 10. JSON → Rust Struct ═══
export const jsonToRust = (jsonStr, rootName = 'Root') => {
  const obj = safeParse(jsonStr)
  const structs = []
  const generated = new Set()

  const rustType = (val, key) => {
    if (val === null) return 'Option<String>'
    if (typeof val === 'boolean') return 'bool'
    if (typeof val === 'bigint') return 'i64'
    if (typeof val === 'number') return Number.isInteger(val) ? 'i64' : 'f64'
    if (typeof val === 'string') return 'String'
    if (isArray(val)) {
      if (val.length > 0) return `Vec<${rustType(val[0], key)}>`
      return 'Vec<String>'
    }
    const name = toPascalCase(key)
    if (!generated.has(name)) { generated.add(name); structs.push(generateStruct(name, val)) }
    return name
  }

  const generateStruct = (name, node) => {
    const lines = [`#[derive(Debug, Clone, Serialize, Deserialize)]`, `pub struct ${name} {`]
    const entries = Object.entries(node)
    entries.forEach(([k, v], i) => {
      const comma = i < entries.length - 1 ? ',' : ''
      lines.push(`    pub ${toSnakeCase(k)}: ${rustType(v, k)}${comma}`)
    })
    lines.push('}')
    return lines.join('\n')
  }

  structs.push(generateStruct(rootName, obj))
  return 'use serde::{Deserialize, Serialize};\n\n' + structs.reverse().join('\n\n')
}

// ═══ 11. JSON → Python dataclass ═══
export const jsonToPython = (jsonStr, rootName = 'Root') => {
  const obj = safeParse(jsonStr)
  const classes = []
  const generated = new Set()

  const pyType = (val, key) => {
    if (val === null) return 'Optional[Any]'
    if (typeof val === 'boolean') return 'bool'
    if (typeof val === 'bigint') return 'int'
    if (typeof val === 'number') return Number.isInteger(val) ? 'int' : 'float'
    if (typeof val === 'string') return 'str'
    if (isArray(val)) {
      if (val.length > 0) return `List[${pyType(val[0], key)}]`
      return 'List[Any]'
    }
    const name = toPascalCase(key)
    if (!generated.has(name)) { generated.add(name); classes.push(generateClass(name, val)) }
    return name
  }

  const generateClass = (name, node) => {
    const lines = ['@dataclass', `class ${name}:`]
    if (Object.keys(node).length === 0) { lines.push('    pass'); return lines.join('\n') }
    for (const [k, v] of Object.entries(node)) {
      lines.push(`    ${toSnakeCase(k)}: ${pyType(v, k)}`)
    }
    return lines.join('\n')
  }

  classes.push(generateClass(rootName, obj))
  const imports = 'from dataclasses import dataclass\nfrom typing import Any, List, Optional\n\n'
  return imports + classes.reverse().join('\n\n')
}

// ═══ 12. JSON → Kotlin data class ═══
export const jsonToKotlin = (jsonStr, rootName = 'Root') => {
  const obj = safeParse(jsonStr)
  const classes = []
  const generated = new Set()

  const ktType = (val, key) => {
    if (val === null) return 'Any'
    if (typeof val === 'boolean') return 'Boolean'
    if (typeof val === 'bigint') return 'Long'
    if (typeof val === 'number') return Number.isInteger(val) ? 'Int' : 'Double'
    if (typeof val === 'string') return 'String'
    if (isArray(val)) {
      if (val.length > 0) return `List<${ktType(val[0], key)}>`
      return 'List<Any>'
    }
    const name = toPascalCase(key)
    if (!generated.has(name)) { generated.add(name); classes.push(generateClass(name, val)) }
    return name
  }

  const generateClass = (name, node) => {
    const lines = [`data class ${name}(`]
    const entries = Object.entries(node)
    entries.forEach(([k, v], i) => {
      const comma = i < entries.length - 1 ? ',' : ''
      const nullable = v === null ? '?' : ''
      lines.push(`    val ${toCamelCase(k)}: ${ktType(v, k)}${nullable}${comma}`)
    })
    lines.push(')')
    return lines.join('\n')
  }

  classes.push(generateClass(rootName, obj))
  return classes.reverse().join('\n\n')
}

// ═══ 13. JSON → C# class ═══
export const jsonToCSharp = (jsonStr, rootName = 'Root') => {
  const obj = safeParse(jsonStr)
  const classes = []
  const generated = new Set()

  const csType = (val, key) => {
    if (val === null) return 'object?'
    if (typeof val === 'boolean') return 'bool'
    if (typeof val === 'bigint') return 'long'
    if (typeof val === 'number') return Number.isInteger(val) ? 'long' : 'double'
    if (typeof val === 'string') return 'string'
    if (isArray(val)) {
      if (val.length > 0) return `List<${csType(val[0], key)}>`
      return 'List<object>'
    }
    const name = toPascalCase(key)
    if (!generated.has(name)) { generated.add(name); classes.push(generateClass(name, val)) }
    return name
  }

  const generateClass = (name, node) => {
    const lines = [`public class ${name}`]
    lines.push('{')
    for (const [k, v] of Object.entries(node)) {
      const ty = csType(v, k)
      const prop = toPascalCase(k)
      const field = '_' + toCamelCase(k)
      lines.push(`    private ${ty} ${field};`)
      lines.push(`    public ${ty} ${prop}`)
      lines.push('    {')
      lines.push(`        get => ${field};`)
      lines.push(`        set => ${field} = value;`)
      lines.push('    }')
    }
    lines.push('}')
    return lines.join('\n')
  }

  classes.push(generateClass(rootName, obj))
  return classes.reverse().join('\n\n')
}

// ═══ 14. JSON → Dart class ═══
export const jsonToDart = (jsonStr, rootName = 'Root') => {
  const obj = safeParse(jsonStr)
  const classes = []
  const generated = new Set()

  const dartType = (val, key) => {
    if (val === null) return 'dynamic'
    if (typeof val === 'boolean') return 'bool'
    if (typeof val === 'bigint') return 'int'
    if (typeof val === 'number') return Number.isInteger(val) ? 'int' : 'double'
    if (typeof val === 'string') return 'String'
    if (isArray(val)) {
      if (val.length > 0) return `List<${dartType(val[0], key)}>`
      return 'List<dynamic>'
    }
    const name = toPascalCase(key)
    if (!generated.has(name)) { generated.add(name); classes.push(generateClass(name, val)) }
    return name
  }

  const generateClass = (name, node) => {
    const lines = [`class ${name} {`]
    const entries = Object.entries(node)
    for (const [k, v] of entries) {
      lines.push(`  final ${dartType(v, k)} ${toCamelCase(k)};`)
    }
    lines.push('')
    lines.push(`  ${name}({`)
    entries.forEach(([k], i, arr) => {
      const comma = i < arr.length - 1 ? ',' : ''
      lines.push(`    required this.${toCamelCase(k)}${comma}`)
    })
    lines.push('  });')
    lines.push('')
    // fromJson — 嵌套对象递归调用 .fromJson()
    lines.push(`  factory ${name}.fromJson(Map<String, dynamic> json) => ${name}(`)
    entries.forEach(([k, v], i, arr) => {
      const comma = i < arr.length - 1 ? ',' : ''
      const field = toCamelCase(k)
      if (isObject(v)) {
        lines.push(`    ${field}: ${dartType(v, k)}.fromJson(json['${k}'])${comma}`)
      } else if (isArray(v) && v.length > 0 && isObject(v[0])) {
        lines.push(`    ${field}: (json['${k}'] as List).map((e) => ${dartType(v[0], k)}.fromJson(e)).toList()${comma}`)
      } else {
        lines.push(`    ${field}: json['${k}']${comma}`)
      }
    })
    lines.push('  );')
    lines.push('')
    // toJson — 嵌套对象递归调用 .toJson()
    lines.push('  Map<String, dynamic> toJson() => {')
    entries.forEach(([k, v], i, arr) => {
      const comma = i < arr.length - 1 ? ',' : ''
      const field = toCamelCase(k)
      if (isObject(v)) {
        lines.push(`    '${k}': ${field}.toJson()${comma}`)
      } else if (isArray(v) && v.length > 0 && isObject(v[0])) {
        lines.push(`    '${k}': ${field}.map((e) => e.toJson()).toList()${comma}`)
      } else {
        lines.push(`    '${k}': ${field}${comma}`)
      }
    })
    lines.push('  };')
    lines.push('}')
    return lines.join('\n')
  }

  classes.push(generateClass(rootName, obj))
  return classes.reverse().join('\n\n')
}

// ═══ 15. JSON → Swift Codable ═══
export const jsonToSwift = (jsonStr, rootName = 'Root') => {
  const obj = safeParse(jsonStr)
  const structs = []
  const generated = new Set()

  const swiftType = (val, key) => {
    if (val === null) return 'String'
    if (typeof val === 'boolean') return 'Bool'
    if (typeof val === 'bigint') return 'Int64'
    if (typeof val === 'number') return Number.isInteger(val) ? 'Int' : 'Double'
    if (typeof val === 'string') return 'String'
    if (isArray(val)) {
      if (val.length > 0) return `[${swiftType(val[0], key)}]`
      return '[String]'
    }
    const name = toPascalCase(key)
    if (!generated.has(name)) { generated.add(name); structs.push(generateStruct(name, val)) }
    return name
  }

  const generateStruct = (name, node) => {
    const lines = [`struct ${name}: Codable {`]
    for (const [k, v] of Object.entries(node)) {
      const optional = v === null ? '?' : ''
      lines.push(`    let ${toCamelCase(k)}: ${swiftType(v, k)}${optional}`)
    }
    lines.push('')
    const codingKeys = Object.keys(node)
    if (codingKeys.some(k => toCamelCase(k) !== k)) {
      lines.push('    enum CodingKeys: String, CodingKey {')
      codingKeys.forEach(k => {
        if (toCamelCase(k) !== k) {
          lines.push(`        case ${toCamelCase(k)} = "${k}"`)
        } else {
          lines.push(`        case ${toCamelCase(k)}`)
        }
      })
      lines.push('    }')
    }
    lines.push('}')
    return lines.join('\n')
  }

  structs.push(generateStruct(rootName, obj))
  return structs.reverse().join('\n\n')
}

// ═══ 16. JSON → GraphQL Schema ═══
export const jsonToGraphql = (jsonStr, rootName = 'Root') => {
  const obj = safeParse(jsonStr)
  const types = []
  const generated = new Set()

  const gqlType = (val, key) => {
    if (val === null) return 'String'
    if (typeof val === 'boolean') return 'Boolean'
    if (typeof val === 'bigint') return 'Int'
    if (typeof val === 'number') return Number.isInteger(val) ? 'Int' : 'Float'
    if (typeof val === 'string') return 'String'
    if (isArray(val)) {
      if (val.length > 0) return `[${gqlType(val[0], key)}]`
      return '[String]'
    }
    const name = toPascalCase(key)
    if (!generated.has(name)) { generated.add(name); types.push(generateType(name, val)) }
    return name
  }

  const generateType = (name, node) => {
    const lines = [`type ${name} {`]
    for (const [k, v] of Object.entries(node)) {
      const nullable = v === null ? '' : '!'
      lines.push(`  ${toCamelCase(k)}: ${gqlType(v, k)}${nullable}`)
    }
    lines.push('}')
    return lines.join('\n')
  }

  types.push(generateType(rootName, obj))
  return types.reverse().join('\n\n')
}

// ═══ 17. JSON → Properties ═══
export const jsonToProperties = (jsonStr) => {
  const obj = safeParse(jsonStr)
  const lines = []
  const flatten = (node, prefix) => {
    for (const [k, v] of Object.entries(node)) {
      const fullKey = prefix ? `${prefix}.${k}` : k
      if (isObject(v)) { flatten(v, fullKey) }
      else if (isArray(v)) {
        if (v.length > 0 && isObject(v[0])) {
          v.forEach((item, i) => lines.push(`${fullKey}[${i}]=${JSON.stringify(item)}`))
        } else {
          lines.push(`${fullKey}=${v.join(',')}`)
        }
      }
      else if (v === null) { lines.push(`# ${fullKey}=`) }
      else { lines.push(`${fullKey}=${v}`) }
    }
  }
  flatten(obj, '')
  return lines.join('\n')
}

// ═══ 18. JSON → Markdown Table ═══
export const jsonToMarkdownTable = (jsonStr) => {
  const obj = safeParse(jsonStr)
  const rows = isArray(obj) ? obj : [obj]
  const headers = [...new Set(rows.flatMap(r => isObject(r) ? Object.keys(r) : ['value']))]
  const esc = (v) => {
    if (v === null || v === undefined) return ''
    if (isObject(v)) return JSON.stringify(v)
    if (isArray(v)) return v.map(esc).join(', ')
    return String(v).replace(/\|/g, '\\|').replace(/\n/g, '\\n')
  }
  const headerLine = '| ' + headers.join(' | ') + ' |'
  const sepLine = '| ' + headers.map(() => '---').join(' | ') + ' |'
  const dataLines = rows.map(r =>
    '| ' + headers.map(h => esc(isObject(r) ? r[h] : r)).join(' | ') + ' |'
  )
  return [headerLine, sepLine, ...dataLines].join('\n')
}

// ═══ 19. JSON → INI ═══
export const jsonToIni = (jsonStr) => {
  const obj = safeParse(jsonStr)
  const lines = []
  // 判断顶层是否全为标量（扁平化输出）还是有嵌套对象（分 section）
  const hasNested = Object.values(obj).some(v => isObject(v) || (isArray(v) && v.length > 0 && isObject(v[0])))
  if (hasNested) {
    for (const [section, val] of Object.entries(obj)) {
      lines.push(`[${section}]`)
      if (isObject(val)) {
        for (const [k, v] of Object.entries(val)) {
          if (isArray(v)) {
            if (v.length > 0 && isObject(v[0])) {
              v.forEach((item, i) => lines.push(`${k}[${i}]=${JSON.stringify(item)}`))
            } else {
              lines.push(`${k}=${v.join(',')}`)
            }
          }
          else lines.push(`${k}=${v ?? ''}`)
        }
      } else {
        lines.push(`value=${val ?? ''}`)
      }
      lines.push('')
    }
  } else {
    // 扁平对象：直接输出 key=value
    for (const [k, v] of Object.entries(obj)) {
      if (isArray(v)) {
        if (v.length > 0 && isObject(v[0])) {
          v.forEach((item, i) => lines.push(`${k}[${i}]=${JSON.stringify(item)}`))
        } else {
          lines.push(`${k}=${v.join(',')}`)
        }
      }
      else lines.push(`${k}=${v ?? ''}`)
    }
  }
  return lines.join('\n').trimEnd()
}

// ═══ 20. JSON → JSON Schema ═══
export const jsonToJsonSchema = (jsonStr) => {
  const obj = safeParse(jsonStr)

  const inferSchema = (value) => {
    if (value === null) return { type: 'null' }
    if (typeof value === 'boolean') return { type: 'boolean' }
    if (typeof value === 'bigint') return { type: 'integer' }
    if (typeof value === 'number') {
      return Number.isInteger(value) ? { type: 'integer' } : { type: 'number' }
    }
    if (typeof value === 'string') return { type: 'string' }

    if (Array.isArray(value)) {
      if (value.length === 0) return { type: 'array' }
      const itemSchemas = value.map(v => inferSchema(v))
      return { type: 'array', items: mergeSchemas(itemSchemas) }
    }

    if (typeof value === 'object') {
      const properties = {}
      const required = []
      for (const [key, val] of Object.entries(value)) {
        properties[key] = inferSchema(val)
        required.push(key)
      }
      return { type: 'object', properties, required }
    }

    return { type: 'string' }
  }

  const mergeSchemas = (schemas) => {
    if (schemas.length === 0) return { type: 'string' }
    if (schemas.length === 1) return schemas[0]

    const types = new Set(schemas.map(s => s.type))
    if (types.size === 1) {
      const type = schemas[0].type
      if (type === 'object') {
        const allKeys = new Set(schemas.flatMap(s => Object.keys(s.properties || {})))
        const properties = {}
        const required = []
        for (const key of allKeys) {
          const keySchemas = schemas
            .filter(s => s.properties && s.properties[key])
            .map(s => s.properties[key])
          properties[key] = keySchemas.length > 0 ? mergeSchemas(keySchemas) : { type: 'string' }
          if (schemas.every(s => s.required && s.required.includes(key))) {
            required.push(key)
          }
        }
        return { type: 'object', properties, required }
      }
      // Same primitive type — merge into a single schema; add enum if values differ
      if (type === 'string') {
        const uniqueVals = [...new Set(schemas.map(s => s._value).filter(v => v !== undefined))]
        if (uniqueVals.length > 1) {
          return { type: 'string', enum: uniqueVals }
        }
      }
      return schemas[0]
    }

    // Mixed types — collect non-null types
    const nonNullTypes = [...types].filter(t => t !== 'null')
    if (nonNullTypes.length === 0) return { type: 'null' }
    if (nonNullTypes.length === 1) return { type: [nonNullTypes[0], 'null'] }
    return { type: nonNullTypes }
  }

  // Annotate string leaf schemas with their actual value for enum detection
  const annotateValues = (value, schema) => {
    if (typeof value === 'string') {
      schema._value = value
    } else if (Array.isArray(value) && schema.items) {
      value.forEach(item => annotateValues(item, schema.items))
    } else if (value && typeof value === 'object' && schema.properties) {
      for (const [key, val] of Object.entries(value)) {
        if (schema.properties[key]) {
          annotateValues(val, schema.properties[key])
        }
      }
    }
  }

  // Helper to recursively strip internal _value markers and sort properties
  const cleanSchema = (schema) => {
    if (!schema || typeof schema !== 'object') return schema
    const cleaned = {}
    // $schema always first
    if (schema.$schema) cleaned.$schema = schema.$schema
    // type next
    if (schema.type) {
      cleaned.type = Array.isArray(schema.type) ? [...schema.type] : schema.type
    }
    // then properties
    if (schema.properties) {
      cleaned.properties = {}
      for (const key of Object.keys(schema.properties).sort()) {
        cleaned.properties[key] = cleanSchema(schema.properties[key])
      }
    }
    // required (sorted)
    if (schema.required && schema.required.length > 0) {
      cleaned.required = [...schema.required].sort()
    }
    // items
    if (schema.items) {
      cleaned.items = cleanSchema(schema.items)
    }
    // enum
    if (schema.enum) {
      cleaned.enum = schema.enum
    }
    return cleaned
  }

  const schema = inferSchema(obj)
  annotateValues(obj, schema)
  schema.$schema = 'http://json-schema.org/draft-07/schema#'

  return safeStringify(cleanSchema(schema), null, 2)
}

// ═══ 21. JSON → PHP class ═══
export const jsonToPhp = (jsonStr, rootName = 'Root') => {
  const obj = safeParse(jsonStr)
  const classes = []
  const generated = new Set()

  const phpType = (val, key) => {
    if (val === null) return 'mixed'
    if (typeof val === 'boolean') return 'bool'
    if (typeof val === 'bigint') return 'int'
    if (typeof val === 'number') return Number.isInteger(val) ? 'int' : 'float'
    if (typeof val === 'string') return 'string'
    if (isArray(val)) {
      if (val.length > 0 && isObject(val[0])) {
        const innerName = toPascalCase(key)
        if (!generated.has(innerName)) { generated.add(innerName); classes.push(generateClass(innerName, val[0])) }
      }
      return 'array'
    }
    const name = toPascalCase(key)
    if (!generated.has(name)) { generated.add(name); classes.push(generateClass(name, val)) }
    return name
  }

  const generateClass = (name, node) => {
    const lines = [`class ${name}`]
    lines.push('{')
    for (const [k, v] of Object.entries(node)) {
      const ty = phpType(v, k)
      const prop = toCamelCase(k)
      lines.push(`    public ${ty} $${prop};`)
    }
    lines.push('')
    lines.push(`    public function __construct(array $data = []) {`)
    for (const [k, v] of Object.entries(node)) {
      const field = toCamelCase(k)
      if (isObject(v)) {
        const ty = phpType(v, k)
        lines.push(`        $this->${field} = isset($data['${k}']) ? new ${ty}($data['${k}']) : null;`)
      } else if (isArray(v) && v.length > 0 && isObject(v[0])) {
        const ty = phpType(v[0], k)
        lines.push(`        $this->${field} = array_map(fn($item) =>  new ${ty}($item), $data['${k}'] ?? []);`)
      } else {
        lines.push(`        $this->${field} = $data['${k}'] ?? null;`)
      }
    }
    lines.push('    }')
    lines.push('}')
    return lines.join('\n')
  }

  classes.push(generateClass(rootName, obj))
  return '<?php\n\n' + classes.reverse().join('\n\n')
}

// ─── 共享辅助 ───
const toPascalCase = (str) => {
  let result = str
    .replace(/[_-]+(\w)/g, (_, c) => c.toUpperCase())
    .replace(/^[a-z]/, c => c.toUpperCase())
    .replace(/[^a-zA-Z0-9]/g, '')
  // 防止空标识符或数字开头 → 加 _ 前缀
  if (!result || /^\d/.test(result)) result = '_' + result
  return result || 'Field'
}

const toCamelCase = (str) => {
  const pascal = toPascalCase(str)
  if (!pascal || pascal === 'Field') return 'field'
  return pascal[0].toLowerCase() + pascal.slice(1)
}

const toSnakeCase = (str) => {
  let result = str
    .replace(/([A-Z])/g, '_$1')
    .replace(/[_-]+/g, '_')
    .replace(/^_/, '')
    .toLowerCase()
  // 防止空标识符或数字开头
  if (!result || /^\d/.test(result)) result = '_' + result
  return result || 'field'
}

// ─── 获取对应文件扩展名 ───
export const getFormatExtension = (format) => {
  const map = {
    xml: 'xml', csv: 'csv', yaml: 'yaml', toml: 'toml',
    java: 'java', typescript: 'ts', mysql: 'sql',
    go: 'go', protobuf: 'proto', rust: 'rs',
    python: 'py', kotlin: 'kt', csharp: 'cs',
    dart: 'dart', swift: 'swift', graphql: 'graphql',
    properties: 'properties', markdown: 'md', ini: 'ini', php: 'php',
    jsonschema: 'json'
  }
  return map[format] || 'txt'
}

export const getFormatMime = (format) => {
  const map = {
    xml: 'application/xml', csv: 'text/csv', yaml: 'text/yaml',
    toml: 'text/plain', java: 'text/x-java-source',
    typescript: 'text/typescript', mysql: 'text/x-sql',
    go: 'text/x-go', protobuf: 'text/plain'
  }
  return map[format] || 'text/plain'
}

// ─── 主转换入口 ───
export const convertJson = (jsonStr, format) => {
  const converters = {
    xml: jsonToXml, csv: jsonToCsv, yaml: jsonToYaml, toml: jsonToToml,
    java: jsonToJavaPojo, typescript: jsonToTsInterface, mysql: jsonToMysql,
    go: jsonToGoStruct, protobuf: jsonToProtobuf, rust: jsonToRust,
    python: jsonToPython, kotlin: jsonToKotlin, csharp: jsonToCSharp,
    dart: jsonToDart, swift: jsonToSwift, graphql: jsonToGraphql,
    properties: jsonToProperties, markdown: jsonToMarkdownTable,
    ini: jsonToIni, php: jsonToPhp, jsonschema: jsonToJsonSchema
  }
  const fn = converters[format]
  if (!fn) throw new Error(`未知转换格式: ${format}`)
  return fn(jsonStr)
}

// 转换格式的显示名称（按分类排序）
export const formatLabels = {
  // 序列化/协议
  jsonschema: 'JSON Schema',
  // 数据格式
  xml: 'XML',
  csv: 'CSV',
  yaml: 'YAML',
  toml: 'TOML',
  properties: 'Properties',
  ini: 'INI',
  markdown: 'Markdown 表格',
  // 强类型语言
  java: 'Java POJO',
  kotlin: 'Kotlin Data Class',
  csharp: 'C# Class',
  go: 'Go Struct',
  rust: 'Rust Struct',
  // 脚本/动态语言
  typescript: 'TypeScript Interface',
  python: 'Python Dataclass',
  php: 'PHP Class',
  // 移动端
  swift: 'Swift Codable',
  dart: 'Dart Class',
  // 序列化/协议
  protobuf: 'Protobuf',
  mysql: 'MySQL 建表语句',
  graphql: 'GraphQL Schema'
}
