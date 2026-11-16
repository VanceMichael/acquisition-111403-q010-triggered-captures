# 来源资料约定

电池台架触发资料接收器。台架控制器提供触发关联、设备时钟和片段清单；服务按触发批次领取并结构化接收。

## 交互与身份

GET /capture返回单设备已整理片段；GET /triggers含session/triggerId/expected及每设备的delivered/missed/pending；GET /bindings将session/triggerId关联到device/boot/localTrigger；GET /segments含device/boot/localTrigger/preSamples/sampleRate/startTick/count/url；GET /clocks给出tick到控制器时间的区间映射。

- `triggerId` 在 session 内唯一；不同 session 可有相同触发号。
- `localTrigger` 在 boot 内唯一；设备重启换 boot，计数器回绕后本地触发号可重复。
- `missed` 是显式漏采，`pending` 不是漏采；某台设备未生效不影响其他设备通道。
- 片段标识为 `device+boot+localTrigger`，不按本地触发号数值先后推断归属。
- `/clocks` 的 `offset` 是 `[下限,上限]` 区间，映射结果只能给出时间范围，不能给出唯一时刻。

## 触发批次领取

`POST /batches/claim` 领取一次真实触发，请求体可含 `session`、`triggerId`，均省略时领取第一个未齐套批次：

- 同时给出：只领取该批次；来源未声明但本地有记录时继续补收。
- 只给 `triggerId`：跨 session 重号返回 409，要求显式指定 session。
- 只给 `session`：按来源顺序取该 session 内第一个未齐套批次。
- 领取是幂等的：同一批次重复领取只更新状态，不重复建立资料版本。

`GET /batches` 列出全部批次，`GET /batches/:id` 查看单个批次；批次标识为 `session:triggerId`。`GET /records`、`GET /receipts` 保持原有语义。

## 齐套判断

齐套按通道逐项判断，每个通道记录 `status`：

| status | 含义 |
| --- | --- |
| `complete` | 绑定、片段、样本均已收齐，且样本数等于片段 `count` |
| `missed` | 来源显式声明该设备本次未触发 |
| `awaiting-binding` | 来源尚未给出该设备的绑定 |
| `awaiting-segment` | 绑定已到，片段清单尚未包含该片段 |
| `awaiting-samples` | 片段已登记，样本分批到达或暂不可取 |
| `conflict` | 绑定或片段归属互相矛盾，或同一切片被多个批次绑定 |
| `invalid-binding` / `invalid-segment` / `invalid-samples` | 字段无效、片段定义冲突或样本数超过声明 |

批次 `completeness.state` 为 `empty` / `partial` / `blocked` / `complete`：仅当所有通道均为终态（`complete` 或 `missed`）且无阻断问题时为 `complete`。

明确不使用以下依据：

- 不以所有通道样本长度相等作为齐套条件——每通道只对照自己的片段 `count`。
- 不按文件到达时间或相近时间凑包，跨设备关联只采用来源 `/bindings`。
- 时间窗口带校准不确定范围（`timing.uncertaintySeconds`），窗口重叠不作为触发合并依据。

## 补收与完整性解释

- 片段分批到达时，已收部分保留在批次中并标记 `samples.receivedCount/declaredCount`，再次领取继续比对。
- 来源本次未返回绑定、片段或时钟时，沿用已归档记录并标记 `stale`，同时保留原凭据。
- 来源声明漏采（`expected` 缺少某设备）时，仍按绑定与片段继续补收，声明标为 `undeclared`。
- 声明为 `missed` 但实际片段完整时按实收保留，并记录 `declared-missed-but-captured`。
- 缺少 `boot` 或 `localTrigger` 的片段不纳入齐套判断，作为 `segment-unbound` 线索列出。
- 每批次另有 `history`（齐套状态变化）与各通道 `declaration.history`（来源声明变化），用于解释批次为何此时完整/未完整。

## 来源证明

每个通道的 `evidence` 保存触发声明、绑定、片段、时钟和样本各次读取的凭据：`url`、`status`、响应字节摘要 `hash` 和 `receiptId`。批次顶层 `evidence` 汇总同一批凭据。原文按响应字节摘要存于归档，重开时逐份校验；字节变化会形成新的凭据，不会被当作同一证明。

## 外部变化

正常资料在 `fixtures/source.mjs`。集成测试通过来源实例的 `setPhase` 切换外部状态，这不是线上业务接口。阶段内同一URL的响应可以改变，其余URL保留正常资料；来源的请求轨迹在实例的`requests`中可查，控制方法不对网络开放。未知地址返回404，非法请求返回非成功状态。

## 已有收件边界

`src/reader.mjs` 仍只收取 `/capture` 提供的单份已整理资料，`POST /collect` 行为不变。归档按资料标识和内容摘要区分版本，原文按响应字节摘要独立存储。未声明的协议能力不作推断；格式子集以本页和实际来源为准。
