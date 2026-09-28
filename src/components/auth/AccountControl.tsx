"use client";
import {useState} from 'react';
import {cloudClient} from '@/state/cloud/client';
import {useStore} from '@/state/store';
import {Button} from '@/components/ui/Button';
import {Dialog} from '@/components/ui/Dialog';
import {Field,Input} from '@/components/ui/Field';
export function AccountControl(){
 const {user,cloudStatus,cloudError,migration,resolveMigration,reloadCloud,signOut}=useStore();
 const [open,setOpen]=useState(false),[email,setEmail]=useState(''),[message,setMessage]=useState(''),[busy,setBusy]=useState(false);
 async function run(action:()=>Promise<void>){if(busy)return;setBusy(true);setMessage('');try{await action();}catch(e){setMessage(e instanceof Error?e.message:'Please try again.');}finally{setBusy(false);}}
 const client=cloudClient();
 return <>
  <button type="button" onClick={()=>setOpen(true)} className="ml-auto rounded-control px-3 py-2 text-body-sm text-nav-ink">{user?'Account':'Save to account'}</button>
  <Dialog open={open||migration||!!cloudError} onClose={()=>setOpen(false)} title={migration?'Existing SHIFT setup found':user?'Your account':'Save your league'} description={migration?'Save this league and roster to your account?':'Your saved league follows you across browsers and devices.'} footer={<Button onClick={()=>setOpen(false)} disabled={migration||!!cloudError}>Close</Button>}>
   <div className="grid gap-4">
    {!client?<p>Account saving is not available on this deployment yet. Your setup currently stays in this browser.</p>:migration?<><Button disabled={busy} variant="primary" onClick={()=>run(()=>resolveMigration(true))}>Save to account</Button><Button disabled={busy} onClick={()=>run(()=>resolveMigration(false))}>Start fresh</Button><Button disabled={busy} onClick={()=>run(signOut)}>Not now — sign out</Button></>:user?<><p>{user.email}</p><p role="status">{cloudStatus}</p><Button disabled={busy||cloudStatus==='Saving…'} onClick={()=>run(signOut)}>Sign out</Button></>:<>
     <Field id="account-email" label="Email"><Input id="account-email" type="email" autoComplete="email" value={email} onChange={e=>setEmail(e.target.value)}/></Field>
     <Button variant="primary" disabled={busy||!email.trim()} onClick={()=>run(async()=>{const {error}=await client.auth.signInWithOtp({email:email.trim(),options:{emailRedirectTo:window.location.origin}});if(error)throw error;setMessage('Check your email for a sign-in link.');})}>Continue with email</Button>
     {process.env.NEXT_PUBLIC_AUTH_GOOGLE_ENABLED==='true'&&<Button disabled={busy} onClick={()=>run(async()=>{const {error}=await client.auth.signInWithOAuth({provider:'google',options:{redirectTo:window.location.origin}});if(error)throw error;})}>Continue with Google</Button>}
    </>}
    {cloudError&&<><p role="alert" className="text-danger">{cloudError}</p><Button disabled={busy} onClick={()=>run(async()=>{if(window.confirm('Reload cloud data and discard unsaved changes in this tab?'))await reloadCloud();})}>Reload saved data</Button></>}
    {message&&<p role="status">{message}</p>}
   </div>
  </Dialog>
 </>;
}
