# 腾讯云 Ubuntu 22.04 部署

这套站点适合你的服务器现状：

- Ubuntu 22.04 LTS
- Docker 网络已运行
- 负载较低
- 内存和磁盘余量足够
- 公网 IP：`43.136.56.11`

## 目录规划

```text
/opt/easy-web
  ├── app
  ├── deploy
  └── certs
```

## 首次部署

```bash
git clone https://github.com/uudon/easy-web.git /opt/easy-web/app
cd /opt/easy-web/app
npm install
npm run build
docker compose up -d --build
```

## 一次性可执行命令

如果你的服务器还没准备目录，可以直接按顺序执行：

```bash
sudo mkdir -p /opt/easy-web
sudo chown -R $USER:$USER /opt/easy-web
git clone https://github.com/uudon/easy-web.git /opt/easy-web/app
cd /opt/easy-web/app
npm install
npm run build
docker compose up -d --build
```

## 更新发布

后续每次更新代码后，在服务器执行：

```bash
cd /opt/easy-web/app
git pull
npm install
npm run build
docker compose up -d --build
```

## 检查容器状态

```bash
cd /opt/easy-web/app
docker compose ps
docker compose logs --tail=100
```

## 当前建议上线方式

因为你现在还没有域名、SSL 和备案，第一阶段建议先这样做：

1. 直接通过 `http://43.136.56.11` 访问站点
2. 先完成内容填充和页面验证
3. 后续有域名后再接入 HTTPS 和正式域名访问

## 服务器放行

请确认腾讯云安全组至少放行：

- `80/tcp`
- `22/tcp`

如果你后续接入 HTTPS，再额外放行：

- `443/tcp`

## HTTPS 证书

推荐两种方式：

- 腾讯云免费证书，手工下载到 `deploy/certs`
- Let’s Encrypt，后续再自动续期

当前阶段可以先不配，等域名确定后再接。

## 域名解析

- `A` 记录指向你的腾讯云公网 IP
- 如果只做中文主站，先让主域名直达 `/zh-cn/` 入口

你现在还没有域名，所以这一步暂时跳过。

## 验收清单

- `http://43.136.56.11` 可访问
- 首页正常打开
- 中文文档路由可访问
- 静态资源命中缓存头
