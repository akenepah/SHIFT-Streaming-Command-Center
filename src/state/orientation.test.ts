import { expect, it } from "vitest";
import { orientationDismissed, orientationKey } from "./orientation";
it("shows orientation on first visit", () => expect(orientationDismissed(null)).toBe(false));
it("retains this browser's dismissal while offline", () => expect(orientationDismissed("dismissed")).toBe(true));
it("honors an account dismissal after clearing browser storage", () => expect(orientationDismissed(null, { shiftPlannerOrientationDismissed: true })).toBe(true));
it("isolates local and different account preferences", () => expect(new Set([orientationKey(), orientationKey("a"), orientationKey("b")]).size).toBe(3));
it("does not interpret malformed preference values as a dismissal", () => expect(orientationDismissed("false", { shiftPlannerOrientationDismissed: "true" })).toBe(false));
