// ─── 安全 JSON 解析/序列化：保留大整数精度 ───
// JavaScript Number 类型只能安全表示 [-(2^53-1), 2^53-1] 范围内的整数
// (即 ±9,007,199,254,740,991，16 位数字)。
// 超过此范围的大整数（如 2086639615434764289）经过 JSON.parse → JSON.stringify
// 后会丢失精度，输出错误的数字。
//
// 解决方案：解析前将大整数临时转为字符串，序列化后再还原为裸数字。
// 对字符串字段中的大数字同理（如账号 ID 通常会转为字符串保留精度）。

// 匹配 JSON 值位置中 >= 16 位的整数。
// 用零宽断言 (?=...) 匹配尾部定界符，避免消耗逗号导致连续大数无法匹配。
const LARGE_INT_REGEX = /(:\s*)(-?\d{16,})(?=\s*[,}\]])/g
const LARGE_INT_ARRAY_REGEX = /([\[,]\s*)(-?\d{16,})(?=\s*[,\]])/g

/**
 * 安全解析 JSON 字符串，将大整数转为字符串保留精度。
 * @param {string} jsonStr - 原始 JSON 字符串
 * @returns {any} 解析后的对象（大整数以字符串形式存在）
 */
export const safeParse = (jsonStr) => {
  if (typeof jsonStr !== 'string') return JSON.parse(jsonStr)
  // Step 1: 冒号后的大整数值 → 加引号  : 2086639615434764289 → : "2086639615434764289"
  let preprocessed = jsonStr.replace(LARGE_INT_REGEX, '$1"$2"')
  // Step 2: 数组中的大整数值 → 加引号  [2086639615434764289 → ["2086639615434764289"
  preprocessed = preprocessed.replace(LARGE_INT_ARRAY_REGEX, '$1"$2"')
  return JSON.parse(preprocessed)
}

// 匹配序列化后值为大整数的字符串（排除 key: "string" 中的 key）
// "2086639615434764289" 后不能跟 :（否则是 key）
const LARGE_INT_STRING_RE = /"(-?\d{16,})"(?!\s*:)/g

/**
 * 安全序列化对象为 JSON 字符串，将之前保留的大整数字符串还原为裸数字。
 * @param {any} obj - 要序列化的对象
 * @param {function|array|null} replacer - 同 JSON.stringify 的 replacer
 * @param {number|string} space - 同 JSON.stringify 的 space
 * @returns {string} JSON 字符串（大整数以裸数字形式存在）
 */
export const safeStringify = (obj, replacer, space) => {
  const json = JSON.stringify(obj, replacer, space)
  // 将值为大整数字符串的 "..." 去引号还原为数字
  return json.replace(LARGE_INT_STRING_RE, '$1')
}
