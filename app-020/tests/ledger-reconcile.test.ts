/**
 * 台账与图上设施逐条对账：
 * - 按类型筛选条数 = 图上该类型设施实际数量（原 bug：筛选条件写反）
 * - 每行都能定位到真实存在的楼层与设施（原 bug：多出的条目点进去找不到）
 */
import { describe, it, expect } from 'vitest';
import { buildLedger } from '../src/lib/ledger';
import type { Building, Facility, FacilityKind, Floor } from '../src/model';

let n = 0;
function fac(kind: FacilityKind, code: string): Facility {
  return { id: `fac${n++}`, kind, x: 1000, y: 1000, code, checks: [] };
}

function mkBuildingFloors(): { buildings: Building[]; floors: Record<string, Floor> } {
  const mk = (bid: string, name: string, level: number, facs: Facility[]): [Building, string, Floor] => {
    const fid = `floor_${bid}_${level}`;
    return [
      { id: bid, name, kind: 'office', floors: [fid], createdAt: '' },
      fid,
      { id: fid, buildingId: bid, level, scaleMmPerUnit: 1, rooms: [], facilities: facs, exits: [], version: 0 },
    ];
  };
  const [b1, f1, fl1] = mk('b1', 'A栋', 1, [
    fac('extinguisher', 'A-1F-EX-01'),
    fac('extinguisher', 'A-1F-EX-02'),
    fac('hydrant', 'A-1F-HY-01'),
  ]);
  const [b2, f2, fl2] = mk('b2', 'B栋', 1, [
    fac('extinguisher', 'B-1F-EX-01'),
    fac('exit', 'B-1F-EXIT-01'),
  ]);
  return { buildings: [b1, b2], floors: { [f1]: fl1, [f2]: fl2 } };
}

describe('buildLedger（台账与图纸对账）', () => {
  it('LD1 全部类型：台账条数与图上设施总数逐条相等，每行都能定位到真实设施', () => {
    const { buildings, floors } = mkBuildingFloors();
    const rows = buildLedger(buildings, floors, { kind: 'all', onlyOverdue: false, now: Date.now() });
    const total = buildings.reduce((s, b) => s + b.floors.reduce((s2, fid) => s2 + floors[fid].facilities.length, 0), 0);
    expect(rows.length).toBe(total);
    for (const r of rows) {
      const floor = floors[r.floorId];
      expect(floor).toBeDefined(); // 点进去的楼层必须存在
      expect(floor.facilities.some((x) => x.id === r.facilityId)).toBe(true); // 必须定位到具体设施
    }
  });

  it('LD2 按灭火器筛选：只返回灭火器，条数 = 图上灭火器数 3（原 bug 条件写反，返回的全是非灭火器）', () => {
    const { buildings, floors } = mkBuildingFloors();
    const rows = buildLedger(buildings, floors, { kind: 'extinguisher', onlyOverdue: false, now: Date.now() });
    expect(rows.length).toBe(3);
    expect(rows.every((r) => r.kind === 'extinguisher')).toBe(true);
    expect(rows.map((r) => r.code).sort()).toEqual(['A-1F-EX-01', 'A-1F-EX-02', 'B-1F-EX-01']);
  });

  it('LD3 按消火栓/出口筛选各自独立计数，跨楼栋不漏不重', () => {
    const { buildings, floors } = mkBuildingFloors();
    expect(buildLedger(buildings, floors, { kind: 'hydrant', onlyOverdue: false, now: 0 }).length).toBe(1);
    expect(buildLedger(buildings, floors, { kind: 'exit', onlyOverdue: false, now: 0 }).length).toBe(1);
    expect(buildLedger(buildings, floors, { kind: 'sprinkler', onlyOverdue: false, now: 0 }).length).toBe(0);
  });

  it('LD4 建筑名下引用了已不存在的楼层（脏数据）：不产生任何台账幽灵行', () => {
    const { buildings, floors } = mkBuildingFloors();
    buildings[0].floors.push('ghost_floor'); // 楼层记录已丢但引用还在
    const rows = buildLedger(buildings, floors, { kind: 'all', onlyOverdue: false, now: 0 });
    expect(rows.length).toBe(5); // 没有多出来的行
    expect(rows.every((r) => floors[r.floorId])).toBe(true);
  });
});
