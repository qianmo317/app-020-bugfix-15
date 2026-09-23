/**
 * 设施编号与基础工具：编号规则「[楼栋-]楼层-类型-序号」（如 A-3F-EX-01），
 * 生成时查重取最大序号 +1；删中间一台再加不撞号；不同楼栋前缀隔离
 */
import { describe, it, expect } from 'vitest';
import { floorLabel, nextCode, buildFacilityCode, splitFacilityCode, normalizeFacilityCodes, sanitizeBuildingCode } from '../src/store/id';
import { FACILITY_CODES } from '../src/model';
import type { Building, Facility, FacilityKind, Floor } from '../src/model';

function kindOfCode(code: string): FacilityKind {
  const token = code.split('-').slice(-2, -1)[0];
  return (Object.entries(FACILITY_CODES).find(([, t]) => t === token)?.[0] ?? 'extinguisher') as FacilityKind;
}

function floorWithCodes(level: number, codes: string[]): Floor {
  const facilities: Facility[] = codes.map((code) => ({
    id: code,
    kind: kindOfCode(code),
    x: 0,
    y: 0,
    code,
    checks: [],
  }));
  return {
    id: 'f1',
    buildingId: 'b1',
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

describe('nextCode（编号查重）', () => {
  it('I2 空楼层从 01 开始：1F-EX-01', () => {
    expect(nextCode(floorWithCodes(1, []), 'extinguisher')).toBe('1F-EX-01');
  });

  it('I3 已有 01/03 → 取最大序号 +1 得 04（允许中间断号）', () => {
    const f = floorWithCodes(1, ['1F-EX-01', '1F-EX-03']);
    expect(nextCode(f, 'extinguisher')).toBe('1F-EX-04');
  });

  it('I4 类型前缀互不干扰，地下楼层前缀正确', () => {
    const f = floorWithCodes(-1, ['1F-EX-02']);
    expect(nextCode(f, 'extinguisher')).toBe('B1-EX-01');
    expect(nextCode(f, 'hydrant')).toBe('B1-HY-01');
  });

  it('I5 出口类型 EXIT 前缀与 3F 楼层', () => {
    const f = floorWithCodes(3, ['3F-EXIT-01', '3F-EX-05']);
    expect(nextCode(f, 'exit')).toBe('3F-EXIT-02');
    expect(nextCode(f, 'extinguisher')).toBe('3F-EX-06');
  });

  it('I6 非数字序号不参与查重', () => {
    const f = floorWithCodes(1, ['1F-EX-AB']);
    expect(nextCode(f, 'extinguisher')).toBe('1F-EX-01');
  });

  it('I7 删中间一台再加不撞号（原 bug：按数量+1 → 与剩余编号撞号）', () => {
    // 01/02/03 删掉中间的 02，剩余 01/03；旧逻辑数量+1 得到 02，恰好与谁都不撞；
    // 继续再加一台：旧逻辑仍给 02 → 与上一次新增的 02 同号。正确行为始终取最大+1。
    let f = floorWithCodes(1, ['1F-EX-01', '1F-EX-03']);
    const add = () => {
      const code = nextCode(f, 'extinguisher');
      f = floorWithCodes(1, [...f.facilities.map((x) => x.code), code]);
      return code;
    };
    expect(add()).toBe('1F-EX-04');
    expect(add()).toBe('1F-EX-05');
    expect(add()).toBe('1F-EX-06');
  });

  it('I8 同层两台灭火器编号绝不相同（连放多台）', () => {
    const f = floorWithCodes(1, []);
    const codes = new Set<string>();
    for (let i = 0; i < 5; i++) {
      const code = nextCode(f, 'extinguisher');
      expect(codes.has(code)).toBe(false);
      codes.add(code);
      f.facilities.push({ id: code, kind: 'extinguisher', x: 0, y: 0, code, checks: [] });
    }
    expect([...codes].sort()).toEqual(['1F-EX-01', '1F-EX-02', '1F-EX-03', '1F-EX-04', '1F-EX-05']);
  });
});

describe('楼栋前缀', () => {
  it('I9 楼栋编号参与前缀：A 楼 3 层灭火器 → A-3F-EX-01', () => {
    const f = floorWithCodes(3, []);
    expect(nextCode(f, 'extinguisher', 'A')).toBe('A-3F-EX-01');
    expect(buildFacilityCode('B', -1, 'hydrant', 12)).toBe('B-B1-HY-12');
  });

  it('I10 两栋楼同一层同一类型编号互不撞号（原 bug：前缀没跟楼栋走）', () => {
    const f1 = floorWithCodes(1, []);
    f1.buildingId = 'bA';
    const f2 = floorWithCodes(1, []);
    f2.buildingId = 'bB';
    expect(nextCode(f1, 'extinguisher', 'A')).toBe('A-1F-EX-01');
    expect(nextCode(f2, 'extinguisher', 'B')).toBe('B-1F-EX-01');
  });

  it('I11 已有编号沿用旧前缀时，换楼栋前缀后新编号以新前缀查重，不复用旧号', () => {
    // 从 A 楼带来的 A-1F-EX-05；楼栋改成 C 后，C-1F-EX-* 尚为空 → C-1F-EX-01
    const f = floorWithCodes(1, ['A-1F-EX-05']);
    expect(nextCode(f, 'extinguisher', 'C')).toBe('C-1F-EX-01');
    const f2 = floorWithCodes(1, ['A-1F-EX-01', 'A-1F-EX-02']);
    f2.facilities.push({ id: 'x', kind: 'hydrant', x: 0, y: 0, code: 'A-1F-HY-01', checks: [] });
    // A-1F-EX-02 已存在 → 同前缀续号 03；HY 类型独立计数
    expect(nextCode(f2, 'extinguisher', 'A')).toBe('A-1F-EX-03');
    expect(nextCode(f2, 'hydrant', 'A')).toBe('A-1F-HY-02');
  });

  it('I12 楼栋编号清洗：去空白/连字符、只留字母数字并转大写', () => {
    expect(sanitizeBuildingCode(' a-1 ')).toBe('A1');
    expect(sanitizeBuildingCode('甲乙')).toBe('');
  });
});

function mkBuilding(id: string, code: string, floorIds: string[]): Building {
  return { id, name: id, code, kind: 'office', floors: floorIds, createdAt: '' };
}

describe('normalizeFacilityCodes（加载/改楼栋编号时归一化）', () => {
  it('I13 旧数据裸类型编号（EX-01 等）按层归一化为 1F-EX-01', () => {
    const mk = (kind: FacilityKind, code: string): Facility => ({ id: code, kind, x: 0, y: 0, code, checks: [] });
    const f: Floor = {
      id: 'f1', buildingId: 'b1', level: 1, scaleMmPerUnit: 1, rooms: [],
      facilities: [mk('extinguisher', 'EX-01'), mk('exit', 'EXIT-01'), mk('extinguisher', 'EX-02')],
      exits: [], version: 0,
    };
    normalizeFacilityCodes({ f1: f }, [mkBuilding('b1', '', ['f1'])]);
    expect(f.facilities.map((x) => x.code).sort()).toEqual(['1F-EX-01', '1F-EX-02', '1F-EXIT-01']);
  });

  it('I14 楼栋编号设为 A：全部设施编号重写为带 A 前缀（改楼栋后前缀跟随）', () => {
    const f = floorWithCodes(2, ['2F-EX-01', '2F-HY-01']);
    normalizeFacilityCodes({ f1: f }, [mkBuilding('b1', 'A', ['f1'])]);
    expect(f.facilities.map((x) => x.code).sort()).toEqual(['A-2F-EX-01', 'A-2F-HY-01']);
  });

  it('I15 同层重号（删中间再加产生的撞号）归一化后逐条唯一，与图上设施一一对应', () => {
    const f = floorWithCodes(1, ['1F-EX-01', '1F-EX-02', '1F-EX-02']);
    normalizeFacilityCodes({ f1: f }, [mkBuilding('b1', '', ['f1'])]);
    const codes = f.facilities.map((x) => x.code);
    expect(new Set(codes).size).toBe(codes.length);
    expect(codes.sort()).toEqual(['1F-EX-01', '1F-EX-02', '1F-EX-03']);
  });

  it('I16 splitFacilityCode 能识别楼栋前缀与 EXIT 类型', () => {
    expect(splitFacilityCode('A-B1-EXIT-02')).toEqual({ kind: 'exit', seqText: '02' });
    expect(splitFacilityCode('3F-EX-05')).toEqual({ kind: 'extinguisher', seqText: '05' });
    expect(splitFacilityCode('EX-AB')).toBeNull();
  });
});
