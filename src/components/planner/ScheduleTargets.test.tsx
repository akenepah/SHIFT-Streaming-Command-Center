import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { ScheduleTargets } from "./ScheduleTargets";
import type { ScheduleTargetsResult } from "@/domain/scheduleTargets/scheduleTargets";
it.each([['past','This week has already ended.'],['no-games','No games remain'],['no-fit','No usable skater fits']] as const)("%s has passive honest copy", (status, text) => {
  const html=renderToStaticMarkup(<ScheduleTargets result={{status,effectiveDate:'2026-10-05',targets:[]}} onSelect={()=>{}} />);
  expect(html).toContain(text);expect(html).not.toContain('<button');
});
it('exposes team name and supporting reasons on a keyboard-accessible control',()=>{
  const result:ScheduleTargetsResult={status:'ready',effectiveDate:'2026-10-05',targets:[{teamAbbrev:'VAN',remainingGames:3,opportunityGames:1,opportunityDates:['2026-10-06'],remainingDates:['2026-10-06'],lowVolumeGames:1,backToBackCount:0,backToBackDates:[],score:1030400,reasons:['1 fit your lineup','1 low-volume night']}]};
  const html=renderToStaticMarkup(<ScheduleTargets result={result} onSelect={()=>{}} />);
  expect(html).toContain('type="button"');expect(html).toContain('Vancouver Canucks');expect(html).toContain('focus-visible:');expect(html).toContain('Very little streaming room');expect(html).not.toContain('1030400');
});
