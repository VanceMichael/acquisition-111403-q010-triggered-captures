# 来源资料约定

电池台架触发资料接收器。已有单台片段收件能力；台架控制器另提供触发关联、设备时钟和片段清单。

## 交互与身份

GET /capture返回单设备片段；GET /triggers含session/triggerId/expected及每设备的delivered/missed/pending。GET /segments含device/boot/localTrigger/preSamples/sampleRate/startTick/count/url；GET /bindings将session/triggerId关联到device/boot/localTrigger。GET /clocks给出tick到控制器时间的区间映射。triggerId在session内唯一，localTrigger在boot内唯一；missed是显式漏采，pending不是漏采。

## 外部变化

正常资料在 `fixtures/source.mjs`。同一来源可能处于这些外部阶段：missed、camera-arrived。集成测试通过来源实例的`setPhase`切换外部状态，这不是线上业务接口。阶段内同一URL的响应可以改变，其余URL保留正常资料；来源的请求轨迹在实例的`requests`中可查，控制方法不对网络开放。未知地址返回404，非法请求返回非成功状态。

## 已有收件边界

当前`src/reader.mjs`只收取/capture提供的已整理资料。归档按资料标识和内容摘要区分版本，原文按响应字节摘要独立存储，打开归档时逐份校验。来源文件、接收记录和对外查询不共享内存对象。未声明的协议能力不作推断；格式子集以本页和实际来源为准。
