/**
 * 设施编号与基础工具：
 * 编号规则「楼栋-楼层-类型-序号」（如 A-3F-EX-01），同楼栋同楼层同类型唯一；
 * 生成时解析已有编号取最大序号 +1（删中间一台再补不撞号），换楼栋时整层重编号。
 */
import { describe, it, expect } from 'vitest';
import { buildingCode, codesHealthy, floorLabel, formatCode, nextCode, nextSeq, renumberFloor } from '../src/store/id';
import type { Facility, FacilityKind, Floor } from '../src/model';

function floorWithCodes(level: number, codes: string[], buildingId = 'b1'): Floor {
  const facilities: Facility[] = codes.map((code) => ({
    id: code,
    kind: 'extinguisher',
    x: 0,
    y: 0,
    code,
    checks: [],
  }));
  return {
    id: 'f1',
    buildingId,
    level,
    scaleMmPerUnit: 1,
    rooms: [],
    facilities,
    exits: [],
    version: 0,
  };
}

describe('floorLabel', () => {
  it('I1 楼层标签：地上 nF，地下 Bn', () => {
    expect(floorLabel(1)).toBe('1F');
    expect(floorLabel(3)).toBe('3F');
    expect(floorLabel(-1)).toBe('B1');
    expect(floorLabel(-2)).toBe('B2');
  });
});

describe('buildingCode', () => {
  it('楼栋字母码：A、B…Z、AA 进位', () => {
    expect(buildingCode(0)).toBe('A');
    expect(buildingCode(1)).toBe('B');
    expect(buildingCode(25)).toBe('Z');
    expect(buildingCode(26)).toBe('AA');
  });
});

describe('nextCode（编号查重，带楼栋前缀）', () => {
  it('I2 空楼层从 01 开始：A-1F-EX-01', () => {
    expect(nextCode(floorWithCodes(1, []), 'extinguisher', 'A')).toBe('A-1F-EX-01');
  });

  it('I3 已有 01/03 → 取最大序号 +1 得 04（删中间一台后再补，不与剩余的 03 撞号）', () => {
    const f = floorWithCodes(1, ['A-1F-EX-01', 'A-1F-EX-03']);
    expect(nextSeq(f, 'extinguisher', 'A')).toBe(4);
    expect(nextCode(f, 'extinguisher', 'A')).toBe('A-1F-EX-04');
  });

  it('I3b 删除中间一台（剩 01/03）再连加两台：04、05，始终不撞号', () => {
    const f = floorWithCodes(1, ['A-1F-EX-01', 'A-1F-EX-03']);
    f.facilities.push({ id: 'n1', kind: 'extinguisher', x: 0, y: 0, code: nextCode(f, 'extinguisher', 'A'), checks: [] });
    expect(f.facilities[2].code).toBe('A-1F-EX-04');
    f.facilities.push({ id: 'n2', kind: 'extinguisher', x: 0, y: 0, code: nextCode(f, 'extinguisher', 'A'), checks: [] });
    expect(f.facilities[3].code).toBe('A-1F-EX-05');
    expect(new Set(f.facilities.map((x) => x.code)).size).toBe(f.facilities.length);
  });

  it('I4 类型前缀互不干扰，地下楼层前缀正确', () => {
    const f = floorWithCodes(-1, ['A-1F-EX-02']);
    expect(nextCode(f, 'extinguisher', 'A')).toBe('A-B1-EX-01');
    expect(nextCode(f, 'hydrant', 'A')).toBe('A-B1-HY-01');
  });

  it('I4b 不同楼栋同层：前缀隔离，序号各自从 01 起（两栋楼不会编到同一段号）', () => {
    const a = floorWithCodes(1, ['A-1F-EX-01'], 'bA');
    const b = floorWithCodes(1, ['A-1F-EX-01'], 'bB'); // 历史脏数据：B 栋误用了 A 前缀
    expect(nextCode(a, 'extinguisher', 'A')).toBe('A-1F-EX-02');
    expect(nextCode(b, 'extinguisher', 'B')).toBe('B-1F-EX-01'); // B 栋编号不读 A 前缀的序号
  });

  it('I5 出口类型 EXIT 前缀与 3F 楼层（EX 不误匹配 EXIT）', () => {
    const f = floorWithCodes(3, ['A-3F-EXIT-01', 'A-3F-EX-05']);
    expect(nextCode(f, 'exit', 'A')).toBe('A-3F-EXIT-02');
    expect(nextCode(f, 'extinguisher', 'A')).toBe('A-3F-EX-06');
  });

  it('I6 非数字序号不参与查重', () => {
    const f = floorWithCodes(1, ['A-1F-EX-AB']);
    expect(nextCode(f, 'extinguisher', 'A')).toBe('A-1F-EX-01');
  });
});

describe('renumberFloor / codesHealthy（换楼栋与旧数据迁移）', () => {
  it('R1 整层重新编号：按类型分组连续编号，统一加楼栋前缀', () => {
    const f = floorWithCodes(1, ['OLD-EX-07', '1F-EX-02']);
    f.facilities.push({ id: 'h1', kind: 'hydrant', x: 0, y: 0, code: 'HY-9', checks: [] });
    const m = renumberFloor(f, 'B');
    expect(m.facilities.map((x) => x.code)).toEqual(['B-1F-EX-01', 'B-1F-EX-02', 'B-1F-HY-01']);
  });

  it('R2 换楼栋后前缀整体更换（A-1F-* → B-1F-*），撞号一并修复', () => {
    const f = floorWithCodes(1, ['A-1F-EX-01', 'A-1F-EX-01']); // 同号两台
    expect(codesHealthy(f, 'B')).toBe(false);
    const m = renumberFloor(f, 'B');
    expect(m.facilities.map((x) => x.code)).toEqual(['B-1F-EX-01', 'B-1F-EX-02']);
    expect(codesHealthy(m, 'B')).toBe(true);
  });

  it('R3 编号与楼栋/层号一致且无重号时判定健康', () => {
    const ok = floorWithCodes(-2, ['C-B2-EX-01', 'C-B2-EX-02']);
    expect(codesHealthy(ok, 'C')).toBe(true);
    expect(codesHealthy(ok, 'A')).toBe(false); // 楼栋码不符
    const dup = floorWithCodes(-2, ['C-B2-EX-01', 'C-B2-EX-01']);
    expect(codesHealthy(dup, 'C')).toBe(false);
  });

  it('R4 formatCode 各类型拼装正确', () => {
    expect(formatCode('A', 3, 'exit_sign', 12)).toBe('A-3F-ES-12');
    expect(formatCode('B', -1, 'sprinkler', 1)).toBe('B-B1-SP-01');
  });

  it('R5 层内唯一性：任意类型混合编号互不撞号', () => {
    const kinds: FacilityKind[] = ['extinguisher', 'hydrant', 'exit_sign', 'emergency_light', 'exit', 'sprinkler'];
    const f = floorWithCodes(2, []);
    for (const k of kinds) {
      for (let i = 0; i < 3; i++) {
        f.facilities.push({ id: `${k}${i}`, kind: k, x: 0, y: 0, code: nextCode(f, k, 'A'), checks: [] });
      }
    }
    const codes = f.facilities.map((x) => x.code);
    expect(new Set(codes).size).toBe(codes.length);
  });
});
