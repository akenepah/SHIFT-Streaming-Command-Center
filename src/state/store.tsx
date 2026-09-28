"use client";
import { createContext, useContext, useEffect, useMemo, useReducer, useRef, useState, type ReactNode } from "react";
import type { User } from '@supabase/supabase-js';
import { createInitialState, type AppState } from "./appState";
import { reducer, type Action } from "./reducer";
import { browserRepository, STORAGE_KEY, type AppStateRepository, type LoadResult } from "./repository";
import { cloudClient } from './cloud/client';
import { CloudRepository, shouldOfferMigration } from './cloud/repository';

type Store = {
 state: AppState; dispatch: (action: Action) => void; hydrated: boolean;
 loadStatus: LoadResult['status'] | null; removedDemoPlayers: number;
 user: User | null; cloudStatus: string; cloudError: string | null;
 migration: boolean; resolveMigration: (save: boolean) => Promise<void>;
 reloadCloud: () => Promise<void>; signOut: () => Promise<void>;
 /** Bumps when another tab's change is loaded into this one (dirty forms warn on it). */
 externalRevision: number;
};
const StoreContext = createContext<Store | null>(null);
export function StoreProvider({children,repository}: {children:ReactNode;repository?:AppStateRepository}) {
 const repo=useRef<AppStateRepository|null>(repository??null);
 const [state,dispatch]=useReducer(reducer,undefined,createInitialState);
 const [hydrated,setHydrated]=useState(false);
 const [loadStatus,setLoadStatus]=useState<LoadResult['status']|null>(null);
 const [removedDemoPlayers,setRemovedDemoPlayers]=useState(0);
 const [user,setUser]=useState<User|null>(null);
 const [cloudStatus,setCloudStatus]=useState('Local only');
 const [cloudError,setCloudError]=useState<string|null>(null);
 const [migration,setMigration]=useState(false);
 const candidate=useRef<AppState|null>(null);
 const cloud=useRef<CloudRepository|null>(null);
 const lastSaved=useRef<AppState|null>(null);
 const latest=useRef(state);
 const blocked=useRef(false);
 const pending=useRef<AppState|null>(null);
 const saving=useRef<Promise<void>|null>(null);
 const owner=useRef<string|null>(null);
 const generation=useRef(0);
 const loaded=useRef(false);
 const [externalRevision,setExternalRevision]=useState(0);
 // Set while hydrating another tab's state, so it isn't written straight back.
 const external=useRef(false);

 useEffect(()=>{ latest.current=state; },[state]);
 useEffect(()=>{
  if(!loaded.current){
   loaded.current=true;repo.current??=browserRepository();
   const result=repo.current.load();candidate.current=result.state;
   dispatch({type:'hydrate',state:result.state});setLoadStatus(result.status);
   if(result.status==='migrated')setRemovedDemoPlayers(result.removedDemoPlayers);
  }
  const client=cloudClient();
  if(!client){setHydrated(true);return;}
  let active=true;
  const sub=client.auth.onAuthStateChange((_event,session)=>{
   const next=session?.user??null;
   if(owner.current===next?.id && cloud.current)return;
   const previous=owner.current;
   owner.current=next?.id??null;setUser(next);setCloudError(null);
   cloud.current=null;pending.current=null;blocked.current=false;setMigration(false);
   const ticket=++generation.current;
   if(!next){
    if(previous){repo.current?.clear();candidate.current=null;dispatch({type:'hydrate',state:createInitialState()});}
    setCloudStatus('Local only');setHydrated(true);return;
   }
   setHydrated(false);setCloudStatus('Loading saved data…');
   // Avoid waiting for another auth request inside the auth callback.
   setTimeout(()=>{
    const remote=new CloudRepository(client,next.id);
    remote.load().then(saved=>{
     if(!active||generation.current!==ticket)return;
     cloud.current=remote;
     const local=candidate.current;
     const offer=!!local&&shouldOfferMigration(local,!!saved);
     blocked.current=offer;setMigration(offer);
     const initial=saved??(offer?local!:createInitialState());
     lastSaved.current=initial;dispatch({type:'hydrate',state:initial});
     setCloudStatus(offer?'Choose whether to save existing setup':'Saved to account');setHydrated(true);
     if(saved){candidate.current=null;repo.current?.clear();}
    }).catch(e=>{if(active&&generation.current===ticket){blocked.current=true;setCloudError(String(e.message));setCloudStatus('Cloud unavailable');setHydrated(true);dispatch({type:'hydrate',state:createInitialState()});}});
   },0);
  });
  return ()=>{active=false;sub.data.subscription.unsubscribe();};
 },[]);

 async function drain(){
  if(saving.current)return saving.current;
  const remote=cloud.current;
  if(!remote||blocked.current)return;
  saving.current=(async()=>{
   try{
    while(pending.current&&cloud.current===remote&&!blocked.current){
     const next=pending.current;pending.current=null;setCloudStatus('Saving…');
     await remote.save(next);
     if(cloud.current!==remote)return;
     lastSaved.current=next;setCloudStatus('Saved to account');
    }
   }catch(e){if(cloud.current===remote){blocked.current=true;setCloudError(e instanceof Error?e.message:'Could not save.');setCloudStatus('Changes not saved');}}
   finally{saving.current=null;}
  })();
  return saving.current;
 }
 useEffect(()=>{
  if(!hydrated)return;
  if(external.current){external.current=false;if(!user)candidate.current=state;else lastSaved.current=state;return;}
  if(!user){repo.current?.save(state);candidate.current=state;return;}
  if(!cloud.current||blocked.current||state===lastSaved.current)return;
  pending.current=state;
  void drain();
 // Writes are serialized by repository revision; callbacks read only refs.
 },[state,hydrated,user]);
 useEffect(()=>{
  const guard=(e:BeforeUnloadEvent)=>{if(pending.current||saving.current||blocked.current&&owner.current)e.preventDefault();};
  window.addEventListener('beforeunload',guard);return()=>window.removeEventListener('beforeunload',guard);
 },[]);

 // Multi-tab: never overwrite another tab's newer state with this tab's stale copy.
 // Local mode follows the storage event; cloud mode refetches on focus when nothing is unsaved.
 useEffect(()=>{
  const onStorage=(e:StorageEvent)=>{
   if(e.key!==STORAGE_KEY||owner.current||!repo.current)return;
   const result=repo.current.load();
   external.current=true;candidate.current=result.state;
   dispatch({type:'hydrate',state:result.state});setExternalRevision(n=>n+1);
  };
  const onFocus=()=>{
   const remote=cloud.current;
   if(document.visibilityState!=='visible'||!remote||pending.current||saving.current||blocked.current)return;
   const before=remote.revision;
   remote.load().then(saved=>{
    if(cloud.current!==remote||pending.current||saving.current||!saved||remote.revision===before)return;
    external.current=true;lastSaved.current=saved;
    dispatch({type:'hydrate',state:saved});setExternalRevision(n=>n+1);
   }).catch(()=>{/* A failed background refresh leaves current data untouched. */});
  };
  window.addEventListener('storage',onStorage);
  window.addEventListener('focus',onFocus);
  document.addEventListener('visibilitychange',onFocus);
  return()=>{window.removeEventListener('storage',onStorage);window.removeEventListener('focus',onFocus);document.removeEventListener('visibilitychange',onFocus);};
 },[]);

 async function resolveMigration(save:boolean){
  const remote=cloud.current;if(!remote)return;
  try{
   setCloudError(null);setCloudStatus('Saving…');
   const initial=save?latest.current:createInitialState();
   await remote.save(initial); // expected revision 0 makes repeated/concurrent migration safe.
   if(cloud.current!==remote)return;
   blocked.current=false;setMigration(false);lastSaved.current=initial;
   candidate.current=null;repo.current?.clear();dispatch({type:'hydrate',state:initial});setCloudStatus('Saved to account');
  }catch(e){setCloudError(e instanceof Error?e.message:'Migration failed.');setCloudStatus('Changes not saved');}
 }
 async function reloadCloud(){
  const remote=cloud.current??(cloudClient()&&user?new CloudRepository(cloudClient()!,user.id):null);if(!remote)return;
  try{await saving.current;const saved=await remote.load();cloud.current=remote;pending.current=null;blocked.current=false;setMigration(false);setCloudError(null);const next=saved??createInitialState();lastSaved.current=next;dispatch({type:'hydrate',state:next});setCloudStatus('Saved to account');}
  catch(e){setCloudError(e instanceof Error?e.message:'Could not load saved data.');}
 }
 async function signOut(){
  await drain();
  if(blocked.current&&!migration)throw new Error('Resolve unsaved changes before signing out.');
  const {error}=await cloudClient()!.auth.signOut();if(error)throw error;
 }
 const value=useMemo(()=>({state,dispatch,hydrated,loadStatus,removedDemoPlayers,user,cloudStatus,cloudError,migration,resolveMigration,reloadCloud,signOut,externalRevision}),
 // Functions use current state and refs; recreate the public value as state changes.
 // eslint-disable-next-line react-hooks/exhaustive-deps
 [state,hydrated,loadStatus,removedDemoPlayers,user,cloudStatus,cloudError,migration,externalRevision]);
 return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}
export function useStore(){const value=useContext(StoreContext);if(!value)throw new Error('StoreProvider required');return value;}
