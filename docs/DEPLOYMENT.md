# 部署信息

## 域名总览

| 环境 | 平台 | 域名 |
|------|------|------|
| 前端 | Cloudflare Pages | https://lt.smartice.ai |
| 前端备用 | Cloudflare Pages | https://lingtinofsmartice.pages.dev |
| 后端 | Zeabur | https://lingtinapi.preview.aliyun-zeabur.cn |

## 后端部署配置 (Zeabur)

- **平台**: Zeabur (https://zeabur.com)
- **项目ID**: `697a5cfa06505fdd547f6889`
- **服务ID**: `697a6376f2339c9e766cb99d`
- **服务名**: `lingtinofsmartice`
- **区域**: 阿里云中国区 (aliyun-zeabur.cn)
- **根目录**: `/apps/api`
- **框架**: NestJS + pnpm
- **自动HTTPS**: Zeabur 自动提供
- **API 地址**: `https://lingtinapi.preview.aliyun-zeabur.cn/api`
- **内部DNS**: `lingtinofsmartice.zeabur.internal`

### 端口配置

Zeabur 自动设置 `PORT=8080`，NestJS 应用需要监听此端口。Dockerfile 中 EXPOSE 3001 仅作为文档说明，实际端口由 Zeabur 环境变量控制。

### 环境变量

```
NODE_ENV=production
PORT=8080                    # Zeabur 自动设置
SUPABASE_URL=https://wdpeoyugsxqnpwwtkqsl.supabase.co
SUPABASE_SERVICE_KEY=<见.env>
XUNFEI_API_KEY=<见.env>
XUNFEI_API_SECRET=<见.env>
XUNFEI_APP_ID=<见.env>
GEMINI_API_KEY=<见.env>
ANTHROPIC_API_KEY=<见.env>
OPENROUTER_API_KEY=<见.env>
DASHSCOPE_API_KEY=<见.env>          # 阿里 Paraformer-v2 STT (可选, 未配置时回退讯飞)
```

### Docker 构建注意事项

pnpm 在 Docker 中默认只安装 `dependencies`，不安装 `devDependencies`。因此构建工具和类型声明必须放在 `dependencies` 中：

- `@nestjs/cli` - NestJS 构建命令
- `@nestjs/schematics` - NestJS CLI 依赖
- `typescript` - TypeScript 编译器
- `@types/*` - 所有类型声明文件

### 历史部署 (已废弃)

~~阿里云 SAE~~ - 2026-01-29 已删除，原因：HTTPS配置复杂，Cloudflare Full (Strict) 模式需要有效SSL证书

## 前端部署配置

- **构建命令**: `pnpm install && pnpm --filter @lingtin/web build`
- **输出目录**: `apps/web/out`
- **环境变量**: `NEXT_PUBLIC_API_URL` = `https://lingtinapi.preview.aliyun-zeabur.cn`
- **项目名**: `lingtinofsmartice`

## 部署状态检查命令

```bash
# 前端 (Cloudflare Pages) - 查看部署列表和状态
npx wrangler pages deployment list --project-name=lingtinofsmartice

# 后端 (Zeabur) - 查看服务列表
zeabur service list -i=false

# 后端 (Zeabur) - 查看服务详情
zeabur service get --id 697a6376f2339c9e766cb99d -i=false

# 后端 (Zeabur) - 手动触发重新部署
zeabur service redeploy --id 697a6376f2339c9e766cb99d -y -i=false

# 后端健康检查 (返回 401 表示 API 正常运行)
curl -s "https://lingtinapi.preview.aliyun-zeabur.cn/api/audio/today?restaurant_id=test"
```
