import type { Building, FacilityKind, Floor } from '../model';
import { checkDueInfo } from './engine';
import { pointInPoly } from './geometry';
import { floorLabel } from '../store/id';

export type LedgerRow = {
  id: string; // 设施稳定 id（台账与图上实物对账的唯一依据）
  floorId: string;
  buildingId: string;
  buildingName: string;
  floorLabel: string;
  code: string;
  kind: FacilityKind;
  x: number;
  y: number;
  roomName: string;
  lastDate: string | null;
  lastStatus: string | null;
  dueDate: string | null;
  overdue: boolean;
  missing: boolean;
  defect: boolean;
};

/**
 * 跨楼栋/跨楼层收集台账行：每一行都对应 floor.facilities 中真实存在的一条设施，
 * 图上能按 floorId + id 定位 —— 台账条数与图上摆放逐条对得上（无悬空行）。
 */
export function buildLedgerRows(
  buildings: Building[],
  floors: Record<string, Floor>,
  opts: { kind?: FacilityKind | 'all'; onlyOverdue?: boolean; now?: number } = {},
): LedgerRow[] {
  const { kind = 'all', onlyOverdue = false, now = Date.now() } = opts;
  const out: LedgerRow[] = [];
  for (const b of buildings) {
    for (const fid of b.floors) {
      const f = floors[fid];
      if (!f) continue; // 楼层已删但引用残留：不出现在台账（避免点进去定位不到）
      for (const fac of f.facilities) {
        if (kind !== 'all' && fac.kind !== kind) continue;
        const info = checkDueInfo(fac, now);
        if (onlyOverdue && !(info.overdue || info.missing || info.defect)) continue;
        const room = f.rooms.find((r) => pointInPoly({ x: fac.x, y: fac.y }, r.polygon));
        const sorted = [...fac.checks].sort((a, c) => c.date.localeCompare(a.date));
        out.push({
          id: fac.id,
          floorId: f.id,
          buildingId: b.id,
          buildingName: b.name,
          floorLabel: floorLabel(f.level),
          code: fac.code,
          kind: fac.kind,
          x: fac.x,
          y: fac.y,
          roomName: room?.name ?? '—',
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
  out.sort((a, c) => (a.dueDate ?? '0').localeCompare(c.dueDate ?? '0'));
  return out;
}
