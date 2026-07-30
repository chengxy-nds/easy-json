# easyJSON for VS Code

> 专业级 JSON 智能提取、格式化、校验与语义对比工具。**“只要像 JSON 的字符串，通通都能一键解析！”**



## ✨ 核心特性

- **右键选中文本即刻格式化**：在 VS Code 编辑器中选中任何代码或日志文本，右键选择 `easyJSON: 格式化/提取选中文本` 即可自动提取清洗并格式化。
- **100+ 种非标字符串智能提取**：无需手动寻找 JSON 头尾或人工反转义，自动将各种语言特有的打印字符串转化为标准 JSON。
- **4 大结构化视图**：树形视图、代码高亮视图、脑图拓扑图谱、Excel 式表格视图。
- **语义级 Diff 差异对比**：智能忽略 Key 排序不同与缩进差异，精准比对 JSON 值的字段增删与类型变更。
- **100% 本地内存解析**：所有解析在本地完成，无网络请求，确保敏感日志与数据绝对安全。



## 5 大典型提取转换案例 (Examples)

### 1. Java Lombok `toString()` 智能转换
* **原始输入 (Raw String):**
  ```text
  User(id=1001, name=Alice, roles=[admin, dev], meta=Meta(dept=R&D, active=true))
  ```
* **提取后 Standard JSON:**
  ```json
  {
    "id": 1001,
    "name": "Alice",
    "roles": ["admin", "dev"],
    "meta": {
      "dept": "R&D",
      "active": true
    }
  }
  ```



### 2. Python `dict` / `repr` 混杂字符串转换
* **原始输入 (Raw String):**
  ```text
  {'status': 'ok', 'code': 200, 'items': [{'id': 1, 'flag': True}, {'id': 2, 'flag': False}], 'data': None}
  ```
* **提取后 Standard JSON:**
  ```json
  {
    "status": "ok",
    "code": 200,
    "items": [
      { "id": 1, "flag": true },
      { "id": 2, "flag": false }
    ],
    "data": null
  }
  ```



### 3. 多重转义 JSON 字符串自动反转义
* **原始输入 (Raw String):**
  ```text
  "{\"code\":0,\"msg\":\"success\",\"data\":{\"order_id\":\"ORD-20260730\",\"total\":99.50}}"
  ```
* **提取后 Standard JSON:**
  ```json
  {
    "code": 0,
    "msg": "success",
    "data": {
      "order_id": "ORD-20260730",
      "total": 99.5
    }
  }
  ```



### 4. 宽松 JavaScript / TypeScript 对象字面量
* **原始输入 (Raw String):**
  ```text
  { id: 101, title: 'easyJSON', tags: ['tool', 'json'], isPublished: true, extra: undefined }
  ```
* **提取后 Standard JSON:**
  ```json
  {
    "id": 101,
    "title": "easyJSON",
    "tags": ["tool", "json"],
    "isPublished": true,
    "extra": null
  }
  ```



### 5. 混杂系统日志文本中精准剥离 JSON
* **原始输入 (Raw String):**
  ```text
  [2026-07-30 13:28:00.123] [INFO] [UserServiceImpl.java:88] Payload: {"userId":8899,"action":"login","ip":"192.168.1.1"} - Execution time 12ms
  ```
* **提取后 Standard JSON:**
  ```json
  {
    "userId": 8899,
    "action": "login",
    "ip": "192.168.1.1"
  }
  ```



## 💡 使用方法

1. **右键快捷提炼**：选中编辑区的文本 $\rightarrow$ 右键 $\rightarrow$ 点击 `easyJSON: 格式化/提取选中文本`。
2. **快捷键 / 命令呼出**：按 `Ctrl+Shift+P` (macOS `Cmd+Shift+P`) $\rightarrow$ 输入 `easyJSON` 即可唤醒大屏面板。




# English Version

# easyJSON for VS Code

> Professional JSON Extraction, Formatting, Validation & Semantic Diff Tool. **"Any string that looks like JSON can be parsed with one click!"**

## ✨ Key Features

- **Right-Click Instant Formatting**: Select code or log text in the editor, right-click and choose `easyJSON: Format / Extract Selected Text` to parse and format automatically.
- **Smart Extraction from 100+ Non-Standard Formats**: No need to manually trim headers/footers or unescape strings. Works with Java Lombok `toString()`, Python `dict`/`repr`, JavaScript loose objects, escaped JSON strings, system logs, etc.
- **4 Interactive Structural Views**: Tree View, Syntax Highlighted Code View, Topology Mind-map View, and Excel-style Grid Table View.
- **Semantic Diff Comparison**: Intelligently ignores key order and indentation differences to highlight true value modifications, key additions/deletions, and type changes.
- **100% Offline & Private**: All data processing is done locally in memory without any external network requests.



## 5 Typical Transformation Examples

### 1. Java Lombok `toString()`
* **Raw:** `User(id=1001, name=Alice, roles=[admin, dev], meta=Meta(dept=R&D, active=true))`
* **Parsed JSON:** `{"id":1001,"name":"Alice","roles":["admin","dev"],"meta":{"dept":"R&D","active":true}}`

### 2. Python `dict` / `repr`
* **Raw:** `{'status': 'ok', 'code': 200, 'items': [{'id': 1, 'flag': True}], 'data': None}`
* **Parsed JSON:** `{"status":"ok","code":200,"items":[{"id":1,"flag":true}],"data":null}`

### 3. Escaped JSON String
* **Raw:** `"{\"code\":0,\"msg\":\"success\",\"data\":{\"order_id\":\"ORD-20260730\"}}"`
* **Parsed JSON:** `{"code":0,"msg":"success","data":{"order_id":"ORD-20260730"}}`

### 4. Loose JavaScript / TypeScript Object Literal
* **Raw:** `{ id: 101, title: 'easyJSON', tags: ['tool', 'json'], isPublished: true }`
* **Parsed JSON:** `{"id":101,"title":"easyJSON","tags":["tool","json"],"isPublished":true}`

### 5. Embedded JSON in Mixed Log Text
* **Raw:** `[2026-07-30 13:28:00] [INFO] UserService: Payload: {"userId":8899,"action":"login"} - 12ms`
* **Parsed JSON:** `{"userId":8899,"action":"login"}`



## 🔗 Open Source & Repository

- **GitHub Repository**: [https://github.com/chengxy-nds/easy-json](https://github.com/chengxy-nds/easy-json)
