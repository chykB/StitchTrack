// Fixed synthetic fixtures only, shared by the owner HTTP driver and isolated server fixture.
export const VALIDATION_TIMING_MARKER="validation-timing-v1";
export const timingFixtures=Object.freeze({
  signup:Object.freeze({name:"Synthetic Tailor",email:" Timing+Demo@EXAMPLE.INVALID ",password:" Synthetic timing phrase "}),
  login:Object.freeze({email:" Timing+Demo@EXAMPLE.INVALID ",password:" Synthetic timing phrase "}),
  reset:Object.freeze({email:" Timing+Demo@EXAMPLE.INVALID "}),
});
export type TimingOperation=keyof typeof timingFixtures;
export function matchesTimingFixture(operation:TimingOperation,input:unknown):boolean {
  const expected=timingFixtures[operation];
  if(!input || typeof input!=="object" || Array.isArray(input))return false;
  const value=input as Record<string,unknown>;
  return Object.keys(value).length===Object.keys(expected).length && Object.entries(expected).every(([key,v])=>
    Object.hasOwn(value,key) && value[key]===v);
}
