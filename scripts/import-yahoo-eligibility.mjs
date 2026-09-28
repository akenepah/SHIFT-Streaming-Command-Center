/** Import a verified Yahoo export joined to NHL IDs; never fuzzy-match identities. */
import {readFileSync,writeFileSync} from 'node:fs';
const path=process.argv[2];if(!path)throw new Error('Usage: node scripts/import-yahoo-eligibility.mjs verified-export.json');
const rows=JSON.parse(readFileSync(path,'utf8'));
const catalog=JSON.parse(readFileSync('src/data/players/2026-27.json','utf8'));
const ids=new Set(catalog.players.map(p=>p.nhlPlayerId)),seen=new Set(),yahoo=new Set();
const allowed=['C','LW','RW','D','G'];
if(!Array.isArray(rows))throw new Error('Expected export array');
for(const row of rows){
 if(!ids.has(row.nhlPlayerId)||seen.has(row.nhlPlayerId))throw new Error('Unknown or duplicate NHL ID');
 if(typeof row.yahooPlayerId!=='string'||!row.yahooPlayerId||yahoo.has(row.yahooPlayerId))throw new Error('Missing/duplicate Yahoo ID');
 if(row.season!=='2026-27'||typeof row.sourceUrl!=='string'||!/^https:\/\/(?:[a-z0-9-]+\.)*yahoo\.com\//i.test(row.sourceUrl))throw new Error('Current Yahoo provenance required');
 if(!Array.isArray(row.eligiblePositions)||!row.eligiblePositions.length||row.eligiblePositions.some(p=>!allowed.includes(p))||(row.eligiblePositions.includes('G')&&row.eligiblePositions.length>1))throw new Error('Invalid eligibility');
 row.eligiblePositions=allowed.filter(p=>row.eligiblePositions.includes(p));seen.add(row.nhlPlayerId);yahoo.add(row.yahooPlayerId);
}
rows.sort((a,b)=>a.nhlPlayerId-b.nhlPlayerId);
writeFileSync('src/data/players/yahoo-eligibility.json',JSON.stringify(rows,null,2)+'\n');
writeFileSync('docs/player-catalog/eligibility-unresolved.json',JSON.stringify({season:'2026-27',source:'NHL_PRIMARY_FALLBACK',players:catalog.players.filter(p=>!seen.has(p.nhlPlayerId)).map(p=>({nhlPlayerId:p.nhlPlayerId,name:p.fullName}))},null,2)+'\n');
console.log({resolved:rows.length,unresolved:catalog.players.length-rows.length,dual:rows.filter(r=>r.eligiblePositions.length===2).length,tri:rows.filter(r=>r.eligiblePositions.length===3).length});
