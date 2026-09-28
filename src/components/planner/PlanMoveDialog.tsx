"use client";

import { AlertTriangle, ArrowLeft, Info } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { PlayerForm } from "@/components/player/PlayerForm";
import { PlayerSearch } from "@/components/player/PlayerSearch";
import { ExistingIdentityNotice, usePlayerPool } from "@/components/roster/PlayerDialogs";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { ErrorList, Field, Select } from "@/components/ui/Field";
import { useToast } from "@/components/ui/Toast";
import { addDays, formatDayLong, formatDayShort, formatMonthDay, weekDates } from "@/domain/dates";
import { generateDailyLineup } from "@/domain/lineup/generateDailyLineup";
import type { OpenSlotContext } from "@/domain/lineup/openSlot";
import { findTeamGame } from "@/domain/schedule/provider";
import type { WeekInput } from "@/domain/lineup/generateWeek";
import { TEAMS_SORTED, teamFullName } from "@/domain/nhl/teams";
import type { NHLTeamId } from "@/domain/types";
import { activeSlotCount, canPlaySlot } from "@/domain/config";
import { findExistingIdentity, isRostered, type ExistingIdentity } from "@/domain/players/searchPlayers";
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
  initialType = "ADD_DROP",
  slotContext = null,
  initialTeam = "",
}: {
  open: boolean;
  onClose: () => void;
  weekInput: WeekInput;
  editing: PlannedTransaction | null;
  defaultDate: ISODate;
  /** Starting move type for a new move (e.g. ADD when the roster has room). */
  initialType?: TransactionType;
  /** Set when the flow starts from an empty active slot on the Weekly Planner. */
  slotContext?: OpenSlotContext | null;
  initialTeam?: NHLTeamId | "";
}) {
  const { state, dispatch } = useStore();
  const toast = useToast();
  const [draft, setDraft] = useState<TransactionDraft>(() =>
    editing
      ? { type: editing.type, addPlayerId: editing.addPlayerId, dropPlayerId: editing.dropPlayerId, effectiveDate: editing.effectiveDate }
      : { type: initialType, effectiveDate: defaultDate },
  );
  const committing = useRef(false);
  const [saving, setSaving] = useState(false);
  const [creating, setCreating] = useState(false);
  const [playerDraft, setPlayerDraft] = useState<PlayerDraft>(emptyPlayerDraft);
  const [playerErrors, setPlayerErrors] = useState<string[]>([]);
  const [showErrors, setShowErrors] = useState(false);
  const [teamFilter, setTeamFilter] = useState<NHLTeamId | "">(initialTeam);
  const [addQuery, setAddQuery] = useState("");
  const [existing, setExisting] = useState<ExistingIdentity>(null);
  const [typeTouched, setTypeTouched] = useState(false);

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

  // Add candidates come from the shared player search (catalog + saved players).
  // No per-player scoring: the review below shows the chosen move's impact.
  const { pool: fullPool, lookup } = usePlayerPool();
  const rosteredThen = (p: Player) => isRostered(p, rosterThen, lookup);
  const savedIdle = Object.values(state.players)
    .filter((p) => !rosterIds.has(p.id))
    .sort((a, b) => a.name.localeCompare(b.name));

  // From an open slot: start with players who fit that slot and play that day.
  // A checkbox widens back to everyone; nobody is permanently hidden, nothing is ranked.
  const [fitSlot, setFitSlot] = useState(!!slotContext);
  const fitsContext = (p: Player) =>
    !!slotContext &&
    canPlaySlot(p.eligiblePositions, slotContext.position) &&
    !!findTeamGame(weekInput.scheduleProvider, p.nhlTeamId, draft.effectiveDate);
  const contextPool = slotContext && fitSlot ? fullPool.filter(fitsContext) : fullPool;
  const pool = teamFilter ? contextPool.filter(p => p.nhlTeamId === teamFilter && (!initialTeam || !p.eligiblePositions.includes("G"))) : contextPool;
  const teamIdle = teamFilter ? pool.filter(p => !rosteredThen(p)).sort((a, b) => a.name.localeCompare(b.name)) : null;
  const contextIdle =
    slotContext && fitSlot
      ? pool
          .filter((p) => !rosteredThen(p))
          .sort((a, b) => remaining(b) - remaining(a) || a.name.localeCompare(b.name))
          .slice(0, 20)
      : null;
  const slotDayLabel = slotContext ? `${formatDayShort(draft.effectiveDate)} ${formatMonthDay(draft.effectiveDate)}` : "";
  const selected = draft.addPlayerId ? lookup[draft.addPlayerId] : undefined;

  // Roster capacity on the effective date decides Add vs Add + Drop.
  const capacity = state.settings.roster;
  const regularSpots = activeSlotCount(capacity) + capacity.benchSlots;
  const hasOpenSpot = rosterThen.filter((r) => r.rosterStatus !== "IR_PLUS").length < regularSpots;

  const selectAdd = (p: Player) =>
    setDraft((d) => ({
      ...d,
      addPlayerId: p.id,
      // Until the user picks a type themselves, fit the move to the roster: a
      // chosen drop or a full roster means Add + Drop; an open spot, a plain Add.
      type: typeTouched || editing || d.type === "DROP" ? d.type : d.dropPlayerId || !hasOpenSpot ? "ADD_DROP" : "ADD",
    }));

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
  if (draft.type === "ADD" && !hasOpenSpot) check.errors.push("Roster is full. Use Add + Drop.");
  const impact = check.errors.length === 0 ? evaluateMoveImpact(baseInput, candidateTx(draft)) : null;

  const save = () => {
    if (committing.current) return;
    if (check.errors.length) {
      setShowErrors(true);
      return;
    }
    committing.current = true;
    setSaving(true);
    // A catalog player becomes a saved player once a move references them.
    const added = draft.type !== "DROP" && draft.addPlayerId ? lookup[draft.addPlayerId] : undefined;
    if (added && !state.players[added.id]) dispatch({ type: "player/upsert", player: added });
    if (editing) dispatch({ type: "tx/update", id: editing.id, draft });
    else dispatch({ type: "tx/create", id: newId("move"), draft });
    if (slotContext && added) {
      const after = generateDailyLineup({ ...baseInput, date: draft.effectiveDate, plannedTransactions: [...others, candidateTx(draft)] });
      const assigned = after.activeSlots.find(a => a.playerId === added.id);
      const remains = after.openSlots.some(s => s.type === slotContext.position);
      toast(`${added.name} ${assigned ? `fills ${assigned.slot.type}` : "is benched"} on ${formatDayShort(draft.effectiveDate)}${remains ? ` · ${slotContext.position} remains open` : ""}.`);
    } else toast(editing ? "Planned move updated." : "Move planned.");
    onClose();
  };

  const createPlayer = () => {
    const errs = validatePlayerDraft(playerDraft);
    setPlayerErrors(errs);
    if (errs.length) return;
    const found = findExistingIdentity(playerDraft.name, playerDraft.nhlTeamId, pool);
    if (found) {
      setExisting(found);
      return;
    }
    const player = playerFromDraft(playerDraft, newId("player"));
    dispatch({ type: "player/upsert", player });
    selectAdd(player);
    setCreating(false);
    setPlayerDraft(emptyPlayerDraft());
  };

  const dates = weekDates(weekInput.weekStart);

  return (
    <Dialog
      open={open}
      onClose={onClose}
      width="lg"
      title={
        editing
          ? "Edit planned move"
          : slotContext
            ? `Add player for ${formatDayLong(slotContext.date)} ${formatMonthDay(slotContext.date)} · ${slotContext.position}`
            : "Plan a move"
      }
      description={
        slotContext && !editing
          ? "Find a player who can help fill this lineup opportunity. Planning only: SHIFT doesn't make changes in your fantasy league."
          : "Planning only. SHIFT doesn't make changes in your fantasy league. The move applies to the planner from its effective date."
      }
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={save} disabled={saving}>
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
                    // onClick too, so re-confirming the already-selected type counts as a choice.
                    onClick={() => setTypeTouched(true)}
                    onChange={() => {
                      setTypeTouched(true);
                      setDraft((d) => ({ ...d, type: t.value }));
                    }}
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

        <div className={`grid gap-5 ${needsAdd && needsDrop ? "grid-cols-1 sm:grid-cols-2" : "grid-cols-1"}`}>
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
                {creating && (
                  <button
                    type="button"
                    className="inline-flex items-center gap-1 text-body-sm font-medium text-primary-strong hover:underline"
                    onClick={() => setCreating(false)}
                  >
                    <ArrowLeft aria-hidden className="size-3.5" /> Back to search
                  </button>
                )}
              </div>
              {selected && !creating && (
                <p className="mb-2 text-body-sm text-ink-2">
                  Selected: <span className="font-semibold text-ink">{selected.name}</span> · {selected.nhlTeamId} ·{" "}
                  {selected.eligiblePositions.join(", ")}
                </p>
              )}
              {creating ? (
                <div className="grid gap-4 rounded-card border border-line bg-surface-muted p-4">
                  {existing && (
                    <ExistingIdentityNotice
                      existing={existing}
                      onUse={(p) => {
                        selectAdd(p);
                        setExisting(null);
                        setCreating(false);
                      }}
                      onDismiss={() => setExisting(null)}
                    />
                  )}
                  <PlayerForm draft={playerDraft} onChange={setPlayerDraft} errors={playerErrors} />
                  <div>
                    <Button variant="primary" size="sm" onClick={createPlayer}>
                      Create player
                    </Button>
                  </div>
                </div>
              ) : (
                <>
                  {slotContext && (
                    <label className="mb-3 flex items-center gap-2 text-body-sm text-ink-2">
                      <input
                        type="checkbox"
                        className="size-4 accent-primary"
                        checked={fitSlot}
                        onChange={(e) => setFitSlot(e.target.checked)}
                      />
                      Showing {slotContext.position}-eligible players with a game {slotDayLabel}
                    </label>
                  )}
                  <Field label="NHL team" id="move-team">
                    <Select id="move-team" value={teamFilter} onChange={e => { setTeamFilter(e.target.value as NHLTeamId | ""); setDraft(d => ({ ...d, addPlayerId: undefined })); }}>
                      <option value="">All teams</option>
                      {TEAMS_SORTED.map(t => <option key={t.id} value={t.id}>{teamFullName(t.id)}</option>)}
                    </Select>
                  </Field>
                  {teamFilter && <p className="text-caption text-ink-2">{initialTeam ? "Skaters" : "Players"} from {teamFullName(teamFilter)} · change to All teams to clear.</p>}
                  <PlayerSearch
                    inputId="move-add-search"
                    query={addQuery}
                    onQueryChange={setAddQuery}
                    pool={pool}
                    autoFocus={!!slotContext}
                    isRostered={rosteredThen}
                    mode={{ kind: "select", name: "move-add", selectedId: draft.addPlayerId, onSelect: selectAdd }}
                    onCreateManually={() => {
                      setPlayerDraft({ ...emptyPlayerDraft(), name: addQuery.trim() });
                      setCreating(true);
                    }}
                    idle={
                      teamIdle ? { label: `${teamFilter} ${initialTeam ? "skaters" : "players"}`, players: teamIdle } : contextIdle
                        ? { label: `${slotContext!.position}-eligible · playing ${slotDayLabel}`, players: contextIdle }
                        : { label: "Your saved players", players: savedIdle }
                    }
                    meta={(p) => (
                      <span className="shrink-0 text-caption text-ink-3 tabular-nums">
                        {remaining(p)} {remaining(p) === 1 ? "game" : "games"} left this week
                      </span>
                    )}
                  />
                </>
              )}
            </div>
          )}
        </div>

        {slotContext && needsAdd && draft.effectiveDate > slotContext.date && (
          <p role="status" className="flex items-start gap-2 rounded-control border border-line bg-surface-muted px-3.5 py-2.5 text-body-sm text-ink-2">
            <Info aria-hidden className="mt-0.5 size-4 shrink-0 text-primary" />
            This move takes effect {formatDayShort(draft.effectiveDate)} {formatMonthDay(draft.effectiveDate)}, so{" "}
            {formatDayLong(slotContext.date)}&apos;s {slotContext.position} slot stays open.
          </p>
        )}

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
                <dt className="text-ink-3">Goalie games</dt>
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
