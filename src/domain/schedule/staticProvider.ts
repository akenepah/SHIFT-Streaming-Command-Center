import dataset from "@/data/nhl/2026-27.json";
import { InMemoryScheduleProvider, type ScheduleProvider } from "./provider";
import type { ScheduleDataset } from "./validate";

export const SCHEDULE_DATASET = dataset as unknown as ScheduleDataset;
export const SCHEDULE_META = SCHEDULE_DATASET.meta;

/** Schedule provider backed by the bundled 2026–27 dataset. No network access. */
export class StaticScheduleProvider extends InMemoryScheduleProvider implements ScheduleProvider {
  constructor(data: ScheduleDataset = SCHEDULE_DATASET) {
    super(data.games);
  }
}

let instance: StaticScheduleProvider | null = null;

/** Shared app-wide provider. The dataset is indexed once. */
export function getScheduleProvider(): ScheduleProvider {
  instance ??= new StaticScheduleProvider();
  return instance;
}
