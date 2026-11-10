// Offline server markup/source contracts. Actual Next.js browser checks are separate.
import test from "node:test";
import assert from "node:assert/strict";
import {createElement} from "react";
import {renderToStaticMarkup} from "react-dom/server";
import {readFileSync,existsSync} from "node:fs";
import {AuthScreen} from "./rendering.mjs";
const {default:HomePage}=await import("../../app/page.tsx");
const {default:RootLayout}=await import("../../app/layout.tsx");
const page=async()=>renderToStaticMarkup(createElement(RootLayout,null,await HomePage()));
test("approved homepage stays public, semantic and connected to existing authentication destinations",async()=>{
 const html=await page();assert.match(html,/<html lang="en"/u);assert.match(html,/href="#main">Skip to content/u);assert.match(html,/<main[^>]*id="main"/u);assert.equal((html.match(/<h1\b/gu)||[]).length,1);
 assert.match(html,/aria-label="StitchTrack home"/u);assert.match(html,/aria-label="Homepage navigation"/u);assert.match(html,/aria-label="Account navigation"/u);
 for(const href of ["/auth?signup","/auth?login","/#how-it-works","/#workspace-preview"])assert.ok(html.includes('href="'+href+'"'),href);
 assert.match(html,/>Your craft deserves more than scattered records\.<\/h1>/u);assert.match(html,/StitchTrack is designed to help independent tailors/u);
 const source=readFileSync(new URL("../../app/page.tsx",import.meta.url),"utf8");assert.doesNotMatch(source,/use client|session\.server|Prisma|cookies\(|headers\(|fetch\(|process\.env|localStorage/u);
});
test("copy matches the approved sections and all local navigation targets exist",async()=>{
 const html=await page();
 for(const copy of ["Beautiful work needs clear communication.","Details in too many places","Changes can get messy","Different expectations","From first measurement to final delivery.","Capture the details","Agree with confidence","Keep work moving","Every detail, connected to the garment.","Spend more time creating.","Less time searching."])assert.ok(html.includes(copy),copy);
 for(const id of ["how-it-works","workspace-preview"])assert.ok(html.includes('id="'+id+'"'));
 const paths=[...html.matchAll(/<a\b[^>]*href="([^"]+)"/gu)].map(m=>m[1]);assert.ok(paths.every(path=>["/","/auth?signup","/auth?login","#main","#how-it-works","/#how-it-works","/#workspace-preview"].includes(path)));
 assert.match(html,/<footer\b/u);assert.match(html,/>Terms and Privacy<\/button>/u);assert.doesNotMatch(html,/testimonials|trusted by|free forever|guaranteed|href="\/(terms|privacy)"|Why tailors use StitchTrack|Stay more organized|Illustrative workspace · Sample data/iu);
});
test("fictional sample orders remain static with agreement, progress and delivery columns",async()=>{
 const html=(await page()).replace(/<button[^>]*>Terms and Privacy<\/button>/u,""); assert.match(html,/Sample order/u);assert.match(html,/>Sample data<\/span>/u);
 assert.match(html,/<table/u);assert.match(html,/<caption[^>]*>Fictional garment orders/u);
 for(const name of ["Amina Bello","Chidi Okoro","Midi dress","Two-piece set","Awaiting approval","Approved","In progress","Fitting next","18 Nov","21 Nov"])assert.ok(html.includes(name),name);
 assert.equal((html.match(/<tbody><tr|<\/tr><tr/gu)||[]).length,2);
 assert.doesNotMatch(html,/<form|<input|<button|hmac-sha256|@example|sessionId|password=/iu);
 assert.match(html,/<svg[^>]*aria-hidden="true"[^>]*focusable="false"/u);
});
test("photographic assets are local and recorded as original generated illustrations",async()=>{
 const html=await page();assert.match(html,/src="\/images\/atelier-hero\.webp"/u);assert.match(html,/alt="Burgundy dress form/u);assert.match(html,/fetchPriority="high"/iu);
 for(const file of ["atelier-hero.webp","wine-fabric.webp"])assert.ok(existsSync(new URL('../../public/images/'+file,import.meta.url)));
 const note=readFileSync(new URL('../../public/images/README.md',import.meta.url),'utf8');assert.match(note,/AI-generated photographic illustrations/u);assert.match(note,/not documentary photographs/u);
});
test("responsive homepage uses Tailored Wine tokens and scopes shared-header presentation to itself",async()=>{
 const css=readFileSync(new URL("../../app/page.module.css",import.meta.url),"utf8"),global=readFileSync(new URL("../../app/globals.css",import.meta.url),"utf8"),tokens=readFileSync(new URL("../../task-01-design-system/assets/stitchtrack-tokens.css",import.meta.url),"utf8");
 for(const match of css.matchAll(/var\((--stitchtrack-[a-z0-9-]+)/gu))assert.ok(tokens.includes(match[1]+":"),match[1]);
 assert.match(css,/max-width: 1240px/u);assert.match(css,/100vw - 40px/u);assert.match(css,/100vw - 64px/u);assert.match(css,/clamp\(128px, 13\.8889vw, 200px\)/u);assert.match(css,/minmax\(0, 1fr\)/u);assert.match(css,/min-height: 32px/u);
 assert.match(css,/:has\(\.main\)/u);assert.match(global,/\.homepage-nav \{ display: none;/u);assert.match(global,/a:focus-visible/u);assert.match(global,/DM Sans/u);assert.match(css,/\.closing a:focus-visible/u);assert.doesNotMatch(css,/@keyframes|animation:/u);
 assert.doesNotMatch(css,/steps li:not\(:last-child\)::after|dotted/u);
 const html=await page();assert.match(html,/<button[^>]*aria-haspopup="dialog"[^>]*>Terms and Privacy<\/button>/u);
 const pageSource=readFileSync(new URL("../../app/page.tsx",import.meta.url),"utf8"),dialogSource=readFileSync(new URL("../../app/LegalDocumentsDialog.tsx",import.meta.url),"utf8");
 assert.match(pageSource,/platform-terms-draft\.md/u);assert.match(pageSource,/privacy-policy-draft\.md/u);
 assert.match(dialogSource,/DraftDocument/u);assert.match(dialogSource,/showModal\(\)/u);assert.match(dialogSource,/Unapproved working draft/u);assert.match(dialogSource,/does not record acceptance/u);assert.match(dialogSource,/Terms of Service/u);assert.match(dialogSource,/Privacy Notice/u);assert.doesNotMatch(dialogSource,/<form|<input|legalAcknowledgement/u);
});
test("existing login presentation and confirmed dashboard navigation remain unchanged",()=>{
 const html=renderToStaticMarkup(createElement(AuthScreen,{mode:"login"}));assert.match(html,/Log in to access your tailor dashboard/u);
 const source=readFileSync(new URL("../../app/(auth)/auth/AuthScreen.tsx",import.meta.url),"utf8");assert.match(source,/router\.replace\(path\)/u);assert.doesNotMatch(source,/returnTo|searchParams\.get\("next"\)/u);
});
