import { expect, it } from "vitest";
import { quickEntryCandidate } from "./quickEntry";
import { player } from "../testing/fixtures";
const p = player("one", "EDM", "C");
it("allows Enter for one available search result", () => expect(quickEntryCandidate("one", [p], () => false)).toBe(p));
it("never picks arbitrarily among namesakes", () => expect(quickEntryCandidate("one", [p, { ...p, id: "two" }], () => false)).toBeNull());
it("cannot re-add the previous player after the search clears", () => expect(quickEntryCandidate("", [p], () => false)).toBeNull());
it("cannot add an already rostered result twice", () => expect(quickEntryCandidate("one", [p], () => true)).toBeNull());
it("does nothing for an unmatched search", () => expect(quickEntryCandidate("unknown", [], () => false)).toBeNull());
