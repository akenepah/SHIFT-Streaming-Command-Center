"use client";

import { useMemo } from "react";
import { generateWeek, type WeekInput, type WeekPlan } from "@/domain/lineup/generateWeek";
import { getScheduleProvider } from "@/domain/schedule/staticProvider";
import type { ISODate } from "@/domain/types";
import { useStore } from "./store";

/** Everything the planner engine needs for a week, from app state. */
export function useWeekInput(weekStart: ISODate): WeekInput {
  const { state } = useStore();
  return useMemo(
    () => ({
      weekStart,
      roster: state.roster,
      players: state.players,
      scheduleProvider: getScheduleProvider(),
      rosterConfiguration: state.settings.roster,
      plannedTransactions: state.transactions,
      overrides: state.overrides,
    }),
    [weekStart, state.roster, state.players, state.settings.roster, state.transactions, state.overrides],
  );
}

export function useWeekPlan(weekStart: ISODate): { input: WeekInput; plan: WeekPlan } {
  const input = useWeekInput(weekStart);
  const plan = useMemo(() => generateWeek(input), [input]);
  return { input, plan };
}
