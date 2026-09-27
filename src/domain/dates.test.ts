import { describe, expect, it } from "vitest";
import { addDays, dayOfWeek, isValidISODate, startOfWeek, todayISO, weekDates } from "./dates";

describe("dates", () => {
  it("finds the Monday that starts a fantasy week", () => {
    expect(startOfWeek("2026-09-29")).toBe("2026-09-28"); // Tue → Mon
    expect(startOfWeek("2026-09-28")).toBe("2026-09-28"); // Mon stays
    expect(startOfWeek("2026-10-04")).toBe("2026-09-28"); // Sun → previous Mon
  });

  it("supports other week start days", () => {
    expect(startOfWeek("2026-09-29", 0)).toBe("2026-09-27");
  });

  it("navigates weeks across month, year and DST boundaries", () => {
    expect(addDays("2026-09-28", 7)).toBe("2026-10-05");
    expect(addDays("2026-09-28", -7)).toBe("2026-09-21");
    expect(addDays("2026-12-28", 7)).toBe("2027-01-04");
    expect(addDays("2026-10-26", 7)).toBe("2026-11-02"); // across the November DST change
    expect(addDays("2027-03-08", 7)).toBe("2027-03-15"); // across the March DST change
  });

  it("produces seven consecutive dates Monday to Sunday", () => {
    const days = weekDates("2026-09-28");
    expect(days).toEqual([
      "2026-09-28", "2026-09-29", "2026-09-30", "2026-10-01", "2026-10-02", "2026-10-03", "2026-10-04",
    ]);
    expect(days.map(dayOfWeek)).toEqual([1, 2, 3, 4, 5, 6, 0]);
  });

  it("reads today from the local wall clock, not UTC", () => {
    // 11pm local on Sep 29 stays Sep 29 in every time zone.
    expect(todayISO(new Date(2026, 8, 29, 23, 30))).toBe("2026-09-29");
  });

  it("validates date strings", () => {
    expect(isValidISODate("2026-10-13")).toBe(true);
    expect(isValidISODate("2026-02-30")).toBe(false);
    expect(isValidISODate("2026-10-13T00:00")).toBe(false);
    expect(isValidISODate(20261013)).toBe(false);
  });
});
