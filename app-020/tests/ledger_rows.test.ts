/**
 * 全楼台账验收用例：
 * - 按类型筛选的条数必须与图上实摆一致（原 bug：过滤条件取反，选什么类型反而少什么类型、
 *   台账多出其它类型的行，点「查看」落到的楼层上找不到对应设施）；
 * - 每条台账行都能按 floorId + facility id 定位到真实设施（无悬空行）；
 * - 悬空楼层引用不出现在台账。
 */
import { describe, it, expect } from 'vitest';
import { buildLedgerRows } from '../src/lib/ledger';
import type { Building, Facility, FacilityKind, Floor } from '../src/model';

const DAY = 86400000;
const dateStr = (daysAgo: number) => new Date(Date.now() - daysAgo * DAY).toISOString().slice(0, 10);

let seq = 0;
function fac(kind: FacilityKind, code: string, checks: Facility['checks'] = []): Facility {
  return { id: `fac${seq++}`, kind, x: 0, y: 0, code, checks };
}

function floor(id: string, buildingId: string, level: number, facilities: Facility[]): Floor {
  return {
    id,
    buildingId,
    level,
    scaleMmPerUnit: 1,
    rooms: [],
    facilities,
    exits: facilities.filter((f) => f.kind === 'exit').map((f) => f.id),
    version: 0,
  };
}

function building(id: string, code: string, floorIds: string[]): Building {
  return { id, name: `楼${id}`, code, kind: 'office', floors: floorIds, createdAt: '' };
}

describe('buildLedgerRows（台账与图上实物逐条对账）', () => {
  it('G1 按类型筛选：行数 == 图上该类型台数，且每行都是该类型（原过滤取反 bug 回归）', () => {
    const f1 = floor('f1', 'b1', 1, [
      fac('extinguisher', 'A-1F-EX-01'),
      fac('extinguisher', 'A-1F-EX-02'),
      fac('hydrant', 'A-1F-HY-01'),
      fac('exit', 'A-1F-EXIT-01'),
    ]);
    const floors = { f1 };
    const buildings = [building('b1', 'A', ['f1'])];
    const ext = buildLedgerRows(buildings, floors, { kind: 'extinguisher' });
    expect(ext.length).toBe(2); // 图上就两台灭火器
    expect(ext.every((r) => r.kind === 'extinguisher')).toBe(true); // 不混入其它类型
    expect(ext.map((r) => r.code).sort()).toEqual(['A-1F-EX-01', 'A-1F-EX-02']);
    expect(buildLedgerRows(buildings, floors, { kind: 'hydrant' }).length).toBe(1);
    expect(buildLedgerRows(buildings, floors, { kind: 'all' }).length).toBe(4);
  });

  it('G2 每行都能定位到图上真实设施：floorId 属于该楼栋且 id 在楼层设施列表中', () => {
    const fa = floor('fa', 'bA', 1, [fac('extinguisher', 'A-1F-EX-01')]);
    const fb = floor('fb', 'bB', 1, [fac('extinguisher', 'B-1F-EX-01'), fac('exit', 'B-1F-EXIT-01')]);
    const floors: Record<string, Floor> = { fa, fb };
    const buildings = [building('bA', 'A', ['fa']), building('bB', 'B', ['fb'])];
    const rows = buildLedgerRows(buildings, floors, { kind: 'extinguisher' });
    expect(rows.length).toBe(2);
    for (const r of rows) {
      const b = buildings.find((x) => x.id === r.buildingId)!;
      expect(b.floors).toContain(r.floorId); // 楼栋里确实有这层
      const f = floors[r.floorId];
      expect(f.facilities.some((x) => x.id === r.id)).toBe(true); // 层里确实有这台设施
    }
  });

  it('G3 悬空楼层引用（楼层已删但 building.floors 残留）不产生台账行', () => {
    const buildings = [building('b1', 'A', ['gone'])];
    expect(buildLedgerRows(buildings, {}, { kind: 'all' })).toEqual([]);
  });

  it('G4 跨楼栋跨楼层汇总 + 只看待整改口径与图上一致', () => {
    const f1 = floor('f1', 'b1', 1, [
      fac('extinguisher', 'A-1F-EX-01', [{ date: dateStr(45), status: 'ok' }]), // 过期
      fac('extinguisher', 'A-1F-EX-02', [{ date: dateStr(1), status: 'ok' }]),
    ]);
    const f2 = floor('f2', 'b2', 2, [fac('extinguisher', 'B-2F-EX-01')]); // 无记录 → missing
    const floors = { f1, f2 };
    const buildings = [building('b1', 'A', ['f1']), building('b2', 'B', ['f2'])];
    const all = buildLedgerRows(buildings, floors);
    expect(all.length).toBe(3);
    const todo = buildLedgerRows(buildings, floors, { onlyOverdue: true });
    expect(todo.length).toBe(2);
    expect(todo.every((r) => r.overdue || r.missing || r.defect)).toBe(true);
  });
});
