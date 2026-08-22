# 清宵伤害计算适配设计

## 目标

以 `Xinglingsuiyue/waves-plugin` 的 `main` 为同步基线，将本地仓库 `E:\github\waves-plugin` 和用户远程仓库 `Tangxinyan0904/waves-plugin` 对齐；随后使用现有库街区抓取脚本获取清宵、云琅、天傀劫煞的数据，并按照当前伤害计算引擎的模块约定完成适配。

## 当前上下文

- 本地仓库：`E:\github\waves-plugin`
- 用户远程：`origin = https://github.com/Tangxinyan0904/waves-plugin.git`
- 上游远程：`upstream = https://github.com/Xinglingsuiyue/waves-plugin.git`
- 设计确认时本地 `main` 和 `origin/main` 为 `95dc926`。
- 设计确认时上游实时 `main` 为 `b7df6ef`，且上游提交包含本地提交的历史。
- 抓取器：`C:\msys64\home\Administrator\TRSS_AllBot\TRSS-Yunzai\plugins\waves-plugin\resources\Shanghai\kuro_wiki_fetch.py`
- 抓取器通过 `--out-dir` 支持把结果写入 `E:\github\waves-plugin\resources\Shanghai`，不要求脚本必须位于目标仓库中。

## 同步策略

1. 重新读取上游 `main` 的实时提交，不能把设计阶段的 `b7df6ef` 当作永久固定值。
2. 确认本地工作区干净，并确认用户远程 `main` 是上游 `main` 的祖先。
3. 将本地 `main` 快进到上游提交。
4. 将用户远程 `origin/main` 快进到同一上游提交。禁止 `--force`、`reset --hard` 和覆盖工作区文件。
5. 同步完成后再次比较本地 `main`、`origin/main` 和上游 `main` 的提交哈希。
6. 如果 Git 的 HTTPS 传输仍不可用，优先使用已验证可访问的 GitHub API 完成只读比较和用户远程的快进更新；在无法保持 Git 提交历史一致时停止并报告，不用“只复制文件”冒充仓库同步。

上游仓库不接收本次适配的推送。适配完成后，用户远程会在上游提交之后新增适配提交，因此最终用户远程应当是“上游提交 + 本次适配”，而不是重新修改上游仓库。

## 数据获取与文件布局

对每个目标分别运行抓取器，指定类型、名称、`--force-js` 和目标输出目录：

```text
character 清宵
weapon 云琅
phantom 天傀劫煞
```

每个条目必须产生完整的 `.wiki.json` 和 `.wiki.md`，并生成对应基础 JS。目标模块名必须与伤害引擎的文件加载规则完全一致：

```text
resources/Shanghai/characters/清宵.js
resources/Shanghai/weapons/云琅.js
resources/Shanghai/phantoms/天傀劫煞.js
```

抓取结果中的条目 ID、来源 URL、技能等级表和原始页面文本保留在 wiki 文件中；适配代码不重新手写页面原文。若自动生成的基础 JS 不能表达角色特殊机制，只在适配模块中补充计算逻辑，并以同目录 wiki 文件作为数值核对依据。

## 伤害模块设计

### 清宵

- 使用 `parsePanel`、`normalizeRoleDetailData`、`getPercentAttr`、`mergeBuff` 和 `calcSingleDamage` 等现有 API。
- 从 `skillList` 读取技能等级，从 `chainList` 读取已解锁共鸣链。
- 根据库街区页面确认技能的元素、技能类型、倍率和基础属性；不因为技能名称相似而假设技能类型。
- 将清宵自身固有技能、共鸣链和特殊状态建模为自身 buff，再与云琅和天傀劫煞的 `apply()` 结果合并。
- 候选技能按最终 `expected` 伤害降序排列，最多返回 4 项；每项保留引擎已有的非暴击、暴击、期望伤害和来源明细。
- 只有库街区明确存在的触发条件才加入默认开启的计算选项；选项命名使用清宵前缀，避免与其他角色状态冲突。

### 云琅

- 使用武器模块的 `wiki` 元数据保存条目 ID、更新时间和效果原文。
- 在 `apply({ panel, options, ... })` 中读取谐振阶数和必要的触发选项。
- 将生命、攻击、技能伤害、暴击或其他效果映射到现有 buff 字段；如果效果无法由当前引擎表达，先通过测试确认缺口，再做最小范围的通用扩展。

### 天傀劫煞

- 使用声骸模块的 `wiki` 元数据保存页面信息。
- 通过现有 phantom loader 以主位声骸名称加载。
- 将声骸主动技能伤害和可持续增益拆分为引擎可识别的 `apply()` buff 或角色候选技能，不把声骸效果错误地当成角色技能倍率。
- 对页面中明确的触发次数、持续时间或元素限制提供默认计算状态，并允许通过 `options` 关闭，以便验证单项效果。

## 测试与验收

新增针对性测试，不依赖实时库街区网络：

1. 对三个生成模块运行 `node --check`，确认中文文件名和 ES module 语法有效。
2. 使用固定的角色面板 fixture，通过真实 loader 加载 `清宵`、`云琅`、`天傀劫煞`，确认模块名称和 `calc/apply` 接口可用。
3. 验证清宵 0 链和 6 链的计算结果不同，并且共鸣链增益只作用于页面规定的技能。
4. 验证切换云琅和天傀劫煞的装备状态会改变对应伤害结果，关闭选项后不会残留 buff。
5. 验证清宵最终只返回最多 4 个伤害条目，条目排序与 `expected` 降序一致。
6. 运行抓取器本地 `--self-test` 和现有测试；实时抓取只作为一次性数据获取，不作为离线测试前提。
7. 检查 `git diff --check`，确认没有空壳 wiki 文件、外链代替正文或与本任务无关的文件改动。

## 不在范围内

- 不重构整个伤害引擎，不修改与清宵、云琅、天傀劫煞无关的角色模块。
- 不修改 `Xinglingsuiyue/waves-plugin` 上游仓库。
- 不把未被库街区页面或现有引擎证据支持的机制写入计算。
- 不删除或覆盖用户已有的非本任务改动。

## 完成标准

- 同步阶段结束时本地 `main`、用户 `origin/main` 与上游 `main` 指向同一提交。
- 三个目标条目都有完整 wiki JSON、Markdown 和可加载 JS 模块。
- 清宵、云琅、天傀劫煞能够通过真实伤害引擎链路参与计算，清宵最多显示 4 项伤害。
- 自动化验证通过，且最终用户远程包含上游最新提交和本次适配内容。
