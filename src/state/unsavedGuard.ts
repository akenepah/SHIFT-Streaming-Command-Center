/**
 * Pages with an unsaved form (League Settings) register it here, so actions that replace the page's data
 * (switching teams, adding a team) ask before discarding edits.
 */
let unsaved = false;

export function setUnsavedEdits(value: boolean) {
  unsaved = value;
}

export function confirmDiscardUnsaved(): boolean {
  return !unsaved || (typeof window !== "undefined" && window.confirm("Discard unsaved settings?"));
}
