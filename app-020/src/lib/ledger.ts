import type { Building, FacilityKind, Floor } from '../model';
import { checkDueInfo } from './engine';
import { floorLabel } from '../store/id';
import { pointInPoly } from './geometry';

export type LedgerFilter = 'all' | FacilityKind;

export type LedgerRow = {
  buildingId: string;
  buildingName: string;
  floorId: string;
  floorLabel: string;
  facilityId: string;
  roomId?: string;
  roomName: string;
  code: string;
  kind: FacilityKind;
  x: number;
  y: number;
  lastDate: string | null;
  lastStatus: string | null;
  dueDate: string | null;
  overdue: boolean;
  missing: boolean;
  defect: boolean;
};

/**
 * 全楼台账：逐条遍历「建筑 → 其名下楼层 → 该层实际设施」，
 * 因此台账每一行都对应图上真实存在的设施（点「查看」必能定位到），
 * 图上每台设施也必然产生一行 —— 两边逐条对得上。
 */
export function buildLedger(
  buildings: Building[],
  floors: Record<string, Floor>,
  opts: { kind: LedgerFilter; onlyOverdue: boolean; now: number },
): LedgerRow[] {
  const out: LedgerRow[] = [];
  for (const b of buildings) {
    for (const fid of b.floors) {
      const f = floors[fid];
      if (!f) continue; // 数据残缺的楼层不产生任何台账行
      for (const fac of f.facilities) {
        // 类型筛选：只保留选中的类型（原实现条件写反，筛出的全是别的类型 → 对不上图）
        if (opts.kind !== 'all' && fac.kind !== opts.kind) continue;
        const room = f.rooms.find((r) => pointInPoly({ x: fac.x, y: fac.y }, r.polygon));
        const info = checkDueInfo(fac, opts.now);
        if (opts.onlyOverdue && !(info.overdue || info.missing || info.defect)) continue;
        const sorted = [...fac.checks].sort((a, b2) => b2.date.localeCompare(a.date));
        out.push({
          buildingId: b.id,
          buildingName: b.name,
          floorId: f.id,
          floorLabel: floorLabel(f.level),
          facilityId: fac.id,
          roomId: room?.id,
          roomName: room?.name ?? '—',
          code: fac.code,
          kind: fac.kind,
          x: fac.x,
          y: fac.y,
          lastDate: sorted[0]?.date ?? null,
          lastStatus: sorted[0]?.status ?? null,
          dueDate: info.dueDate,
          overdue: info.overdue,
          missing: info.missing,
          defect: info.defect,
        });
      }
    }
  }
  // 按下次应检日期排序（过期/无记录排最前）
  out.sort((a, b2) => (a.dueDate ?? '0').localeCompare(b2.dueDate ?? '0'));
  return out;
}
