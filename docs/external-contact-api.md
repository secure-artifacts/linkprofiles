# 联系方式更新 API

用于 CRM、自动化脚本等外部系统局部更新个人页中的联系方式。密钥在后台页面卡片的 **API** 按钮中创建，只对该页面有效。

## 鉴权

```http
Authorization: Bearer lp_live_xxxxxxxxx
```

明文密钥只在创建时显示一次。默认限速为每个密钥每分钟 60 次；响应头 `X-RateLimit-Remaining` 给出当前窗口剩余额度。

## 查询联系方式

```http
GET /_api/v1/profiles/{profileId}/contacts
```

需要 `contacts:read` 权限。

## 局部更新

```http
PATCH /_api/v1/profiles/{profileId}/contacts
Content-Type: application/json
```

需要 `contacts:write` 权限。只修改 `contacts` 中出现的平台，保留其他条目、排序、按钮 ID 和历史统计。

```json
{
  "contacts": {
    "whatsapp": {
      "value": "+64211234567",
      "title": "WhatsApp 联系我",
      "subtitle": "通常当天回复",
      "message": "你好，我想了解更多信息"
    },
    "instagram": { "value": "clarepolly20", "directMessage": true },
    "sms": { "value": "+64211234567", "message": "你好，请联系我" }
  }
}
```

页面尚未启用某个平台时默认返回 `contact_not_found`。确定需要自动添加时传：

```json
{ "createMissing": true, "contacts": { "messenger": { "value": "clare.polly20" } } }
```

每个平台可以修改：`value`、`title`、`subtitle`、`message`、`directMessage`、`isLead`、`passSource`。`message` 仅用于 WhatsApp 和短信，`directMessage` 仅用于 Instagram。

## curl 示例

```bash
curl -X PATCH 'https://links.example.com/_api/v1/profiles/页面UUID/contacts' \
  -H 'Authorization: Bearer lp_live_你的密钥' \
  -H 'Content-Type: application/json' \
  --data '{"contacts":{"whatsapp":{"value":"+64211234567"}}}'
```

## JavaScript 示例

```js
const response = await fetch(`https://links.example.com/_api/v1/profiles/${profileId}/contacts`, {
  method: 'PATCH',
  headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({
    contacts: { instagram: { value: 'clarepolly20', directMessage: true } },
  }),
});
if (!response.ok) throw new Error(await response.text());
console.log(await response.json());
```

所有输入会经过与后台编辑器相同的格式校验。批量中任意一项无效时整次请求回滚，错误响应为 `422` 并指出具体平台。
