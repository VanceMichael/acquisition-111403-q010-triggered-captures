# 并行试验台的触发批次与预采样接收

电池台架触发资料接收器。已有单台片段收件能力；台架控制器另提供触发关联、设备时钟和片段清单。服务按一次真实触发领取并结构化接收跨设备资料。

## 运行

使用 Node.js 22，依赖由 package-lock.json 固定。安装后可执行：

```sh
npm ci --ignore-scripts --no-audit --no-fund
npm test
npm run demo
npm start
```

服务启动本地来源与收件接口，默认端口分别为4011和4010。`POST /batches/claim` 领取触发批次（可带 `session`、`triggerId`）；`GET /batches`、`GET /batches/:id` 查看批次与完整性解释；`GET /records` 查看结构化资料，`GET /receipts` 查看原文凭据，`GET /health` 查看服务状态。原有 `POST /collect` 仍收单份 `/capture` 资料。`PORT`、`SOURCE_PORT`与`DATA_DIR`可分别设置端口和归档目录。

```sh
docker build -t triggered-captures .
docker run --rm --network none triggered-captures npm test
docker run --rm --network none triggered-captures npm run demo
docker run --rm -p 4010:4010 triggered-captures
```

## 资料组织

`provider/`是独立本地来源，`fixtures/`记录合成资料和来源阶段，`src/batch.mjs`按触发批次关联设备通道并判断齐套，`src/reader.mjs`负责原有单份收件，`src/source.mjs`限定来源地址并记录响应字节，`src/archive.mjs`保存按摘要校验的原文、资料版本与批次状态。`test/`覆盖现有收件、批次领取、重启与回绕、分批到达、声明缺失、原文完整性和服务联通。运行不依赖外网、数据库服务或真实设备。

完整来源约定见 `docs/source-contract.md`。项目只访问本地合成资料，不携带真实身份、密钥或业务数据。

## 快速查看

`npm run demo`启动实际来源和收件服务、领取一次触发、在相机片段到达后补收同一批次，并打印批次解释、结构化资料及凭据，临时归档在退出时清理。正常完成时间小于90秒；需要保留数据时用`npm start`及独立`DATA_DIR`。演示反映当前产品能力，不代表全部来源资料已被接纳。
