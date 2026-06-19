# easyJSON

> 开发者专属的智能 JSON 工具，支持 100+ 种格式智能提取、语义对比、多视图、格式转换。
>
> 🌐 在线体验：[easyjson.xiaofucode.com](https://easyjson.xiaofucode.com)

---

## ✨ 功能一览

| 功能 | 说明 |
|------|------|
| 🔍 智能提取 | 支持 100+ 种格式自动识别并转换为标准 JSON |
| 🔌 浏览器插件 | 网页选中文本右键一键提取，免去复制粘贴 |
| ⚖️ 语义对比 | 结构正规化后再 Diff，字符级差异高亮 |
| 🌲 多视图切换 | 代码 / 树形 / 拓扑 / 表格，四种视图一键切换 |
| 📑 多 Tab & 持久化 | 多标签页并行工作，状态自动保存，双击可改名 |
| 🔄 格式转换 | JSON ↔ XML / YAML / TOML 一键互转 |
| ⚙️ 自定义开关 | 自动粘贴、按 Key 排序、过滤空值等行为自由配置 |
| 🎨 主题配色 | 多种 JSON 配色方案 + 系统深色/浅色主题 |
| ✅ 语法校验 | 实时错误行高亮定位，快速定位问题 |
| 🔤 转义处理 | JSON 转义 / 去转义，Unicode 自动解码 |

---

## 🔍 智能提取

粘贴任意格式的文本，自动识别并转换为标准 JSON。支持以下 **100+ 种**格式，直接复制下方样例粘贴到 easyJSON 即可体验：

### 格式样例

#### 1. 标准 JSON

```json
{
  "user": {
    "name": "张三",
    "age": 28,
    "email": "zhangsan@example.com",
    "isVip": true,
    "address": {
      "province": "浙江省",
      "city": "杭州市",
      "district": "西湖区",
      "street": "文三路 398 号"
    },
    "orders": [
      {"orderId": "ORD-20250601-001", "amount": 299.00, "status": "已发货"},
      {"orderId": "ORD-20250603-042", "amount": 1580.50, "status": "待付款"}
    ]
  }
}
```

> 同时支持 `\uXXXX` Unicode 转义字符，直接粘贴自动解码。

#### 2. Java toString（多种风格）

**Lombok @ToString（最常见）：**

```
OrderDTO{orderId=ORD-20250601-001, userId=10042, totalAmount=1299.00, status=PAID, items=[ItemDTO{sku=SKU-8821, name=机械键盘, qty=1, price=899.00}, ItemDTO{sku=SKU-3310, name=鼠标垫, qty=2, price=200.00}], createTime=2025-06-01T10:30:00, payChannel=ALIPAY}
```

**带 @hashcode 风格：**

```
UserEntity@3f2a1c{id=10042, username=zhangsan, email=zhangsan@example.com, roles=[ADMIN, USER], department=DepartmentVO{id=5, name=技术部, manager=null}, createdAt=2024-01-15T09:30:00, lastLogin=2025-06-01T14:23:07, active=true}
```

**圆括号风格（部分框架 / Builder 模式）：**

```
ServerConfig(host=0.0.0.0, port=8080, maxThreads=200, timeout=30000, ssl=SslConfig(enabled=true, certPath=/etc/ssl/cert.pem, keyPath=/etc/ssl/key.pem), datasource=DataSourceConfig(url=jdbc:mysql://localhost:3306/mydb, username=root, password=null, poolSize=20))
```

**HashMap toString 风格：**

```
{orderId=ORD-20250601-001, customer=张三, items=[{name=机械键盘, price=899.00, qty=1}, {name=显示器, price=2499.00, qty=1}], total=3398.00, paid=true}
```

**Optional 字段：**

```
UserProfile{id=10042, nickname=星辰大海, avatar=Optional[https://cdn.example.com/avatar/10042.jpg], bio=Optional.empty, verified=true, followers=2853}
```

**ArrayList / Arrays.toString 风格：**

```
[businessRole=ORDINARY_MERCHANT, salesType=DIRECT_SALES, merchantName=铁旅科技有限公司, directOrganName=<null>, retCode=0000, retMsg=操作成功]
```

#### 3. Python dict / dataclass

**Python dict（单引号 + True/False/None）：**

```python
{'user': {'name': '李四', 'age': 32, 'active': True}, 'permissions': ['read', 'write', 'admin'], 'metadata': {'last_login': '2025-06-01 14:30:00', 'ip': '192.168.1.100', 'device': None}, 'score': 98.5, 'is_vip': False}
```

**Python dataclass repr：**

```python
UserProfile(user_id=10042, username='zhangsan', email='zhangsan@example.com', is_active=True, roles=['admin', 'editor'], created_at='2024-01-15T09:30:00', last_login=None)
```

**OrderedDict：**

```python
OrderedDict([('step1', 'download'), ('step2', 'extract'), ('step3', 'install'), ('step4', 'configure'), ('step5', 'verify')])
```

#### 4. TypeScript / JavaScript

**TS const 声明带类型断言：**

```typescript
export const API_CONFIG: Record<string, any> = {
  baseURL: 'https://api.example.com/v2',
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
    'X-App-Version': '2.1.0',
  },
  retry: { maxRetries: 3, delay: 1000, backoff: 2 },
  endpoints: ['/users', '/orders', '/products'],
} as const;
```

**JS 对象字面量（无引号 key、单引号、尾逗号）：**

```javascript
{
  name: '张三',
  age: 28,
  skills: ['Vue', 'React', 'TypeScript'],
  experience: [
    {company: '阿里巴巴', role: '前端工程师', years: 3},
    {company: '字节跳动', role: '高级前端', years: 2},
  ],
  isRemote: false,
}
```

#### 5. XML

```xml
<bookstore>
  <book category="编程">
    <title lang="zh">深入理解 Java 虚拟机</title>
    <author>周志明</author>
    <year>2019</year>
    <price>129.00</price>
  </book>
  <book category="编程">
    <title lang="zh">JavaScript 高级程序设计</title>
    <author>Matt Frisbie</author>
    <year>2020</year>
    <price>139.00</price>
  </book>
  <book category="文学">
    <title lang="zh">三体</title>
    <author>刘慈欣</author>
    <year>2008</year>
    <price>69.00</price>
  </book>
</bookstore>
```

#### 6. JSONP

```
jQuery11230948574_1625732847({"code":200,"message":"success","data":{"userId":10042,"nickname":"星辰大海","avatar":"https://cdn.example.com/avatar/10042.jpg","followers":2853,"following":168,"posts":97}})
```

#### 7. 日志 / 混合文本中的 JSON

```
2025-06-01 14:23:07.332 [http-nio-8080-exec-12] INFO  c.e.controller.OrderController - 创建订单成功, response: {"code":0,"message":"ok","data":{"orderId":"ORD-20250601-001","userId":10042,"totalAmount":1299.00,"items":[{"sku":"SKU-8821","name":"机械键盘","qty":1,"price":899.00},{"sku":"SKU-3310","name":"鼠标垫","qty":2,"price":200.00}],"status":"CREATED","createTime":"2025-06-01T14:23:07"}}
```

#### 8. YAML

```yaml
# Kubernetes Deployment 配置
apiVersion: apps/v1
kind: Deployment
metadata:
  name: easyJSON-api
  namespace: production
  labels:
    app: easyJSON-api
    version: v2.1.0
spec:
  replicas: 3
  selector:
    matchLabels:
      app: easyJSON-api
  template:
    metadata:
      labels:
        app: easyJSON-api
    spec:
      containers:
        - name: api
          image: registry.cn-hangzhou.aliyuncs.com/easyjson/api:2.1.0
          ports:
            - containerPort: 8080
          env:
            - name: SPRING_PROFILES_ACTIVE
              value: prod
            - name: DB_HOST
              value: mysql-primary.database.svc
          resources:
            limits:
              cpu: 2000m
              memory: 4Gi
            requests:
              cpu: 500m
              memory: 1Gi
```

#### 9. TOML

```toml
# Cargo.toml — Rust 项目配置
[package]
name = "easy-json-core"
version = "0.3.2"
edition = "2021"
authors = ["小富 <dev@example.com>"]
description = "High-performance JSON parser and formatter"

[dependencies]
serde = "1.0"
serde_json = "1.0"
tokio = "1.28"
tracing = "0.1"

[dev-dependencies]
criterion = "0.5"
pretty_assertions = "1.3"

[profile.release]
opt-level = 3
lto = true
codegen-units = 1
strip = true
```

#### 10. URL Query String

```
https://api.example.com/search?keyword=%E6%9C%BA%E6%A2%B0%E9%94%AE%E7%9B%98&category=electronics&brand[]=Cherry&brand[]=Logitech&price_min=200&price_max=1500&sort=price_asc&page=1&page_size=20
```

#### 11. CSV

```csv
employee_id,name,department,position,salary,hire_date,city
E001,王伟,技术部,高级前端工程师,35000,2021-03-15,北京
E002,陈静,产品部,产品经理,32000,2020-08-01,上海
E003,刘洋,技术部,后端工程师,28000,2022-01-10,杭州
E004,赵敏,设计部,UI 设计师,26000,2021-11-20,深圳
E005,孙磊,技术部,DevOps 工程师,33000,2019-06-05,北京
E006,周婷,市场部,市场运营,22000,2023-02-14,成都
E007,吴鹏,技术部,算法工程师,42000,2020-04-18,杭州
```

#### 12. Properties / .env

```properties
# 数据库配置
DB_HOST=192.168.1.100
DB_PORT=3306
DB_NAME=easyjson_prod
DB_USER=app_readwrite
DB_PASSWORD=Kx9$mP2vL7qR

# Redis 配置
REDIS_HOST=192.168.1.101
REDIS_PORT=6379
REDIS_PASSWORD=rD3#nWcQ8sYf
REDIS_DB=0

# 应用配置
APP_NAME=easyJSON
APP_PORT=8080
APP_ENV=production
LOG_LEVEL=info
JWT_SECRET=a1b2c3d4e5f6g7h8i9j0
JWT_EXPIRES_IN=7200

# OSS 存储
OSS_ENDPOINT=https://oss-cn-hangzhou.aliyuncs.com
OSS_BUCKET=easyjson-assets
OSS_ACCESS_KEY=LTAI5tPqxFakeKeyHere
OSS_SECRET_KEY=FakeSecretKeyDoNotUseInProduction
```

#### 13. INI

```ini
; Nginx 风格配置
[global]
worker_processes = auto
error_log = /var/log/nginx/error.log
pid = /run/nginx.pid

[http]
sendfile = true
tcp_nopush = true
keepalive_timeout = 65
gzip = true
gzip_types = application/json text/css application/javascript

[server]
listen = 443
server_name = easyjson.dev
ssl_certificate = /etc/ssl/certs/easyjson.pem
ssl_certificate_key = /etc/ssl/private/easyjson.key
root = /var/www/easyjson/dist

[upstream.api]
server_1 = 10.0.0.11:8080
server_2 = 10.0.0.12:8080
server_3 = 10.0.0.13:8080
balance = round-robin
```

#### 14. JSONC / JSON5（带注释的 JSON）

```jsonc
{
  // 数据库连接配置
  "host": "127.0.0.1",
  "port": 3306,
  /* 连接池设置
     最大连接数 */
  "pool": {
    "max": 20,
    "min": 5, // 最小空闲连接
  }
}
```

#### 15. Ruby Hash

```ruby
{:status => "success", :user => {:name => "张三", :age => 28}, :tags => ["ruby", "rails"], :active => true, :meta => nil}
```

#### 16. Markdown 表格

```markdown
| 姓名 | 部门   | 职位             | 月薪  | 入职日期   |
|------|--------|-----------------|-------|-----------| 
| 王伟 | 技术部 | 高级前端工程师   | 35000 | 2021-03-15 |
| 陈静 | 产品部 | 产品经理         | 32000 | 2020-08-01 |
| 刘洋 | 技术部 | 后端工程师       | 28000 | 2022-01-10 |
| 赵敏 | 设计部 | UI 设计师        | 26000 | 2021-11-20 |
```

#### 17. PHP print_r

```php
Array
(
    [status] => success
    [data] => Array
        (
            [user_id] => 1002
            [name] => 张三
            [roles] => Array
                (
                    [0] => admin
                    [1] => editor
                )
            [active] => 1
        )
)
```

#### 18. MongoDB Shell 输出

```javascript
{
  "_id": ObjectId("5f7b3a1b9d3e2a1b3c4d5e6f"),
  "username": "张三",
  "email": "zhangsan@example.com",
  "createdAt": ISODate("2024-01-15T09:30:00.000Z"),
  "loginCount": NumberLong(2853),
  "balance": NumberDecimal("199.99"),
  "tags": ["admin", "vip"]
}
```

#### 19. 转义 JSON 字符串（双编码 JSON）

```
"{\"userId\":1001,\"name\":\"张三\",\"tags\":[\"dev\",\"backend\"],\"active\":true}"
```

> 常见于日志系统将 JSON 序列化为字符串字段、数据库导出、API 代理转发等场景。自动剥离外层引号和转义符，提取内层真实 JSON。

#### 20. Go map 语法

```go
map[string]any{"code":200,"data":nil,"ok":true}
```

> 常见于 Go 程序调试输出、日志打印 `fmt.Printf("%#v", m)`。自动剥离 `map[K]V` 类型前缀，`nil` → `null`，转为标准 JSON。

#### 更多格式持续支持中……

---

### 提取优先级

按以下顺序依次尝试解析，命中即停：

```
MongoDB Shell 类型转换 → 转义 JSON 剥离 → Go map 语法剥离 → JSONC 注释剥离
  → 标准 JSON → TypeScript 去类型 → JS 对象字面量 → Java toString（递归解析）
    → Python dict/dataclass → Ruby Hash → JS 宽松语法 → XML → YAML
      → TOML → Query String → CSV → Markdown Table → Properties / INI
        → PHP print_r → 括号扫描兜底（从混合文本中提取）
```

### 使用方式

1. **手动提取**：粘贴文本后点击工具栏「提取」按钮
2. **自动提取**：开启「粘贴自动提取」开关（左侧边栏 🔍 按钮），粘贴即自动识别转换
3. **网页一键提取**：安装浏览器插件后，选中网页文本 → 右键 → 「easyjson 智能提取」

---

## 📦 安装

easy-json 提供三个版本，按需选择：

### 🌐 在线使用

直接访问 [easyjson.xiaofucode.com](https://easyjson.xiaofucode.com)，无需安装，即开即用。

### 🔌 浏览器插件（Chrome / Edge）

由于暂未上架应用商店，需手动加载：

1. 下载插件压缩包并解压
2. 打开浏览器 → `chrome://extensions/`
3. 开启右上角「开发者模式」
4. 点击「加载已解压的扩展程序」→ 选择解压后的目录
5. 安装后，在网页选中文本 → 右键即可使用「easyjson 智能提取」

### 🍎 Mac 客户端

由于未购买 Apple 开发者证书，首次安装时系统会提示"来自身份不明的开发者"：

1. 下载 `.dmg` 安装包，拖入 Applications
2. 首次打开时若提示不受信任：`系统偏好设置 → 安全性与隐私 → 仍要打开`

### 🪟 Windows 客户端

下载 `.exe` 安装包，双击直接安装，无额外步骤。

---

## 🛠 本地开发

```bash
# 安装依赖
npm install

# 启动开发服务器
npm run dev

# 构建生产版本
npm run build
```

构建完成后，`dist/` 目录即可作为浏览器插件加载。

## 🧰 技术栈

- Vue 3 + Vite
- lucide-vue-next（图标库）
- Chrome Extension Manifest V3

---

## 💬 交流

| ![关注公众号](https://img.shields.io/static/v1?label=wechat&message=微信公众号&logo=wechat&color=07C160)  | ![个人微信](https://img.shields.io/static/v1?label=wechat&message=个人微信&logo=wechat&color=07C160)  |
| ---------| ------- |
|  <img src="http://fire-blog.oss-cn-beijing.aliyuncs.com//images/20240415141903.png" style="width:15rem; height:15rem;"> |  <img src="http://fire-blog.oss-cn-beijing.aliyuncs.com//images/20240415141919.png" style="width:15rem; height:15rem;">  |
| 关注公众号：**程序员小富**   | 欢迎加入技术交流群，<br/><br/>或直接搜微信号：<span style="color: #ff0606">xiaofucode</span> |

---

如果这个工具对你有帮助，欢迎点个 ⭐ Star 支持一下！有 Bug 或建议欢迎提 Issue，也非常欢迎 PR 贡献 🙌
