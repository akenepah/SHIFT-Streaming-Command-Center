"use client";
import { Check, ChevronDown, LogIn, LogOut, Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useId, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { Field, Input } from "@/components/ui/Field";
import { AnchoredPopover, MenuDivider, MenuItem } from "@/components/ui/Popover";
import { useToast } from "@/components/ui/Toast";
import { cloudClient } from "@/state/cloud/client";
import { useStore } from "@/state/store";
import { confirmDiscardUnsaved } from "@/state/unsavedGuard";

/**
 * Header "Account" menu: who is signed in, the team switcher (each team is its own workspace),
 * "Add another team", and sign in/out. Sign-in, migration and cloud errors use the dialog below.
 */
export function AccountControl() {
  const {
    user, cloudStatus, cloudError, migration, resolveMigration, reloadCloud, signOut,
    workspaces, activeWorkspaceId, creatingWorkspace, switchWorkspace, startNewWorkspace,
  } = useStore();
  const router = useRouter();
  const toast = useToast();
  const menuId = useId();
  const [anchor, setAnchor] = useState<HTMLButtonElement | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const client = cloudClient();
  const close = () => setAnchor(null);

  async function run(action: () => Promise<void>) {
    if (busy) return;
    setBusy(true);
    setMessage("");
    try {
      await action();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Please try again.");
    } finally {
      setBusy(false);
    }
  }
  async function choose(id: string) {
    if (!confirmDiscardUnsaved()) return;
    const trigger = anchor;
    close();
    try {
      await switchWorkspace(id);
    } catch (e) {
      toast(e instanceof Error ? e.message : "Couldn't switch teams.", "info");
    }
    trigger?.focus();
  }
  async function addTeam() {
    if (!confirmDiscardUnsaved()) return;
    close();
    try {
      await startNewWorkspace();
      router.push("/setup?step=1");
    } catch (e) {
      toast(e instanceof Error ? e.message : "Couldn't start a new team.", "info");
    }
  }

  return (
    <>
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={!!anchor}
        aria-controls={anchor ? menuId : undefined}
        onClick={(e) => setAnchor(anchor ? null : e.currentTarget)}
        className="ml-auto inline-flex items-center gap-1 rounded-control px-3 py-2 text-body-sm text-nav-ink hover:bg-nav-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
      >
        Account <ChevronDown aria-hidden className="size-4" />
      </button>

      {anchor && (
        <AnchoredPopover anchor={anchor} onClose={close} label="Account and teams" width={320} placement="below-end">
          <div className="px-2.5 pb-2 pt-1.5">
            <p className="font-display text-[11px] font-semibold uppercase tracking-[0.08em] text-secondary">Account</p>
            {user ? (
              <>
                <p className="truncate text-body-sm font-medium text-ink" title={user.email ?? undefined}>{user.email}</p>
                <p role="status" className="text-caption text-ink-3">{cloudStatus}</p>
              </>
            ) : (
              <p className="text-caption text-ink-3">Not signed in · teams are saved in this browser</p>
            )}
          </div>
          <MenuDivider />
          <div id={menuId} role="menu" aria-label="Your teams">
            <p className="px-2.5 pb-1 pt-1.5 font-display text-[11px] font-semibold uppercase tracking-[0.08em] text-secondary">Your teams</p>
            {/* Bounded, scrollable list: many teams never push the menu past the viewport. */}
            <div className="max-h-[min(50vh,288px)] overflow-y-auto">
              {workspaces.length === 0 && !creatingWorkspace && <p className="px-2.5 py-1.5 text-caption text-ink-3">No teams yet.</p>}
              {workspaces.map((w) => {
                const selected = w.id === activeWorkspaceId && !creatingWorkspace;
                return (
                  <button
                    key={w.id}
                    type="button"
                    role="menuitemradio"
                    aria-checked={selected}
                    onClick={() => (selected ? close() : void choose(w.id))}
                    className={`flex w-full items-start gap-2 rounded-control px-2.5 py-1.5 text-left hover:bg-surface-muted ${selected ? "bg-primary-soft" : ""}`}
                  >
                    <span className="mt-0.5 flex size-4 shrink-0 items-center justify-center">
                      {selected && <Check aria-hidden className="size-4 text-primary-strong" />}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className={`block truncate text-body-sm text-ink ${selected ? "font-semibold" : "font-medium"}`} title={w.teamName}>
                        {w.teamName}
                      </span>
                      <span className="block truncate text-caption text-ink-3" title={w.leagueName}>
                        {w.leagueName}
                      </span>
                    </span>
                  </button>
                );
              })}
              {creatingWorkspace && (
                <p className="flex items-start gap-2 rounded-control bg-primary-soft px-2.5 py-1.5 text-body-sm font-semibold text-ink">
                  <Check aria-hidden className="mt-0.5 size-4 shrink-0 text-primary-strong" /> New team (setting up)
                </p>
              )}
            </div>
            {!creatingWorkspace && (
              <MenuItem onSelect={() => void addTeam()}>
                <Plus aria-hidden className="text-primary-strong" /> {workspaces.length ? "Add another team" : "Add a team"}
              </MenuItem>
            )}
            <MenuDivider />
            {user ? (
              <MenuItem
                disabled={busy || cloudStatus === "Saving…"}
                onSelect={() => {
                  close();
                  void run(signOut);
                }}
              >
                <LogOut aria-hidden /> Sign out
              </MenuItem>
            ) : (
              <MenuItem
                onSelect={() => {
                  close();
                  setDialogOpen(true);
                }}
              >
                <LogIn aria-hidden /> Sign in to save to your account
              </MenuItem>
            )}
          </div>
        </AnchoredPopover>
      )}

      <Dialog
        open={dialogOpen || migration || !!cloudError}
        onClose={() => setDialogOpen(false)}
        title={migration ? "Existing SHIFT setup found" : user ? "Your account" : "Save your league"}
        description={migration ? "Save this league and roster to your account?" : "Your saved teams follow you across browsers and devices."}
        footer={<Button onClick={() => setDialogOpen(false)} disabled={migration || !!cloudError}>Close</Button>}
      >
        <div className="grid gap-4">
          {!client ? (
            <p>Account saving is not available on this deployment yet. Your setup currently stays in this browser.</p>
          ) : migration ? (
            <>
              <Button disabled={busy} variant="primary" onClick={() => run(() => resolveMigration(true))}>Save to account</Button>
              <Button disabled={busy} onClick={() => run(() => resolveMigration(false))}>Start fresh</Button>
              <Button disabled={busy} onClick={() => run(signOut)}>Not now — sign out</Button>
            </>
          ) : user ? (
            <>
              <p>{user.email}</p>
              <p role="status">{cloudStatus}</p>
            </>
          ) : (
            <>
              <Field id="account-email" label="Email">
                <Input id="account-email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
              </Field>
              <Button
                variant="primary"
                disabled={busy || !email.trim()}
                onClick={() =>
                  run(async () => {
                    const { error } = await client.auth.signInWithOtp({ email: email.trim(), options: { emailRedirectTo: `${window.location.origin}/` } });
                    if (error) throw error;
                    setMessage("Check your email for a sign-in link.");
                  })
                }
              >
                Continue with email
              </Button>
              {process.env.NEXT_PUBLIC_AUTH_GOOGLE_ENABLED === "true" && (
                <Button
                  disabled={busy}
                  onClick={() =>
                    run(async () => {
                      const { error } = await client.auth.signInWithOAuth({ provider: "google", options: { redirectTo: `${window.location.origin}/` } });
                      if (error) throw error;
                    })
                  }
                >
                  Continue with Google
                </Button>
              )}
            </>
          )}
          {cloudError && (
            <>
              <p role="alert" className="text-danger">{cloudError}</p>
              <Button disabled={busy} onClick={() => run(async () => { if (window.confirm("Reload cloud data and discard unsaved changes in this tab?")) await reloadCloud(); })}>
                Reload saved data
              </Button>
            </>
          )}
          {message && <p role="status">{message}</p>}
        </div>
      </Dialog>
    </>
  );
}
