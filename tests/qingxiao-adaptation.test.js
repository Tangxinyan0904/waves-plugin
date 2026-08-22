import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

const repoRoot = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const sandboxRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'waves-qingxiao-test-'));
fs.mkdirSync(path.join(sandboxRoot, 'plugins'), { recursive: true });
fs.symlinkSync(repoRoot, path.join(sandboxRoot, 'plugins', 'waves-plugin'), 'junction');
process.chdir(sandboxRoot);

const [loader, engine] = await Promise.all([
  import('../utils/damage/loader.js'),
  import('../utils/damage/engine.js')
]);

const { loadCharacterModule, loadPhantomModule, loadWeaponModule } = loader;
const { calcDamage } = engine;

function makeFixture(chainCount = 0) {
  return {
    level: 90,
    role: { roleId: 'qingxiao', roleName: '清宵', level: 90 },
    roleAttributeList: [
      { attributeName: '攻击', attributeValue: '2000' },
      { attributeName: '生命', attributeValue: '10000' },
      { attributeName: '防御', attributeValue: '1000' },
      { attributeName: '暴击', attributeValue: '80%' },
      { attributeName: '暴击伤害', attributeValue: '200%' },
      { attributeName: '气动伤害加成', attributeValue: '0%' },
      { attributeName: '普攻伤害加成', attributeValue: '0%' },
      { attributeName: '重击伤害加成', attributeValue: '0%' },
      { attributeName: '共鸣技能伤害加成', attributeValue: '0%' },
      { attributeName: '共鸣解放伤害加成', attributeValue: '0%' }
    ],
    skillList: [
      { skill: { type: '常态攻击' }, level: 10 },
      { skill: { type: '共鸣技能' }, level: 10 },
      { skill: { type: '共鸣回路' }, level: 10 },
      { skill: { type: '共鸣解放' }, level: 10 },
      { skill: { type: '变奏技能' }, level: 10 }
    ],
    chainList: Array.from({ length: 6 }, (_, index) => ({
      unlocked: index < chainCount
    })),
    weaponData: {
      resonLevel: 1,
      weapon: { weaponId: 'yunlang', weaponName: '云琅' }
    },
    phantomData: {
      equipPhantomList: [
        {
          phantomProp: { name: '天傀劫煞' },
          fetterDetail: {}
        }
      ]
    }
  };
}

function makePanel() {
  return {
    roleName: '清宵',
    weaponResonLevel: 1,
    attrMap: {
      气动伤害加成: '0%',
      重击伤害加成: '0%'
    }
  };
}

function itemMap(result) {
  return new Map((result.items || []).map(item => [item.name, item]));
}

test('production loader loads 清宵, 云琅 and 天傀劫煞 modules', async () => {
  const character = await loadCharacterModule('清宵');
  const weapon = await loadWeaponModule('云琅');
  const phantom = await loadPhantomModule('天傀劫煞');

  assert.equal(character.name, '清宵');
  assert.equal(weapon.name, '云琅');
  assert.equal(phantom.name, '天傀劫煞');
  assert.equal(typeof character.calc, 'function');
  assert.equal(typeof weapon.apply, 'function');
  assert.equal(typeof phantom.apply, 'function');
});

test('清宵 returns no more than four damage items ranked by expected damage', async () => {
  const result = await calcDamage(makeFixture(), { enemyName: '无妄者' });

  assert.ok(Array.isArray(result.items));
  assert.ok(result.items.length <= 4);
  for (let index = 1; index < result.items.length; index += 1) {
    assert.ok(result.items[index - 1].expected >= result.items[index].expected);
  }
});

test('云琅 applies its base attack, stacked 气动 damage and max-stack defense ignore', async () => {
  const weapon = await loadWeaponModule('云琅');
  const active = weapon.apply({
    panel: makePanel(),
    skillType: 'heavy',
    options: { yunlangEffectActive: true, yunlangStacks: 5 }
  });
  const inactive = weapon.apply({
    panel: makePanel(),
    skillType: 'heavy',
    options: { yunlangEffectActive: false, yunlangStacks: 5 }
  });

  assert.equal(active.attackPercent, 0.12);
  assert.equal(active.damageBonus, 0.56);
  assert.equal(active.ignoreDefense, 0.10);
  assert.equal(inactive.attackPercent, 0.12);
  assert.equal(inactive.damageBonus, 0);
  assert.equal(inactive.ignoreDefense || 0, 0);
});

test('天傀劫煞 applies both首位 and集谐偏移气动 damage bonuses', async () => {
  const phantom = await loadPhantomModule('天傀劫煞');
  const skill = phantom.getSkill({ options: { tiankuiJieshaRarity: 5 } });
  const active = phantom.apply({
    panel: makePanel(),
    skillType: 'heavy',
    options: {
      tiankuiJieshaEffectActive: true,
      tiankuiJieshaTargetMarked: true
    }
  });
  const firstSlotOnly = phantom.apply({
    panel: makePanel(),
    skillType: 'heavy',
    options: {
      tiankuiJieshaEffectActive: true,
      tiankuiJieshaTargetMarked: false
    }
  });

  assert.equal(skill.type, 'phantom');
  assert.equal(skill.skillMultiplier, 4.05);
  assert.equal(active.damageBonus, 0.20);
  assert.equal(firstSlotOnly.damageBonus, 0.10);
});

test('清宵 six-chain calculation changes a shared skill result', async () => {
  const zeroChain = itemMap(await calcDamage(makeFixture(0), { enemyName: '无妄者' }));
  const sixChain = itemMap(await calcDamage(makeFixture(6), { enemyName: '无妄者' }));
  const sharedNames = [...zeroChain.keys()].filter(name => sixChain.has(name));

  assert.ok(sharedNames.length > 0);
  assert.ok(sharedNames.some(name => sixChain.get(name).expected > zeroChain.get(name).expected));
});

test('equipment activation changes 清宵 damage and disabled states remove dynamic bonuses', async () => {
  const active = await calcDamage(makeFixture(), {
    enemyName: '无妄者',
    yunlangEffectActive: true,
    yunlangStacks: 5,
    tiankuiJieshaEffectActive: true,
    tiankuiJieshaTargetMarked: true
  });
  const inactive = await calcDamage(makeFixture(), {
    enemyName: '无妄者',
    yunlangEffectActive: false,
    yunlangStacks: 0,
    tiankuiJieshaEffectActive: false,
    tiankuiJieshaTargetMarked: false
  });

  assert.ok(active.items[0].expected > inactive.items[0].expected);
});
