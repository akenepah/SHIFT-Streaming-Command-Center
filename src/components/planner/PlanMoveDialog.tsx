"use client";

import { AlertTriangle, ArrowLeft, Plus } from "lucide-react";
import { useMemo, useState } from "react";
import { PlayerForm } from "@/components/player/PlayerForm";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { ErrorList, Field, Select } from "@/components/ui/Field";
import { useToast } from "@/components/ui/Toast";
import { addDays, formatDayShort, formatMonthDay, weekDates } from "@/domain/dates";
import type { WeekInput } from "@/domain/lineup/generateWeek";
import { projectRoster } from "@/domain/roster/projectedRoster";
import { emptyPlayerDraft, playerFromDraft, validatePlayerDraft, type PlayerDraft } from "@/domain/roster/playerDraft";
import { evaluateMoveImpact } from "@/domain/transactions/impact";
import { checkDraft, createTransaction, type TransactionDraft } from "@/domain/transactions/transactions";
import type { ISODate, PlannedTransaction, Player, TransactionType } from "@/domain/types";
import { newId } from "@/state/reducer";
import { teamGamesBetween } from "@/state/selectors";
import { useStore } from "@/state/store";

const TYPES: { value: TransactionType; label: string }[] = [
  { value: "ADD_DROP", label: "Add + Drop" },
  { value: "ADD", label: "Add" },
  { value: "DROP", label: "Drop" },
];

function signed(n: number) {
  return n > 0 ? `+${n}` : String(n);
}

/**
 * Plan (or edit) an Add / Drop / Add + Drop. Shows how the move changes the
 * week's games started before saving.
 */
export function PlanMoveDialog({
  open,
  onClose,
  weekInput,
  editing,
  defaultDate,
}: {
  open: boolean;
  onClose: () => void;
  weekInput: WeekInput;
  editing: PlannedTransaction | null;
  defaultDate: ISODate;
}) {
  const { state, dispatch } = useStore();
  const toast = useToast();
  const [draft, setDraft] = useState<TransactionDraft>(() =>
    editing
      ? { type: editing.type, addPlayerId: editing.addPlayerId, dropPlayerId: editing.dropPlayerId, effectiveDate: editing.effectiveDate }
      : { type: "ADD_DROP", effectiveDate: defaultDate },
  );
  const [creating, setCreating] = useState(false);
  const [playerDraft, setPlayerDraft] = useState<PlayerDraft>(emptyPlayerDraft);
  const [playerErrors, setPlayerErrors] = useState<string[]>([]);
  const [showErrors, setShowErrors] = useState(false);

  const weekEnd = addDays(weekInput.weekStart, 6);
  const needsAdd = draft.type !== "DROP";
  const needsDrop = draft.type !== "ADD";
  const others = useMemo(() => state.transactions.filter((t) => t.id !== editing?.id), [state.transactions, editing]);
  const rosterThen = useMemo(
    () => projectRoster(state.roster, others, draft.effectiveDate),
    [state.roster, others, draft.effectiveDate],
  );
  const rosterIds = new Set(rosterThen.map((r) => r.playerId));
  const remaining = (p: Player) =>
    draft.effectiveDate <= weekEnd ? teamGamesBetween(p.nhlTeamId, draft.effectiveDate, weekEnd) : 0;

  const candidateTx = (d: TransactionDraft): PlannedTransaction => ({
    ...createTransaction(d, editing?.id ?? "__preview__"),
    createdAt: editing?.createdAt ?? "9999",
  });
  const baseInput = { ...weekInput, plannedTransactions: others };

  // Candidate adds, ranked by how many games they'd add this week.
  const addOptions = !needsAdd
    ? []
    : Object.values(state.players)
      .filter((p) => !rosterIds.has(p.id))
      .map((p) => {
        const d: TransactionDraft = { ...draft, addPlayerId: p.id, dropPlayerId: needsDrop ? draft.dropPlayerId : undefined };
        const valid = !needsDrop || !!draft.dropPlayerId;
        const delta = valid ? evaluateMoveImpact(baseInput, candidateTx(d)).gamesStartedDelta : null;
        return { player: p, games: remaining(p), delta };
      })
      .sort((a, b) => (b.delta ?? b.games) - (a.delta ?? a.games) || b.games - a.games || a.player.name.localeCompare(b.player.name));

  const dropOptions = rosterThen
    .map((r) => state.players[r.playerId])
    .filter((p): p is Player => !!p)
    .sort((a, b) => a.name.localeCompare(b.name));

  const check = checkDraft(draft, {
    baseRoster: state.roster,
    transactions: others,
    weeklyAcquisitionLimit: state.settings.weeklyAcquisitionLimit,
    weekStartsOn: state.settings.weekStartsOn,
  });
  const impact = check.errors.length === 0 ? evaluateMoveImpact(baseInput, candidateTx(draft)) : null;

  const save = () => {
    if (check.errors.length) {
      setShowErrors(true);
      return;
    }
    if (editing) dispatch({ type: "tx/update", id: editing.id, draft });
    else dispatch({ type: "tx/create", id: newId("move"), draft });
    toast(editing ? "Planned move updated." : "Move planned.");
    onClose();
  };

  const createPlayer = () => {
    const errs = validatePlayerDraft(playerDraft);
    setPlayerErrors(errs);
    if (errs.length) return;
    const player = playerFromDraft(playerDraft, newId("player"), true);
    dispatch({ type: "player/upsert", player });
    setDraft((d) => ({ ...d, addPlayerId: player.id }));
    setCreating(false);
    setPlayerDraft(emptyPlayerDraft());
  };

  const dates = weekDates(weekInput.weekStart);

  return (
    <Dialog
      open={open}
      onClose={onClose}
      width="lg"
      title={editing ? "Edit planned move" : "Plan a move"}
      description="Planning only. SHIFT doesn't make changes in your fantasy league. The move applies to the planner from its effective date."
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={save}>
            {editing ? "Save move" : "Plan move"}
          </Button>
        </>
      }
    >
      <div className="grid gap-5">
        <div className="flex flex-wrap items-end gap-6">
          <fieldset>
            <legend className="mb-2 text-label text-ink">Move type</legend>
            <div className="inline-flex rounded-control border border-line bg-surface-muted p-1">
              {TYPES.map((t) => (
                <label
                  key={t.value}
                  className={`flex h-9 cursor-pointer items-center rounded-badge px-4 text-body-sm font-medium has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-primary ${
                    draft.type === t.value ? "bg-surface text-ink shadow-sm ring-1 ring-line" : "text-ink-2 hover:text-ink"
                  }`}
                >
                  <input
                    type="radio"
                    name="move-type"
                    className="sr-only"
                    checked={draft.type === t.value}
                    onChange={() => setDraft((d) => ({ ...d, type: t.value }))}
                  />
                  {t.label}
                </label>
              ))}
            </div>
          </fieldset>
          <Field id="move-date" label="Effective date" className="w-52">
            <Select
              id="move-date"
              value={draft.effectiveDate}
              onChange={(e) => setDraft((d) => ({ ...d, effectiveDate: e.target.value }))}
            >
              {!dates.includes(draft.effectiveDate) && (
                <option value={draft.effectiveDate}>
                  {formatDayShort(draft.effectiveDate)} {formatMonthDay(draft.effectiveDate)}
                </option>
              )}
              {dates.map((d) => (
                <option key={d} value={d}>
                  {formatDayShort(d)} {formatMonthDay(d)}
                </option>
              ))}
            </Select>
          </Field>
        </div>

        <div className={`grid gap-5 ${needsAdd && needsDrop ? "grid-cols-2" : "grid-cols-1"}`}>
          {needsDrop && (
            <Field id="move-drop" label="Drop">
              <Select
                id="move-drop"
                value={draft.dropPlayerId ?? ""}
                onChange={(e) => setDraft((d) => ({ ...d, dropPlayerId: e.target.value || undefined }))}
              >
                <option value="">Choose a rostered player…</option>
                {dropOptions.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} · {p.nhlTeamId} · {p.eligiblePositions.join("/")} · {remaining(p)} left
                  </option>
                ))}
              </Select>
            </Field>
          )}

          {needsAdd && (
            <div>
              <div className="mb-2 flex items-center justify-between">
                <span id="move-add-label" className="text-label text-ink">
                  Add
                </span>
                <button
                  type="button"
                  className="inline-flex items-center gap-1 text-body-sm font-medium text-primary hover:underline"
                  onClick={() => setCreating((c) => !c)}
                  aria-expanded={creating}
                >
                  {creating ? <ArrowLeft aria-hidden className="size-3.5" /> : <Plus aria-hidden className="size-3.5" />}
                  {creating ? "Choose a saved player" : "Create new player"}
                </button>
              </div>
              {creating ? (
                <div className="rounded-card border border-line bg-surface-muted p-4">
                  <PlayerForm draft={playerDraft} onChange={setPlayerDraft} errors={playerErrors} />
                  <Button className="mt-4" variant="primary" size="sm" onClick={createPlayer}>
                    Create player
                  </Button>
                </div>
              ) : (
                <div role="radiogroup" aria-labelledby="move-add-label" className="max-h-64 overflow-y-auto rounded-card border border-line">
                  {addOptions.length === 0 && (
                    <p className="px-4 py-3 text-body-sm text-ink-3">No other saved players yet. Create one to plan an add.</p>
                  )}
                  {addOptions.map(({ player: p, games, delta }) => (
                    <label
                      key={p.id}
                      className={`flex cursor-pointer items-center gap-3 border-b border-line px-4 py-2.5 last:border-b-0 has-[:focus-visible]:bg-primary-soft ${
                        draft.addPlayerId === p.id ? "bg-primary-soft" : "hover:bg-surface-muted"
                      }`}
                    >
                      <input
                        type="radio"
                        name="move-add"
                        className="accent-primary"
                        checked={draft.addPlayerId === p.id}
                        onChange={() => setDraft((d) => ({ ...d, addPlayerId: p.id }))}
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-body font-medium text-ink">{p.name}</span>
                        <span className="block text-caption text-ink-3">
                          {p.nhlTeamId} · {p.eligiblePositions.join(" / ")} · {games} {games === 1 ? "game" : "games"} left this week
                        </span>
                      </span>
                      {delta !== null && (
                        <span
                          className={`text-caption font-semibold tabular-nums ${delta > 0 ? "text-success" : delta < 0 ? "text-warn" : "text-ink-3"}`}
                        >
                          {signed(delta)} started
                        </span>
                      )}
                    </label>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {impact && (
          <div className="rounded-card border border-line bg-surface-muted px-4 py-3" aria-live="polite">
            <h3 className="text-overline uppercase text-ink-2">Projected impact this week</h3>
            <dl className="mt-2 grid grid-cols-3 gap-4 text-body-sm">
              <div>
                <dt className="text-ink-3">Games started</dt>
                <dd className="text-body font-semibold tabular-nums text-ink">
                  {impact.before.gamesStarted} → {impact.after.gamesStarted}{" "}
                  <span className={impact.gamesStartedDelta > 0 ? "text-success" : impact.gamesStartedDelta < 0 ? "text-warn" : "text-ink-3"}>
                    ({signed(impact.gamesStartedDelta)})
                  </span>
                </dd>
              </div>
              <div>
                <dt className="text-ink-3">Benched games</dt>
                <dd className="text-body font-semibold tabular-nums text-ink">
                  {impact.before.benchedGames} → {impact.after.benchedGames}
                </dd>
              </div>
              <div>
                <dt className="text-ink-3">Goalie starts</dt>
                <dd className="text-body font-semibold tabular-nums text-ink">
                  {impact.before.goalieStarts} → {impact.after.goalieStarts}
                </dd>
              </div>
            </dl>
          </div>
        )}

        {check.warnings.length > 0 && (
          <p role="status" className="flex items-start gap-2 rounded-control border border-warn-line bg-warn-soft px-3.5 py-2.5 text-body-sm text-warn-strong">
            <AlertTriangle aria-hidden className="mt-0.5 size-4 shrink-0" />
            {check.warnings.join(" ")}
          </p>
        )}
        {showErrors && <ErrorList errors={check.errors} />}
      </div>
    </Dialog>
  );
}
