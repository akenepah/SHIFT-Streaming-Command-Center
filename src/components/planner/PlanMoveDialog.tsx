"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { PlayerForm, inputClass, labelClass } from "@/components/player/PlayerForm";
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
            <legend className={labelClass}>Move type</legend>
            <div className="inline-flex rounded-md border border-line p-0.5">
              {TYPES.map((t) => (
                <label
                  key={t.value}
                  className={`cursor-pointer rounded px-3 py-1.5 text-[13px] font-medium has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-brand ${
                    draft.type === t.value ? "bg-nav text-white" : "text-ink-2 hover:text-ink"
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
          <div>
            <label htmlFor="move-date" className={labelClass}>
              Effective date
            </label>
            <select
              id="move-date"
              className={`${inputClass} w-48`}
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
            </select>
          </div>
        </div>

        <div className={`grid gap-5 ${needsAdd && needsDrop ? "grid-cols-2" : "grid-cols-1"}`}>
          {needsDrop && (
            <div>
              <label htmlFor="move-drop" className={labelClass}>
                Drop
              </label>
              <select
                id="move-drop"
                className={inputClass}
                value={draft.dropPlayerId ?? ""}
                onChange={(e) => setDraft((d) => ({ ...d, dropPlayerId: e.target.value || undefined }))}
              >
                <option value="">Choose a rostered player…</option>
                {dropOptions.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} · {p.nhlTeamId} · {p.eligiblePositions.join("/")} · {remaining(p)} left this week
                  </option>
                ))}
              </select>
            </div>
          )}

          {needsAdd && (
            <div>
              <div className="mb-1 flex items-center justify-between">
                <span id="move-add-label" className="text-[12px] font-medium text-ink-2">
                  Add
                </span>
                <button
                  type="button"
                  className="text-[12px] font-medium text-brand hover:underline"
                  onClick={() => setCreating((c) => !c)}
                  aria-expanded={creating}
                >
                  {creating ? "Choose existing player" : "+ Create new player"}
                </button>
              </div>
              {creating ? (
                <div className="rounded-md border border-line p-3">
                  <PlayerForm draft={playerDraft} onChange={setPlayerDraft} errors={playerErrors} />
                  <Button className="mt-3" variant="primary" size="sm" onClick={createPlayer}>
                    Create player
                  </Button>
                </div>
              ) : (
                <div
                  role="radiogroup"
                  aria-labelledby="move-add-label"
                  className="max-h-64 overflow-y-auto rounded-md border border-line"
                >
                  {addOptions.length === 0 && (
                    <p className="px-3 py-3 text-[13px] text-ink-3">No other saved players yet. Use Create new player to plan an add.</p>
                  )}
                  {addOptions.map(({ player: p, games, delta }) => (
                    <label
                      key={p.id}
                      className={`flex cursor-pointer items-center gap-3 border-b border-line px-3 py-2 last:border-b-0 has-[:focus-visible]:bg-brand-soft ${
                        draft.addPlayerId === p.id ? "bg-brand-soft" : "hover:bg-canvas"
                      }`}
                    >
                      <input
                        type="radio"
                        name="move-add"
                        checked={draft.addPlayerId === p.id}
                        onChange={() => setDraft((d) => ({ ...d, addPlayerId: p.id }))}
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[13px] font-medium">{p.name}</span>
                        <span className="block text-[12px] text-ink-3">
                          {p.nhlTeamId} · {p.eligiblePositions.join(" / ")} · {games} {games === 1 ? "game" : "games"} left this week
                        </span>
                      </span>
                      {delta !== null && (
                        <span
                          className={`text-[12px] font-semibold tabular-nums ${delta > 0 ? "text-ok" : delta < 0 ? "text-warn" : "text-ink-3"}`}
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
          <div className="rounded-lg border border-line bg-canvas px-4 py-3" aria-live="polite">
            <h3 className="text-[12px] font-semibold uppercase tracking-wide text-ink-2">Projected impact this week</h3>
            <dl className="mt-2 grid grid-cols-3 gap-4 text-[13px]">
              <div>
                <dt className="text-ink-3">Games started</dt>
                <dd className="font-semibold tabular-nums">
                  {impact.before.gamesStarted} → {impact.after.gamesStarted}{" "}
                  <span className={impact.gamesStartedDelta > 0 ? "text-ok" : impact.gamesStartedDelta < 0 ? "text-warn" : "text-ink-3"}>
                    ({signed(impact.gamesStartedDelta)})
                  </span>
                </dd>
              </div>
              <div>
                <dt className="text-ink-3">Benched games</dt>
                <dd className="font-semibold tabular-nums">
                  {impact.before.benchedGames} → {impact.after.benchedGames}
                </dd>
              </div>
              <div>
                <dt className="text-ink-3">Goalie starts</dt>
                <dd className="font-semibold tabular-nums">
                  {impact.before.goalieStarts} → {impact.after.goalieStarts}
                </dd>
              </div>
            </dl>
          </div>
        )}

        {check.warnings.length > 0 && (
          <p role="status" className="rounded-md border border-warn-line bg-warn-soft px-3 py-2 text-[12px] text-warn-strong">
            {check.warnings.join(" ")}
          </p>
        )}
        {showErrors && check.errors.length > 0 && (
          <ul role="alert" className="rounded-md border border-danger/30 bg-danger-soft px-3 py-2 text-[12px] text-danger">
            {check.errors.map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
        )}
      </div>
    </Dialog>
  );
}
