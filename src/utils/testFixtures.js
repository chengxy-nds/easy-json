// ─── JSON Extractor Test Fixtures (~100 cases) ───

export const testFixtures = [

  // ═══ 1. Standard JSON (6) ═══
  {
    id: 'json-1', category: 'JSON', label: '标准嵌套对象',
    input: '{"user":{"name":"张三","age":28},"active":true}',
    expectFormat: 'JSON', expectKeys: ['user', 'active'],
  },
  {
    id: 'json-2', category: 'JSON', label: '顶层数组',
    input: '[{"id":1,"name":"Alice"},{"id":2,"name":"Bob"}]',
    expectFormat: 'JSON',
  },
  {
    id: 'json-3', category: 'JSON', label: 'Unicode 转义',
    input: '{"name":"\\u5f20\\u4e09","city":"\\u676d\\u5dde"}',
    expectFormat: 'JSON', expectKeys: ['name', 'city'],
  },
  {
    id: 'json-4', category: 'JSON', label: '空对象和空数组',
    input: '{"empty_obj":{},"empty_arr":[],"val":null}',
    expectFormat: 'JSON', expectKeys: ['empty_obj', 'empty_arr', 'val'],
  },
  {
    id: 'json-5', category: 'JSON', label: '深层嵌套 (5层)',
    input: '{"a":{"b":{"c":{"d":{"e":"deep"}}}}}',
    expectFormat: 'JSON', expectKeys: ['a'],
  },
  {
    id: 'json-6', category: 'JSON', label: '大数字和科学计数法',
    input: '{"bigint":9007199254740991,"sci":1.23e10,"neg":-0.005}',
    expectFormat: 'JSON', expectKeys: ['bigint', 'sci', 'neg'],
  },

  // ═══ 2. Java toString (12) ═══
  {
    id: 'java-1', category: 'Java toString', label: 'Lombok @ToString 基本',
    input: 'User{id=1001, name=张三, email=zhangsan@test.com, active=true}',
    expectFormat: 'Java toString', expectKeys: ['id', 'name', 'email'],
  },
  {
    id: 'java-2', category: 'Java toString', label: 'Lombok 嵌套对象',
    input: 'OrderDTO{orderId=ORD-001, items=[ItemDTO{sku=SKU-01, name=键盘, price=899.00}, ItemDTO{sku=SKU-02, name=鼠标, price=199.00}], total=1098.00}',
    expectFormat: 'Java toString', expectKeys: ['orderId', 'items', 'total'],
  },
  {
    id: 'java-3', category: 'Java toString', label: '带 @hashcode',
    input: 'UserEntity@3f2a1c{id=1001, username=zhangsan, roles=[ADMIN, USER], active=true}',
    expectFormat: 'Java toString', expectKeys: ['id', 'username', 'roles'],
  },
  {
    id: 'java-4', category: 'Java toString', label: '圆括号风格 (Builder)',
    input: 'ServerConfig(host=0.0.0.0, port=8080, ssl=SslConfig(enabled=true, certPath=/etc/ssl/cert.pem))',
    expectFormat: 'Java toString', expectKeys: ['host', 'port', 'ssl'],
  },
  {
    id: 'java-5', category: 'Java toString', label: 'HashMap toString',
    input: '{orderId=ORD-001, customer=张三, items=[{name=键盘, price=899}, {name=鼠标, price=199}], paid=true}',
    expectFormat: 'Java toString', expectKeys: ['orderId', 'customer'],
  },
  {
    id: 'java-6', category: 'Java toString', label: 'Optional 字段',
    input: 'UserProfile{id=1001, avatar=Optional[https://cdn.example.com/a.jpg], bio=Optional.empty, verified=true}',
    expectFormat: 'Java toString', expectKeys: ['id', 'avatar', 'verified'],
  },
  {
    id: 'java-7', category: 'Java toString', label: 'ArrayList toString',
    input: '[role=ADMIN, type=INTERNAL, name=超级管理员, retCode=0000, retMsg=操作成功]',
    expectFormat: 'Java toString', expectKeys: ['role', 'type', 'name'],
  },
  {
    id: 'java-8', category: 'Java toString', label: '嵌套集合',
    input: 'Response{code=200, data=PageResult{page=1, size=10, total=100, records=[Record{id=1, status=ACTIVE}, Record{id=2, status=INACTIVE}]}}',
    expectFormat: 'Java toString', expectKeys: ['code', 'data'],
  },
  {
    id: 'java-9', category: 'Java toString', label: 'null 字段',
    input: 'Config{host=localhost, port=3306, password=null, dbName=test_db, timeout=null}',
    expectFormat: 'Java toString', expectKeys: ['host', 'port', 'password'],
  },
  {
    id: 'java-10', category: 'Java toString', label: '数字和布尔混合',
    input: 'Metrics{cpu=78.5, memory=4096, diskUsage=0.85, healthy=true, errorCount=0}',
    expectFormat: 'Java toString', expectKeys: ['cpu', 'memory', 'healthy'],
  },
  {
    id: 'java-11', category: 'Java toString', label: '深层嵌套 Builder',
    input: 'AppConfig(server=Server(host=0.0.0.0, port=8080), db=Database(url=jdbc:mysql://localhost:3306/app, pool=Pool(min=5, max=20)), cache=Cache(type=redis, ttl=3600))',
    expectFormat: 'Java toString', expectKeys: ['server', 'db', 'cache'],
  },
  {
    id: 'java-12', category: 'Java toString', label: '含中文值和特殊字符',
    input: 'Product{name=机械键盘 Cherry MX, brand=Cherry, price=899.00, desc=青轴/87键, inStock=true}',
    expectFormat: 'Java toString', expectKeys: ['name', 'brand', 'price'],
  },

  // ═══ 3. Python (8) ═══
  {
    id: 'py-1', category: 'Python', label: 'dict 基本 (单引号+True/False/None)',
    input: "{'name': '李四', 'age': 32, 'active': True, 'score': 98.5, 'meta': None}",
    expectFormat: 'Python', expectKeys: ['name', 'age', 'active'],
  },
  {
    id: 'py-2', category: 'Python', label: 'dict 嵌套',
    input: "{'user': {'name': '张三', 'roles': ['admin', 'editor']}, 'status': 'ok', 'count': 42}",
    expectFormat: 'Python|JS', expectKeys: ['user', 'status', 'count'],
  },
  {
    id: 'py-3', category: 'Python', label: 'dataclass repr',
    input: "UserProfile(user_id=1001, username='zhangsan', email='zs@test.com', is_active=True, roles=['admin'])",
    expectFormat: 'Python', expectKeys: ['user_id', 'username'],
  },
  {
    id: 'py-4', category: 'Python', label: 'OrderedDict',
    input: "OrderedDict([('step1', 'download'), ('step2', 'extract'), ('step3', 'install')])",
    expectFormat: 'Python', expectKeys: ['step1', 'step2', 'step3'],
  },
  {
    id: 'py-5', category: 'Python', label: 'tuple 值',
    input: "{'coords': (39.9, 116.4), 'tags': ('dev', 'ops'), 'flag': False}",
    expectFormat: 'Python', expectKeys: ['coords', 'tags', 'flag'],
  },
  {
    id: 'py-6', category: 'Python', label: 'bool 和 None 混合',
    input: "{'a': True, 'b': False, 'c': None, 'd': 0, 'e': ''}",
    expectFormat: 'Python', expectKeys: ['a', 'b', 'c', 'd'],
  },
  {
    id: 'py-7', category: 'Python', label: '多层嵌套 dict',
    input: "{'config': {'db': {'host': 'localhost', 'port': 3306}, 'redis': {'host': '127.0.0.1', 'port': 6379}}}",
    expectFormat: 'Python|JS', expectKeys: ['config'],
  },
  {
    id: 'py-8', category: 'Python', label: 'dict 含列表嵌套对象',
    input: "{'users': [{'id': 1, 'name': 'Alice', 'active': True}, {'id': 2, 'name': 'Bob', 'active': False}]}",
    expectFormat: 'Python', expectKeys: ['users'],
  },

  // ═══ 4. TypeScript / JavaScript (8) ═══
  {
    id: 'ts-1', category: 'TS/JS', label: 'TS const 声明带类型',
    input: `export const config: Record<string, any> = {
  baseURL: 'https://api.example.com',
  timeout: 30000,
  retry: { max: 3, delay: 1000 },
} as const;`,
    expectFormat: 'JS', expectKeys: ['baseURL', 'timeout', 'retry'],
  },
  {
    id: 'ts-2', category: 'TS/JS', label: 'JS 无引号 key',
    input: `{name: "张三", age: 28, skills: ["Vue", "React"], isRemote: false}`,
    expectFormat: 'JS', expectKeys: ['name', 'age', 'skills'],
  },
  {
    id: 'ts-3', category: 'TS/JS', label: '单引号字符串',
    input: "{'host': 'localhost', 'port': 3306, 'db': 'test'}",
    expectFormat: 'JS',
  },
  {
    id: 'ts-4', category: 'TS/JS', label: '尾逗号',
    input: `{
  "items": ["a", "b", "c",],
  "count": 3,
}`,
    expectFormat: 'JS',
  },
  {
    id: 'ts-5', category: 'TS/JS', label: 'undefined 值',
    input: '{key: "value", missing: undefined, num: 42}',
    expectFormat: 'JS', expectKeys: ['key', 'missing', 'num'],
  },
  {
    id: 'ts-6', category: 'TS/JS', label: 'TS satisfies',
    input: `const theme = {
  primary: '#10b981',
  secondary: '#6366f1',
  fonts: ['Inter', 'JetBrains Mono'],
} satisfies ThemeConfig;`,
    expectFormat: 'JS', expectKeys: ['primary', 'secondary'],
  },
  {
    id: 'ts-7', category: 'TS/JS', label: 'JS 注释混合',
    input: `{
  // API 端点
  endpoint: "https://api.example.com",
  /* 超时设置 */
  timeout: 5000,
  debug: true,
}`,
    expectFormat: 'JS',
  },
  {
    id: 'ts-8', category: 'TS/JS', label: '嵌套对象无引号',
    input: '{server: {host: "0.0.0.0", port: 8080}, db: {url: "mysql://localhost/app", pool: 10}}',
    expectFormat: 'JS', expectKeys: ['server', 'db'],
  },

  // ═══ 5. XML (5) ═══
  {
    id: 'xml-1', category: 'XML', label: '简单 XML',
    input: '<user><name>张三</name><age>28</age><active>true</active></user>',
    expectFormat: 'XML', expectKeys: ['user'],
  },
  {
    id: 'xml-2', category: 'XML', label: '嵌套 XML',
    input: `<response><code>200</code><data><user><id>1001</id><name>张三</name></user></data></response>`,
    expectFormat: 'XML', expectKeys: ['response'],
  },
  {
    id: 'xml-3', category: 'XML', label: '多子节点同名 (数组)',
    input: `<bookstore><book><title>Java编程</title></book><book><title>Python入门</title></book><book><title>Go实战</title></book></bookstore>`,
    expectFormat: 'XML', expectKeys: ['bookstore'],
  },
  {
    id: 'xml-4', category: 'XML', label: 'XML 声明 + 嵌套',
    input: `<config><server><host>localhost</host><port>8080</port></server><database><host>127.0.0.1</host><port>3306</port></database></config>`,
    expectFormat: 'XML', expectKeys: ['config'],
  },
  {
    id: 'xml-5', category: 'XML', label: '空节点和文本节点',
    input: `<result><status>ok</status><message>success</message><data></data></result>`,
    expectFormat: 'XML', expectKeys: ['result'],
  },

  // ═══ 6. JSONP (3) ═══
  {
    id: 'jsonp-1', category: 'JSONP', label: 'jQuery 回调',
    input: 'jQuery11230948574({"code":200,"data":{"userId":1001,"name":"张三"}})',
    expectFormat: 'JS', expectKeys: ['code', 'data'],
  },
  {
    id: 'jsonp-2', category: 'JSONP', label: '普通回调带分号',
    input: 'callback({"status":"ok","items":[1,2,3]});',
    expectFormat: 'JS', expectKeys: ['status', 'items'],
  },
  {
    id: 'jsonp-3', category: 'JSONP', label: '下划线命名回调',
    input: 'api_handler({"result":true,"message":"success","count":42})',
    expectFormat: 'JS', expectKeys: ['result', 'message', 'count'],
  },

  // ═══ 7. 日志/混合文本 (5) ═══
  {
    id: 'log-1', category: '混合文本', label: 'Java 日志行',
    input: '2025-06-01 14:23:07 [INFO] OrderController - response: {"code":0,"orderId":"ORD-001","status":"CREATED"}',
    expectFormat: '混合文本', expectKeys: ['code', 'orderId'],
  },
  {
    id: 'log-2', category: '混合文本', label: '前后缀包裹',
    input: 'Result => {"success":true,"data":{"id":1,"name":"test"}} <= End',
    expectFormat: '混合文本', expectKeys: ['success', 'data'],
  },
  {
    id: 'log-3', category: '混合文本', label: 'Nginx 日志带 JSON body',
    input: '192.168.1.1 - - [01/Jun/2025:14:23:07 +0800] "POST /api/order" 200 {"code":0,"msg":"ok"}',
    expectFormat: '混合文本', expectKeys: ['code', 'msg'],
  },
  {
    id: 'log-4', category: '混合文本', label: '多行日志中的 JSON',
    input: `ERROR 2025-06-01 stack trace...
response body: {"error":"not_found","detail":"User 1001 not found"}
end of log`,
    expectFormat: '混合文本', expectKeys: ['error', 'detail'],
  },
  {
    id: 'log-5', category: '混合文本', label: 'Debug 输出带数组',
    input: 'DEBUG: data = [{"id":1,"v":"a"},{"id":2,"v":"b"}]',
    expectFormat: '混合文本',
  },

  // ═══ 8. YAML (6) ═══
  {
    id: 'yaml-1', category: 'YAML', label: '简单键值',
    input: `name: easyJSON
version: 2.1.0
port: 8080
debug: false`,
    expectFormat: 'YAML', expectKeys: ['name', 'version', 'port'],
  },
  {
    id: 'yaml-2', category: 'YAML', label: '嵌套对象',
    input: `server:
  host: 0.0.0.0
  port: 8080
database:
  host: localhost
  port: 3306
  name: mydb`,
    expectFormat: 'YAML', expectKeys: ['server', 'database'],
  },
  {
    id: 'yaml-3', category: 'YAML', label: '列表',
    input: `fruits:
  - apple
  - banana
  - cherry
count: 3`,
    expectFormat: 'YAML', expectKeys: ['fruits', 'count'],
  },
  {
    id: 'yaml-4', category: 'YAML', label: '带注释',
    input: `# 应用配置
app_name: easyJSON
# 端口
port: 8080
env: production`,
    expectFormat: 'YAML', expectKeys: ['app_name', 'port', 'env'],
  },
  {
    id: 'yaml-5', category: 'YAML', label: '混合类型值',
    input: `string_val: hello
int_val: 42
float_val: 3.14
bool_val: true
null_val: ~`,
    expectFormat: 'YAML', expectKeys: ['string_val', 'int_val', 'bool_val'],
  },
  {
    id: 'yaml-6', category: 'YAML', label: 'K8s Deployment 片段',
    input: `apiVersion: apps/v1
kind: Deployment
metadata:
  name: api-server
  namespace: prod
spec:
  replicas: 3`,
    expectFormat: 'YAML', expectKeys: ['apiVersion', 'kind', 'metadata', 'spec'],
  },

  // ═══ 9. TOML (5) ═══
  {
    id: 'toml-1', category: 'TOML', label: '简单键值',
    input: `name = "easyJSON"
version = "2.1.0"
port = 8080
debug = false`,
    expectFormat: 'TOML', expectKeys: ['name', 'version', 'port'],
  },
  {
    id: 'toml-2', category: 'TOML', label: '节 (section)',
    input: `[server]
host = "0.0.0.0"
port = 8080

[database]
host = "localhost"
port = 3306`,
    expectFormat: 'TOML', expectKeys: ['server', 'database'],
  },
  {
    id: 'toml-3', category: 'TOML', label: '嵌套节',
    input: `[package]
name = "my-app"
version = "1.0.0"

[dependencies]
serde = "1.0"
tokio = "1.28"

[profile.release]
opt-level = 3
lto = true`,
    expectFormat: 'TOML', expectKeys: ['package', 'dependencies', 'profile'],
  },
  {
    id: 'toml-4', category: 'TOML', label: '数组值',
    input: `[project]
name = "demo"
authors = "Alice, Bob"
keywords = "json, parser, tool"`,
    expectFormat: 'TOML', expectKeys: ['project'],
  },
  {
    id: 'toml-5', category: 'TOML', label: '多种类型',
    input: `title = "Config"
enabled = true
max_retry = 3
timeout = 30.5

[logging]
level = "info"
file = "/var/log/app.log"`,
    expectFormat: 'TOML', expectKeys: ['title', 'enabled', 'logging'],
  },

  // ═══ 10. URL Query String (4) ═══
  {
    id: 'url-1', category: 'URL', label: '简单查询参数',
    input: 'https://api.example.com/search?keyword=json&page=1&size=20',
    expectFormat: 'Query String', expectKeys: ['keyword', 'page', 'size'],
  },
  {
    id: 'url-2', category: 'URL', label: '中文编码参数',
    input: 'https://api.example.com/search?q=%E6%9C%BA%E6%A2%B0%E9%94%AE%E7%9B%98&category=electronics',
    expectFormat: 'Query String', expectKeys: ['q', 'category'],
  },
  {
    id: 'url-3', category: 'URL', label: '数组参数',
    input: 'https://example.com/filter?tag[]=vue&tag[]=react&tag[]=angular&sort=name',
    expectFormat: 'Query String', expectKeys: ['tag', 'sort'],
  },
  {
    id: 'url-4', category: 'URL', label: '纯查询字符串 (无路径)',
    input: 'name=zhangsan&age=28&active=true&role=admin',
    expectFormat: 'Query String', expectKeys: ['name', 'age', 'active'],
  },

  // ═══ 11. CSV (4) ═══
  {
    id: 'csv-1', category: 'CSV', label: '标准 CSV',
    input: `id,name,age,city
1,张三,28,北京
2,李四,32,上海
3,王五,25,杭州`,
    expectFormat: 'CSV',
  },
  {
    id: 'csv-2', category: 'CSV', label: 'TSV (制表符)',
    input: `id\tname\tscore
1\tAlice\t95
2\tBob\t87
3\tCharlie\t92`,
    expectFormat: 'CSV',
  },
  {
    id: 'csv-3', category: 'CSV', label: '数值自动推断',
    input: `key,int_val,float_val,bool_val
a,42,3.14,true
b,0,0.5,false`,
    expectFormat: 'CSV',
  },
  {
    id: 'csv-4', category: 'CSV', label: '多列数据',
    input: `employee_id,name,department,position,salary
E001,王伟,技术部,前端工程师,35000
E002,陈静,产品部,产品经理,32000`,
    expectFormat: 'CSV',
  },

  // ═══ 12. Properties / .env (4) ═══
  {
    id: 'prop-1', category: 'Properties', label: '.env 格式',
    input: `DB_HOST=localhost
DB_PORT=3306
DB_NAME=mydb
DB_USER=root
DB_PASSWORD=secret`,
    expectFormat: 'Properties', expectKeys: ['DB_HOST', 'DB_PORT', 'DB_NAME'],
  },
  {
    id: 'prop-2', category: 'Properties', label: '点号嵌套 key',
    input: `server.host=0.0.0.0
server.port=8080
database.host=localhost
database.port=3306`,
    expectFormat: 'Properties', expectKeys: ['server', 'database'],
  },
  {
    id: 'prop-3', category: 'Properties', label: '带注释',
    input: `# 应用配置
APP_NAME=easyJSON
APP_PORT=8080
# 环境
APP_ENV=production
LOG_LEVEL=info`,
    expectFormat: 'Properties', expectKeys: ['APP_NAME', 'APP_PORT'],
  },
  {
    id: 'prop-4', category: 'Properties', label: 'INI 风格 section',
    input: `[server]
host = 0.0.0.0
port = 8080
ssl = true

[database]
host = localhost
port = 3306`,
    expectFormat: 'Properties', expectKeys: ['server', 'database'],
  },

  // ═══ 13. JSONC / JSON5 (4) ═══
  {
    id: 'jsonc-1', category: 'JSONC', label: '行注释',
    input: `{
  // 数据库配置
  "host": "127.0.0.1",
  "port": 3306
}`,
    expectFormat: 'JSONC', expectKeys: ['host', 'port'],
  },
  {
    id: 'jsonc-2', category: 'JSONC', label: '块注释',
    input: `{
  /* 服务器设置 */
  "server": "localhost",
  "timeout": 5000
}`,
    expectFormat: 'JSONC', expectKeys: ['server', 'timeout'],
  },
  {
    id: 'jsonc-3', category: 'JSONC', label: '注释 + 尾逗号',
    input: `{
  "name": "test", // 名称
  "items": [1, 2, 3,], /* 列表 */
}`,
    expectFormat: 'JSONC',
  },
  {
    id: 'jsonc-4', category: 'JSONC', label: '多行块注释',
    input: `{
  /*
   * 这是一个配置文件
   * 用于测试 JSONC 解析
   */
  "version": "1.0",
  "debug": true
}`,
    expectFormat: 'JSONC', expectKeys: ['version', 'debug'],
  },

  // ═══ 14. Ruby Hash (4) ═══
  {
    id: 'ruby-1', category: 'Ruby', label: 'Hash rocket 语法',
    input: '{:name => "张三", :age => 28, :active => true, :tags => ["ruby", "rails"]}',
    expectFormat: 'Ruby', expectKeys: ['name', 'age', 'tags'],
  },
  {
    id: 'ruby-2', category: 'Ruby', label: '嵌套 Hash',
    input: '{:user => {:name => "李四", :role => "admin"}, :status => "ok", :count => 5}',
    expectFormat: 'Ruby', expectKeys: ['user', 'status', 'count'],
  },
  {
    id: 'ruby-3', category: 'Ruby', label: 'nil 值',
    input: '{:host => "localhost", :port => 3306, :password => nil, :db => "test"}',
    expectFormat: 'Ruby', expectKeys: ['host', 'port', 'password'],
  },
  {
    id: 'ruby-4', category: 'Ruby', label: '混合 symbol 和 string key',
    input: '{:id => 1001, :data => {:items => ["a", "b"], :total => 2}, :error => nil}',
    expectFormat: 'Ruby', expectKeys: ['id', 'data', 'error'],
  },

  // ═══ 15. Markdown Table (3) ═══
  {
    id: 'md-1', category: 'Markdown Table', label: '简单表格',
    input: `| name | age | city |
|------|-----|------|
| 张三 | 28  | 北京 |
| 李四 | 32  | 上海 |`,
    expectFormat: 'Markdown',
  },
  {
    id: 'md-2', category: 'Markdown Table', label: '数值推断',
    input: `| key | int_val | bool_val |
|-----|---------|----------|
| a   | 42      | true     |
| b   | 0       | false    |`,
    expectFormat: 'Markdown',
  },
  {
    id: 'md-3', category: 'Markdown Table', label: '多列表格',
    input: `| id | name | department | salary | active |
|----|------|------------|--------|--------|
| 1  | 王伟 | 技术部     | 35000  | true   |
| 2  | 陈静 | 产品部     | 32000  | true   |
| 3  | 刘洋 | 技术部     | 28000  | false  |`,
    expectFormat: 'Markdown',
  },

  // ═══ 16. PHP print_r (4) ═══
  {
    id: 'php-1', category: 'PHP', label: '简单 Array',
    input: `Array
(
    [name] => 张三
    [age] => 28
    [active] => 1
)`,
    expectFormat: 'PHP', expectKeys: ['name', 'age', 'active'],
  },
  {
    id: 'php-2', category: 'PHP', label: '嵌套 Array',
    input: `Array
(
    [status] => success
    [data] => Array
        (
            [user_id] => 1001
            [name] => 张三
            [roles] => Array
                (
                    [0] => admin
                    [1] => editor
                )
        )
)`,
    expectFormat: 'PHP', expectKeys: ['status', 'data'],
  },
  {
    id: 'php-3', category: 'PHP', label: '单行 Array',
    input: 'Array ( [id] => 1001 [name] => test [active] => true )',
    expectFormat: 'PHP', expectKeys: ['id', 'name', 'active'],
  },
  {
    id: 'php-4', category: 'PHP', label: '数值 key',
    input: `Array
(
    [0] => apple
    [1] => banana
    [2] => cherry
)`,
    expectFormat: 'PHP', expectKeys: ['0', '1', '2'],
  },

  // ═══ 17. MongoDB Shell (4) ═══
  {
    id: 'mongo-1', category: 'MongoDB', label: 'ObjectId + ISODate',
    input: '{"_id": ObjectId("5f7b3a1b9d3e2a1b3c4d5e6f"), "name": "张三", "createdAt": ISODate("2024-01-15T09:30:00Z")}',
    expectFormat: 'MongoDB', expectKeys: ['_id', 'name', 'createdAt'],
  },
  {
    id: 'mongo-2', category: 'MongoDB', label: 'NumberLong + NumberDecimal',
    input: '{"userId": NumberLong(1001), "balance": NumberDecimal("199.99"), "active": true}',
    expectFormat: 'MongoDB', expectKeys: ['userId', 'balance', 'active'],
  },
  {
    id: 'mongo-3', category: 'MongoDB', label: '混合类型',
    input: '{"_id": ObjectId("aabbccdd11223344aabbccdd"), "count": NumberInt(42), "data": BinData(0, "SGVsbG8="), "ts": Timestamp(1625000000, 1)}',
    expectFormat: 'MongoDB', expectKeys: ['_id', 'count', 'data', 'ts'],
  },
  {
    id: 'mongo-4', category: 'MongoDB', label: 'UUID + MinKey/MaxKey',
    input: '{"id": UUID("550e8400-e29b-41d4-a716-446655440000"), "min": MinKey, "max": MaxKey, "ref": DBRef("users", "abc123")}',
    expectFormat: 'MongoDB', expectKeys: ['id', 'min', 'max', 'ref'],
  },
  {
    id: 'mongo-5', category: 'MongoDB', label: 'mongosh 无引号 Key + 单引号参数',
    input: `{
  _id: ObjectId('66d123456789abcdef012345'),
  createdAt: ISODate('2026-09-09T10:20:00Z'),
  userId: NumberLong(10001),
  tags: [ 'java', 'redis' ]
}`,
    expectFormat: 'MongoDB', expectKeys: ['_id', 'createdAt', 'userId', 'tags'],
  },

  // ═══ 18. 转义 JSON (3) ═══
  {
    id: 'esc-1', category: '转义JSON', label: '标准双编码',
    input: '"{\\"name\\":\\"张三\\",\\"age\\":28,\\"active\\":true}"',
    expectFormat: '转义', expectKeys: ['name', 'age', 'active'],
  },
  {
    id: 'esc-2', category: '转义JSON', label: '含数组的转义',
    input: '"{\\"users\\":[{\\"id\\":1},{\\"id\\":2}],\\"total\\":2}"',
    expectFormat: '转义', expectKeys: ['users', 'total'],
  },
  {
    id: 'esc-3', category: '转义JSON', label: '无转义包裹引号',
    input: '"{"code":200,"message":"ok","data":{"id":1}}"',
    expectFormat: '转义', expectKeys: ['code', 'message', 'data'],
  },

  // ═══ 19. Go map (4) ═══
  {
    id: 'go-1', category: 'Go map', label: '简单 map',
    input: 'map[string]any{"code":200,"msg":"ok","active":true}',
    expectFormat: 'Go map', expectKeys: ['code', 'msg', 'active'],
  },
  {
    id: 'go-2', category: 'Go map', label: '含 nil',
    input: 'map[string]interface{}{"host":"localhost","port":3306,"password":nil}',
    expectFormat: 'Go map', expectKeys: ['host', 'port', 'password'],
  },
  {
    id: 'go-3', category: 'Go map', label: '嵌套 map',
    input: 'map[string]any{"server":map[string]any{"host":"0.0.0.0","port":8080},"debug":false}',
    expectFormat: 'Go map', expectKeys: ['server', 'debug'],
  },
  {
    id: 'go-4', category: 'Go map', label: '多种值类型',
    input: 'map[string]any{"name":"test","count":42,"rate":3.14,"ok":true,"data":nil}',
    expectFormat: 'Go map', expectKeys: ['name', 'count', 'rate', 'ok'],
  },

  // ═══ 20. JSON 自动修复 (5) ═══
  {
    id: 'repair-1', category: '自动修复', label: '缺少 }',
    input: '{"status":"success","data":{"user_id":1002,"roles":["admin","editor"],"active":true}',
    expectFormat: '自动修复', expectKeys: ['status', 'data'],
  },
  {
    id: 'repair-2', category: '自动修复', label: '缺少 ]',
    input: '{"tags":["apple","banana","cherry"}',
    expectFormat: '自动修复', expectKeys: ['tags'],
  },
  {
    id: 'repair-3', category: '自动修复', label: '截断字符串',
    input: '{"name":"hello worl',
    expectFormat: '自动修复', expectKeys: ['name'],
  },
  {
    id: 'repair-4', category: '自动修复', label: '尾部悬挂逗号截断',
    input: '{"a":1,"b":2,',
    expectFormat: '自动修复', expectKeys: ['a', 'b'],
  },
  {
    id: 'repair-5', category: '自动修复', label: '深层嵌套截断',
    input: '{"a":{"b":{"c":[1,2,3',
    expectFormat: '自动修复', expectKeys: ['a'],
  },

  // ═══ 21. 中文全角标点 JSON (2) ═══
  {
    id: 'zh-quote-1', category: '中文引号JSON', label: '电商订单列表 (中文引号+半角混用)',
    input: '{“orderId”:“1463456465456456”,“orderItemList”:[{“id”:“123”,“sku”:“ABCDEFG”,“link”:“https://picui.ogmua.cn/s1/2026/09/01/6a969def1708a.webp",“name”:“商品2”},{“id”:“158778789743”,“sku”:“HKJJFOIJDJ”,“link”:“https://picui.ogmua.cn/s1/2026/09/01/6a969def1708a.webp”,“name”:“商品2”},{“id”:“489789435465465”,“sku”:“JHIOFJLKJLKSJIOHUE”,“link”:“https://picui.ogmua.cn/s1/2026/09/01/6a969def1708a.webp”,“name”:“商品3”},{“id”:“7987846546546874984”,“sku”:“JIOJFIOJOENP”,“link”:“https://picui.ogmua.cn/s1/2026/09/01/6a969def1708a.webp”,“name”:"商品4”}]}',
    expectFormat: '中文引号', expectKeys: ['orderId', 'orderItemList'],
  },
  {
    id: 'zh-quote-2', category: '中文引号JSON', label: '全角括号与冒号',
    input: '｛“title”：“测试数据”，“count”：100，“items”：［“苹果”，“香蕉”］｝',
    expectFormat: '中文引号', expectKeys: ['title', 'count', 'items'],
  },

  // ═══ 22. cURL 命令参数提取 (2) ═══
  {
    id: 'curl-1', category: 'cURL', label: '标准 POST 带 --data-raw',
    input: `curl 'https://api.xxx.com/order' \\
  -H 'content-type: application/json' \\
  --data-raw '{"userId":10001,"items":[{"id":1,"name":"商品1"}]}'`,
    expectFormat: 'cURL', expectKeys: ['userId', 'items'],
  },
  {
    id: 'curl-2', category: 'cURL', label: '多行 -d 紧凑参数',
    input: `curl -X POST https://api.xxx.com/login -H "Content-Type: application/json" -d "{\\"username\\":\\"admin\\",\\"password\\":\\"123456\\"}"`,
    expectFormat: 'cURL', expectKeys: ['username', 'password'],
  },

  // ═══ 23. gRPC / Protobuf 调试输出 (2) ═══
  {
    id: 'pb-1', category: 'Protobuf', label: '嵌套 Message 结构 (用户用例)',
    input: `user {
  id: 10001
  name: "xiaofu"
  roles {
    id: 1
    name: "admin"
  }
}`,
    expectFormat: 'Protobuf', expectKeys: ['user'],
  },
  {
    id: 'pb-2', category: 'Protobuf', label: 'repeated 字段自动聚合数组与枚举',
    input: `id: 10002
name: "xiaofu"
status: ACTIVE
tags: "java"
tags: "redis"
roles {
  id: 1
  name: "admin"
}
roles {
  id: 2
  name: "editor"
}`,
    expectFormat: 'Protobuf', expectKeys: ['id', 'name', 'status', 'tags', 'roles'],
  },

  // ═══ 24. JWT (JSON Web Token) (2) ═══
  {
    id: 'jwt-1', category: 'JWT', label: '标准三段式 JWT Token (用户用例)',
    input: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c',
    expectFormat: 'JWT', expectKeys: ['header', 'payload', 'signature'],
  },
  {
    id: 'jwt-2', category: 'JWT', label: 'Bearer 前缀与 UTF-8 中文字段',
    input: 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJuYW1lIjoi5bCP5aSrIiwicm9sZSI6IueuoeeQhuWRmCJ9.dGVzdHNpZw',
    expectFormat: 'JWT', expectKeys: ['header', 'payload', 'signature'],
  },
]

export const testCategories = [...new Set(testFixtures.map(t => t.category))]
