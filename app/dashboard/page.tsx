import type {Metadata} from "next";
import {headers} from "next/headers";
import {notFound,redirect} from "next/navigation";
import {loadDashboardAccess} from "../../lib/product-auth/dashboard.server.ts";
import Dashboard from "./Dashboard";
export const metadata:Metadata={title:"Tailor dashboard | StitchTrack",robots:{index:false,follow:false}};
export const dynamic="force-dynamic";
export default async function DashboardPage(){
  const request=await headers();
  const access=await loadDashboardAccess(request.get("host"),request.get("cookie"));
  if(access.kind==="disabled")notFound();
  if(access.kind==="login")redirect("/auth?login");
  if(access.kind!=="ready")throw new Error("Dashboard is temporarily unavailable.");
  return <Dashboard initialSession={access.session} origin={access.origin} accountDeletionEnabled={access.accountDeletionEnabled} passwordResetEnabled={access.passwordResetEnabled}/>;
}
