# 清宵伤害计算适配 Implementation Plan

> For agentic workers: REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox syntax for tracking.

Goal: 将 E:\github\waves-plugin 和用户远程仓库同步到 Xinglingsuiyue/waves-plugin/main，并用库街区抓取器完成清宵、云琅、天傀劫煞的伤害计算模块适配。

Architecture: 先把上游最新提交作为共同基线，通过 Git fast-forward 或 GitHub refs API 同步本地 main 与 origin/main；数据层使用现有 kuro_wiki_fetch.py 输出完整 wiki JSON/Markdown 和基础 JS，计算层沿用 loader -> module.calc/apply -> formula 链路，在清宵角色模块中合并自身、武器、声骸 buff 并筛选最高 4 个伤害项。

Tech Stack: Git/GitHub CLI API、Python 3、Node.js ES modules、Node node:test、现有 utils/damage 引擎。

## Global Constraints

- 以实时 Xinglingsuiyue/waves-plugin/main 为同步基线，不使用设计阶段缓存 SHA 代替实时查询。
- 禁止 git reset --hard、git checkout --、git push --force，不覆盖用户已有改动。
- 上游仓库只读；本次适配只推送到 Tangxinyan0904/waves-plugin 的 main。
- 库街区页面数据必须由 resources/Shanghai/kuro_wiki_fetch.py 抓取，不手写或用外链替代 wiki 正文。
- 角色、武器、声骸模块必须使用 resources/Shanghai/{characters,weapons,phantoms} 下与加载器一致的中文文件名。
- 清宵伤害结果最多返回 4 项，并按最终 expected 伤害降序排列。
- 生产代码遵循仓库现有 ES module 风格；新增行为先写可失败测试，再实现。

---

### Task 1: Refresh And Synchronize Repository Baseline

Files:
- Modify: Git refs only; no tracked files

Interfaces:
- Consumes: upstream/main from Xinglingsuiyue/waves-plugin
- Produces: local main and origin/main pointing to the same upstream commit

- [ ] Step 1: Verify the design branch and worktree are safe to synchronize

Run:

~~~powershell
git status --short --branch
git branch --show-current
git log -1 --oneline --decorate
~~~

Expected: the only local change is the committed design/plan history on codex/qingxiao-adaptation-design or its successor; do not synchronize that branch in place.

- [ ] Step 2: Read the real upstream and user-remote heads through GitHub API

Run:

~~~powershell
$upstream = gh api repos/Xinglingsuiyue/waves-plugin/git/ref/heads/main --jq .object.sha
$origin = gh api repos/Tangxinyan0904/waves-plugin/git/ref/heads/main --jq .object.sha
Write-Output "upstream=$upstream"
Write-Output "origin=$origin"
~~~

Expected: both SHA values are available; record them before changing refs.

- [ ] Step 3: Confirm the user remote can be fast-forwarded

Run:

~~~powershell
gh api repos/Xinglingsuiyue/waves-plugin/compare/$origin...$upstream --jq '{status,ahead_by,behind_by,merge_base:.merge_base_commit.sha}'
~~~

Expected: status is ahead, behind_by is 0, and merge_base equals the current user remote SHA. If the result is diverged, stop and report instead of overwriting origin/main.

- [ ] Step 4: Update local main without discarding the design commit

Create a clean temporary clone or use a clean local main worktree. In the clean checkout, fast-forward to the upstream SHA:

~~~powershell
git fetch upstream main
git switch main
git merge --ff-only upstream/main
~~~

The implementation branch will be created from this synchronized main; the design commit remains in its existing branch history and is not discarded.

- [ ] Step 5: Update the user remote main with the exact upstream commit

If Git HTTPS is available:

~~~powershell
git push origin $upstream:refs/heads/main
~~~

Otherwise use the authenticated GitHub refs API only after Step 3 proves fast-forward safety:

~~~powershell
gh api --method PATCH repos/Tangxinyan0904/waves-plugin/git/refs/heads/main -f sha=$upstream -F force=false
~~~

Expected: the API reports the ref at the upstream SHA and no force update is requested.

- [ ] Step 6: Verify all three baseline refs match

Run:

~~~powershell
git rev-parse main
gh api repos/Tangxinyan0904/waves-plugin/git/ref/heads/main --jq .object.sha
gh api repos/Xinglingsuiyue/waves-plugin/git/ref/heads/main --jq .object.sha
~~~

Expected: all three values match exactly; record the SHA in the implementation commit notes.

---

### Task 2: Fetch And Inspect The Three Kurobbs Entries

Files:
- Create: resources/Shanghai/characters/清宵.wiki.json
- Create: resources/Shanghai/characters/清宵.wiki.md
- Create/Replace: resources/Shanghai/characters/清宵.js
- Create: resources/Shanghai/weapons/云琅.wiki.json
- Create: resources/Shanghai/weapons/云琅.wiki.md
- Create/Replace: resources/Shanghai/weapons/云琅.js
- Create: resources/Shanghai/phantoms/天傀劫煞.wiki.json
- Create: resources/Shanghai/phantoms/天傀劫煞.wiki.md
- Create/Replace: resources/Shanghai/phantoms/天傀劫煞.js

Interfaces:
- Consumes: C:\msys64\home\Administrator\TRSS_AllBot\TRSS-Yunzai\plugins\waves-plugin\resources\Shanghai\kuro_wiki_fetch.py
- Produces: complete parsed page documents and baseline JS modules in the E: repository

- [ ] Step 1: Run the fetcher offline self-test

Run:

~~~powershell
python 'C:\msys64\home\Administrator\TRSS_AllBot\TRSS-Yunzai\plugins\waves-plugin\resources\Shanghai\kuro_wiki_fetch.py' --self-test
~~~

Expected: exit code 0.

- [ ] Step 2: Fetch 清宵

Run:

~~~powershell
python 'C:\msys64\home\Administrator\TRSS_AllBot\TRSS-Yunzai\plugins\waves-plugin\resources\Shanghai\kuro_wiki_fetch.py' character 清宵 --out-dir 'E:\github\waves-plugin\resources\Shanghai' --force-js
~~~

Expected: the output names the character, writes .wiki.json, .wiki.md, characters/清宵.js, and reports at least one multiplier row.

- [ ] Step 3: Fetch 云琅

Run:

~~~powershell
python 'C:\msys64\home\Administrator\TRSS_AllBot\TRSS-Yunzai\plugins\waves-plugin\resources\Shanghai\kuro_wiki_fetch.py' weapon 云琅 --out-dir 'E:\github\waves-plugin\resources\Shanghai' --force-js
~~~

Expected: the output writes the weapon wiki files and weapons/云琅.js.

- [ ] Step 4: Fetch 天傀劫煞

Run:

~~~powershell
python 'C:\msys64\home\Administrator\TRSS_AllBot\TRSS-Yunzai\plugins\waves-plugin\resources\Shanghai\kuro_wiki_fetch.py' phantom 天傀劫煞 --out-dir 'E:\github\waves-plugin\resources\Shanghai' --force-js
~~~

Expected: the output writes the phantom wiki files and phantoms/天傀劫煞.js.

- [ ] Step 5: Verify the fetched documents are not shells

Run:

~~~powershell
$files = @(
  'resources/Shanghai/characters/清宵.wiki.json',
  'resources/Shanghai/characters/清宵.wiki.md',
  'resources/Shanghai/weapons/云琅.wiki.json',
  'resources/Shanghai/weapons/云琅.wiki.md',
  'resources/Shanghai/phantoms/天傀劫煞.wiki.json',
  'resources/Shanghai/phantoms/天傀劫煞.wiki.md'
)
$files | ForEach-Object { $item = Get-Item $_; [pscustomobject]@{Path=$_.ToString(); Length=$item.Length} }
rg -n '技能|共鸣链|效果|等级|倍率|触发|伤害' $files
~~~

Expected: all six files are non-empty, each Markdown contains page text or tables, and no file consists only of a source URL.

- [ ] Step 6: Commit fetched raw data separately

Run:

~~~powershell
git add -- 'resources/Shanghai/characters/清宵.wiki.json' 'resources/Shanghai/characters/清宵.wiki.md' 'resources/Shanghai/characters/清宵.js' 'resources/Shanghai/weapons/云琅.wiki.json' 'resources/Shanghai/weapons/云琅.wiki.md' 'resources/Shanghai/weapons/云琅.js' 'resources/Shanghai/phantoms/天傀劫煞.wiki.json' 'resources/Shanghai/phantoms/天傀劫煞.wiki.md' 'resources/Shanghai/phantoms/天傀劫煞.js'
git commit -m "data: add Qingxiao Yunlang and Tiankui Jiesha"
~~~

---

### Task 3: Add Failing Damage-Module Tests

Files:
- Create: tests/qingxiao-adaptation.test.js

Interfaces:
- Consumes: utils/damage/loader.js, utils/damage/engine.js, fetched modules and a fixed role detail fixture
- Produces: regression tests for module loading, effects and result ranking

- [ ] Step 1: Define a stable fixture and expected module contracts

Create a test fixture with a level-90 清宵 panel, a level-10 skill list, a 0-chain chainList, and a 6-chain copy with all six entries unlocked. Equipment must name 云琅 and 天傀劫煞; use the loader rather than direct imports.

The test must assert:

~~~javascript
assert.equal(character.name, '清宵');
assert.equal(weapon.name, '云琅');
assert.equal(phantom.name, '天傀劫煞');
assert.equal(typeof character.calc, 'function');
assert.equal(typeof weapon.apply, 'function');
assert.equal(typeof phantom.apply, 'function');
~~~

- [ ] Step 2: Add a failing test for 清宵 result shape and ranking

Call calcDamage(fixture, { enemyName: '无妄者' }) and assert that the result has at most four damage items and every adjacent item satisfies left.expected >= right.expected. Before the adapter exists, the test must fail because the character module is missing or does not return the required result.

- [ ] Step 3: Add failing tests for chain and equipment state changes

Assert that the 6-chain result differs from the 0-chain result for at least one matching skill name; assert that toggling the documented 云琅 and 天傀劫煞 activation options changes the corresponding result and disabling both does not retain their buff values. Run the file and confirm failures are caused by missing target modules/behavior, not malformed test setup.

- [ ] Step 4: Commit the tests before implementation

Run:

~~~powershell
node --test tests/qingxiao-adaptation.test.js
~~~

Expected: FAIL for the missing behavior. Then commit only the test file:

~~~powershell
git add -- tests/qingxiao-adaptation.test.js
git commit -m "test: define Qingxiao damage adaptation"
~~~

---

### Task 4: Implement 云琅 And 天傀劫煞 Buff/Skill Modules

Files:
- Modify: resources/Shanghai/weapons/云琅.js
- Modify: resources/Shanghai/phantoms/天傀劫煞.js
- Test: tests/qingxiao-adaptation.test.js

Interfaces:
- Consumes: each item's .wiki.json/.wiki.md values and the existing apply({ roleDetailData, panel, equipment, enemy, skillType, skillName, options }) convention
- Produces: deterministic buff objects and any phantom skill data required by the damage result

- [ ] Step 1: Compare generated JS against fetched wiki values

Read generated modules and their wiki files side by side. List each numeric effect and trigger in the test fixture comments or a small local helper. Do not encode an effect until its source row/text is present in the fetched document.

- [ ] Step 2: Write tests for active and inactive weapon/phantom effects

Call weapon.apply and phantom.apply with options states named with yunlang and tiankuiJiesha prefixes. Assert exact buff fields for one active state and zero for the disabled state. If the phantom has direct active damage, assert its returned damage item shape separately from persistent buffs.

- [ ] Step 3: Run focused tests and confirm the new assertions fail

Run:

~~~powershell
node --test tests/qingxiao-adaptation.test.js
~~~

Expected: the new effect assertions fail before implementation is written.

- [ ] Step 4: Implement minimal equipment modules

Keep wiki metadata intact. Use bounded resonance-level lookup for 云琅. Return only existing buff keys (attackPercent, flatAttack, damageBonus, deepen, ignoreDefense, critRate, critDamage, hpPercent, flatHp) unless a failing test proves a shared extension is necessary. Use default-active options only where the fetched page describes an assumed active trigger.

- [ ] Step 5: Run focused tests and syntax checks

Run:

~~~powershell
node --check 'resources/Shanghai/weapons/云琅.js'
node --check 'resources/Shanghai/phantoms/天傀劫煞.js'
node --test tests/qingxiao-adaptation.test.js
~~~

Expected: module contract and active/inactive equipment tests pass; character-specific tests remain red until Task 5.

- [ ] Step 6: Commit equipment modules

~~~powershell
git add -- 'resources/Shanghai/weapons/云琅.js' 'resources/Shanghai/phantoms/天傀劫煞.js' tests/qingxiao-adaptation.test.js
git commit -m "feat: add Yunlang and Tiankui Jiesha effects"
~~~

---

### Task 5: Implement 清宵 Damage Calculation

Files:
- Modify: resources/Shanghai/characters/清宵.js
- Test: tests/qingxiao-adaptation.test.js

Interfaces:
- Consumes: 清宵 wiki multiplier rows, calcSingleDamage, mergeBuff, 云琅/天傀劫煞 modules and parsed role chain/skill data
- Produces: default.calc(context) returning { enemyName, source, items }, with at most four ranked damage items

- [ ] Step 1: Extract exact 清宵 skill rows and mechanism values from wiki files

Before editing the module, inspect 清宵.wiki.md and 清宵.wiki.json. For each selected skill record its level-10 multiplier, levelFrom, skill type, element, and whether its base is attack/HP/defense. Record chain and passive conditions affecting damage. Reject auto-generated healing, shield, summon, or duplicate rows unless explicitly needed by the result contract.

- [ ] Step 2: Add a failing 0-chain/6-chain assertion for a named skill

Extend the test to find a skill present in both result lists and assert that its 6-chain expected value is greater than its 0-chain value when required states are active. Run the test and confirm it fails before changing the character module.

- [ ] Step 3: Implement skill level and chain helpers

Add local helpers equivalent to:

~~~javascript
function getSkillLevel(roleDetailData, typeName) { /* read skillList */ }
function getChainUnlockedCount(roleDetailData) { /* count unlocked */ }
function clamp(value, min, max) { /* bound option stacks */ }
~~~

Use exact skill type names from the fetched page and preserve a unique key for each skill so chain effects can target only intended entries.

- [ ] Step 4: Implement 清宵 self buffs and calculation

Build getRoleSelfBuff({ skill, chainCount, options }), merge it with modules.weapon.apply and modules.phantom.apply, calculate the correct base attribute, then call calcSingleDamage. Include sourceDetail: mergedBuff.sources so logs identify every active source. Keep critRate clamped by the formula helper and avoid treating a non-damage action as damage.

- [ ] Step 5: Implement the top-four selector

Use:

~~~javascript
function pickTopItems(items, count = 4) {
  return items.filter(Boolean)
    .sort((left, right) => right.expected - left.expected)
    .slice(0, count);
}
~~~

Sort by final expected, not only raw skill multiplier, because weapon, phantom and chain effects can change the ranking.

- [ ] Step 6: Run focused tests and syntax checks

Run:

~~~powershell
node --check 'resources/Shanghai/characters/清宵.js'
node --test tests/qingxiao-adaptation.test.js
~~~

Expected: all focused tests pass, including module loading, 0/6-chain difference, active/inactive equipment states and top-four ordering.

- [ ] Step 7: Commit the character adapter

~~~powershell
git add -- 'resources/Shanghai/characters/清宵.js' tests/qingxiao-adaptation.test.js
git commit -m "feat: add Qingxiao damage calculation"
~~~

---

### Task 6: Run Full Verification And Publish To User Remote

Files:
- Modify: no unrelated files

Interfaces:
- Consumes: synchronized baseline plus three fetched modules and tests
- Produces: verified origin/main containing upstream baseline and adaptation commits

- [ ] Step 1: Run all available offline checks

Run:

~~~powershell
python 'C:\msys64\home\Administrator\TRSS_AllBot\TRSS-Yunzai\plugins\waves-plugin\resources\Shanghai\kuro_wiki_fetch.py' --self-test
node --test tests/qingxiao-adaptation.test.js
Get-ChildItem 'resources/Shanghai/characters/清宵.js','resources/Shanghai/weapons/云琅.js','resources/Shanghai/phantoms/天傀劫煞.js' | ForEach-Object { node --check $_.FullName }
git diff --check HEAD~5..HEAD
~~~

Expected: all commands pass, with no diff-check errors.

- [ ] Step 2: Inspect final change scope

Run:

~~~powershell
git status --short --branch
git diff --stat <synced-upstream-sha>..HEAD
git diff --name-only <synced-upstream-sha>..HEAD
~~~

Expected: only fetched wiki artifacts, three target modules, focused test, and approved design/plan documentation appear.

- [ ] Step 3: Fast-forward the clean main branch to implementation commits

Keep the implementation branch for review. In a clean checkout, fast-forward main to the implementation branch:

~~~powershell
git switch main
git merge --ff-only codex/qingxiao-adaptation
git status --short --branch
~~~

Expected: clean main; no merge commit is needed.

- [ ] Step 4: Push complete history to the user remote without force

Use Git if available:

~~~powershell
git push origin main
~~~

If Git transport remains unavailable, update the user remote ref through authenticated GitHub API only when the remote head is an ancestor of local main; do not use force=true.

- [ ] Step 5: Verify final synchronization and report exact refs

Run:

~~~powershell
git rev-parse main
gh api repos/Tangxinyan0904/waves-plugin/git/ref/heads/main --jq .object.sha
gh api repos/Xinglingsuiyue/waves-plugin/git/ref/heads/main --jq .object.sha
git status --short --branch
~~~

Expected: local main and origin/main match; upstream is the ancestor of the final user remote, with adaptation commits after it. Report the exact final commit and GitHub links.
