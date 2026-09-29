/** Refresh verified active NHL identities, independently of fantasy rankings. */
import {existsSync,readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {normalizeNhlPosition,validateCatalog} from '../src/domain/players/validation.ts';
const teams=[...readFileSync('src/domain/nhl/teamIds.ts','utf8').matchAll(/"([A-Z]{3})"/g)].map(m=>m[1]);
const cache='/tmp/shift-nhl-identity-cache';mkdirSync(cache,{recursive:true});
async function get(url){
 const path=`${cache}/${encodeURIComponent(url)}.json`;
 if(existsSync(path))return JSON.parse(readFileSync(path,'utf8'));
 for(let attempt=0;attempt<6;attempt++){
  await new Promise(r=>setTimeout(r,300));
  const res=await fetch(url,{signal:AbortSignal.timeout(20000)});
  if(res.ok){const data=await res.json();writeFileSync(path,JSON.stringify(data));return data;}
  if(res.status!==429&&res.status<500)throw new Error(`${res.status} ${url}`);
  await new Promise(r=>setTimeout(r,Math.min(30000,2000*2**attempt)));
 }
 throw new Error(`Rate limit or server failure: ${url}`);
}
async function map(xs,fn){let i=0;const out=[];await Promise.all(Array.from({length:2},async()=>{while(i<xs.length){const n=i++;out[n]=await fn(xs[n]);}}));return out;}
const rosters=await map(teams,t=>get(`https://api-web.nhle.com/v1/roster/${t}/20262027`));
const ids=[...new Set(rosters.flatMap(r=>[...(r.forwards??[]),...(r.defensemen??[]),...(r.goalies??[])].map(p=>p.id)))];
console.log(`Verifying ${ids.length} NHL roster identities`);
const landings=await map(ids,id=>get(`https://api-web.nhle.com/v1/player/${id}/landing`));
const players=landings.filter(p=>p.isActive===true&&teams.includes(p.currentTeamAbbrev)).map(p=>({nhlPlayerId:p.playerId,firstName:p.firstName.default,lastName:p.lastName.default,fullName:`${p.firstName.default} ${p.lastName.default}`,teamAbbrev:p.currentTeamAbbrev,primaryPosition:normalizeNhlPosition(p.position),headshotUrl:p.headshot??null,active:true})).sort((a,b)=>a.lastName.localeCompare(b.lastName)||a.firstName.localeCompare(b.firstName)||a.nhlPlayerId-b.nhlPlayerId);
const data={season:'2026-27',playerCount:players.length,membershipSource:'NHL active season rosters',membershipSourceUrl:'https://api-web.nhle.com/v1/roster/{TEAM}/20262027',membershipSourcePublishedAt:null,membershipSourceModifiedAt:null,generatedAt:new Date().toISOString(),players};
const schedule=JSON.parse(readFileSync('src/data/nhl/2026-27.json','utf8'));
const errors=validateCatalog(data,{teamIds:teams,scheduleTeamIds:[...new Set(schedule.games.flatMap(g=>[g.homeTeam,g.awayTeam]))]});
if(players.length<500)errors.push('Fewer than 500 verified active players');
if(!players.some(p=>p.nhlPlayerId===8477942&&p.fullName==='Kevin Fiala'))errors.push('Kevin Fiala sanity check failed');
if(errors.length)throw new Error(errors.join('\n'));
writeFileSync('src/data/players/2026-27.json',JSON.stringify(data,null,2)+'\n');
mkdirSync('docs/player-catalog',{recursive:true});
writeFileSync('docs/player-catalog/eligibility-unresolved.json',JSON.stringify({season:'2026-27',source:'NHL_PRIMARY_FALLBACK',reason:'Yahoo credentials/export not configured. No fantasy eligibility inferred.',players:players.map(p=>({nhlPlayerId:p.nhlPlayerId,name:p.fullName,primaryPosition:p.primaryPosition}))},null,2)+'\n');
console.log(JSON.stringify({count:players.length,unique:new Set(players.map(p=>p.nhlPlayerId)).size,fiala:players.find(p=>p.nhlPlayerId===8477942)}));
