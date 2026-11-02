import {createStore} from "zustand/vanilla";
export type ResetStep="request"|"code"|"password";
type AuthFlow={email:string;resetStep:ResetStep;rememberEmail:(email:string)=>void;step:(step:ResetStep)=>void;clear:()=>void};
// Per mounted /auth screen, never a server singleton, URL, cookie or persisted store.
// Secrets deliberately have no place in this shared state.
export function createAuthFlowStore(email=""){
 return createStore<AuthFlow>()(set=>({email,resetStep:"request",rememberEmail:email=>set({email}),
  step:resetStep=>set({resetStep}),clear:()=>set({email:"",resetStep:"request"})}));
}
export type AuthFlowStore=ReturnType<typeof createAuthFlowStore>;
