import { activeSlotCount } from "./config";
import { SLOT_TYPES, type LeagueSettings } from "./types";

export function validateSettings(s: LeagueSettings): string[] {
  const errors: string[] = [];
  const whole = (n: number, min: number, max: number) => Number.isInteger(n) && n >= min && n <= max;
  if (!s.leagueName.trim()) errors.push("Enter a league name.");
  if (!s.teamName.trim()) errors.push("Enter a team name.");
  for (const t of SLOT_TYPES) {
    if (!whole(s.roster.slots[t], 0, 10)) errors.push(`${t} slots must be a whole number from 0 to 10.`);
  }
  if (activeSlotCount(s.roster) === 0) errors.push("Add at least one active lineup slot.");
  if (!whole(s.roster.benchSlots, 0, 20)) errors.push("Bench slots must be a whole number from 0 to 20.");
  if (!whole(s.roster.irPlusSlots, 0, 10)) errors.push("IR+ slots must be a whole number from 0 to 10.");
  if (!whole(s.weeklyAcquisitionLimit, 0, 50)) errors.push("Weekly acquisition limit must be a whole number from 0 to 50.");
  if (!whole(s.weekStartsOn, 0, 6)) errors.push("Choose the day acquisitions reset.");
  if (!whole(s.minGoalieAppearances, 0, 14)) errors.push("Minimum goalie appearances must be a whole number from 0 to 14.");
  return errors;
}
