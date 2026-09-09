import { testFixtures } from './src/utils/testFixtures.js'
import { extractJsonFromText } from './src/utils/jsonExtractor.js'

let pass = 0, fail = 0
const failures = []

for (const tc of testFixtures) {
  try {
    const { json, format } = extractJsonFromText(tc.input)
    const parsed = JSON.parse(json)
    const expectedFormats = tc.expectFormat.split('|')
    const formatOk = expectedFormats.some(ef => format.includes(ef) || ef.includes(format))
    const keysOk = !tc.expectKeys || tc.expectKeys.every(k => k in parsed)
    if (formatOk && keysOk) {
      pass++
    } else {
      fail++
      failures.push(`  ${tc.id} [${tc.label}] expect: ${tc.expectFormat} | got: ${format} | keysOk: ${keysOk}`)
    }
  } catch (e) {
    fail++
    failures.push(`  ${tc.id} [${tc.label}] ERROR: ${e.message.substring(0, 80)}`)
  }
}

console.log(`\nTotal: ${testFixtures.length} | Pass: ${pass} | Fail: ${fail}\n`)
if (failures.length > 0) {
  console.log('Failures:')
  failures.forEach(f => console.log(f))
}
