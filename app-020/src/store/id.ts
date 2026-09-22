import { FACILITY_CODES, type Facility, type FacilityKind, type Floor } from '../model';

let seq = 0;
export function uid(): string {
  return `id_${Date.now().toString(36)}_${(seq++).toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

export function floorLabel(level: number): string {
  return level >= 1 ? `${level}F` : `B${-level}`;
}

/** 设施编号：类型-序号（如 EX-01） */
export function nextCode(floor: Floor, kind: FacilityKind): string {
  const prefix = `${FACILITY_CODES[kind]}-`;
  const used = floor.facilities.filter((f) => f.code.startsWith(prefix)).length;
  return `${prefix}${String(used + 1).padStart(2, '0')}`;
}

export function facilityBelongs(f: Facility, kind: FacilityKind): boolean {
  return f.kind === kind;
}
