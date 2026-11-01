import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {createRequire} from "node:module";
import net from "node:net";
import tls from "node:tls";
import dns from "node:dns";
import nodemailer from "nodemailer";
import "../../scripts/register-server-only.mjs";
const {renderVerificationEmail, VERIFICATION_EMAIL_TEMPLATE} = await import("../../lib/product-auth/verification-email.server.ts");
const {createVerificationMailer} = await import("../../lib/product-auth/smtp.server.ts");
const {ProductAuthError} = await import("../../lib/product-auth/secrets.server.ts");
const now = new Date("2026-10-29T12:00:00Z"), expiry = new Date("2026-10-29T12:05:00Z");
const payload = {email:"o'neal@example.invalid", otp:"004281"};
const environment = {PRODUCT_SMTP_HOST:"smtp.example.invalid", PRODUCT_SMTP_PORT:"587", PRODUCT_SMTP_TLS_MODE:"starttls",
  PRODUCT_SMTP_USERNAME:"synthetic-user", PRODUCT_SMTP_PASSWORD:" Synthetic SMTP credential ",
  PRODUCT_SMTP_FROM_ADDRESS:"sender@example.invalid", PRODUCT_SMTP_FROM_NAME:"Synthetic StitchTrack Sender"};
function fixture(info={accepted:[payload.email],rejected:[]}, env=environment) {
  const calls=[];
  const mailer=createVerificationMailer(env, options=>{calls.push({options});return {sendMail:async message=>{calls.at(-1).message=message;if(info instanceof Error)throw info;return info;}};},()=>new Date(now));
  return {mailer,calls};
}
const fixedError = code => error => error instanceof ProductAuthError && error.code===code && error.cause===undefined;

test("branded multipart content preserves leading zeros, expiry and semantic structure without external assets",()=>{
  const message=renderVerificationEmail(payload,expiry);
  for(const part of [message.text,message.html]) {
    assert.ok(part.includes("004281"));assert.match(part,/five minutes from issue/u);
    assert.match(part,/Delivery delays do not extend/u);assert.match(part,/Do not share/u);
    assert.match(part,/If you did not request/u);assert.match(part,/13:05:00.*WAT/u);
    assert.doesNotMatch(part,/account (?:created|verified)|legally binding/iu);
  }
  assert.match(message.html,/<html lang="en">/u);assert.match(message.html,/<h1[^>]*>Verify your email address<\/h1>/u);
  assert.match(message.html,/role="presentation"/u);assert.match(message.html,/DM Sans/u);
  assert.match(message.html,/width:100%;max-width:560px/u);
  assert.doesNotMatch(message.html,/<script|<form|<img|@import|@font-face|https?:|var\(--/iu);
  assert.ok(message.html.includes("o&#39;neal@example.invalid"));assert.ok(message.text.includes(payload.email));
  assert.equal(message.recipient,payload.email);assert.equal(VERIFICATION_EMAIL_TEMPLATE,"tailor-verification-v1");
  const registration=readFileSync(new URL("../../lib/product-auth/registration.server.ts",import.meta.url),"utf8");
  assert.ok(registration.includes('templateVersion: "'+VERIFICATION_EMAIL_TEMPLATE+'"'));
  assert.doesNotMatch(registration,/smtp\.server|verification-email\.server/u);
});
test("malformed/injected codes, multiple recipients, noncanonical email and invalid expiry are refused",()=>{
  for(const value of [{...payload,otp:4281},{...payload,otp:"4281"},{...payload,otp:"0042810"},
    {...payload,otp:"??????"},{...payload,otp:'<script>alert(1)</script>'},{...payload,otp:"004281\r\nBcc: other@example.invalid"},
    {...payload,email:"a@example.invalid,b@example.invalid"},{...payload,email:"X@EXAMPLE.INVALID"},
    {...payload,email:"<img src=x>@example.invalid"},{...payload,extra:"unexpected"}]) {
    assert.throws(()=>renderVerificationEmail(value,expiry),fixedError("email_invalid_message"));
  }
  assert.throws(()=>renderVerificationEmail(payload,new Date("invalid")),fixedError("email_invalid_message"));
});
test("missing or insecure SMTP configuration fails before any factory call",()=>{
  let calls=0;const factory=()=>{calls++;throw new Error("Must not construct");};
  for(const key of Object.keys(environment)) assert.throws(()=>createVerificationMailer({...environment,[key]:undefined},factory),fixedError("email_configuration_unavailable"));
  for(const edit of [{PRODUCT_SMTP_PORT:"0"},{PRODUCT_SMTP_PORT:"65536"},{PRODUCT_SMTP_HOST:"localhost"},
    {PRODUCT_SMTP_HOST:"smtp://smtp.example.invalid"},{PRODUCT_SMTP_HOST:"127.0.0.1"},{PRODUCT_SMTP_TLS_MODE:"none"},
    {PRODUCT_SMTP_PORT:"465"},{PRODUCT_SMTP_FROM_NAME:"Sender\r\nBcc: victim@example.invalid"},
    {PRODUCT_SMTP_FROM_ADDRESS:"one@example.invalid,two@example.invalid"},{PRODUCT_SMTP_USERNAME:" "},{PRODUCT_SMTP_PASSWORD:""}]) {
    assert.throws(()=>createVerificationMailer({...environment,...edit},factory),fixedError("email_configuration_unavailable"));
  }
  assert.equal(calls,0);
});
test("construction is inert; explicit SMTP acceptance returns only a fixed result with secure options",async()=>{
  const f=fixture();assert.equal(f.calls.length,0);
  assert.deepEqual(await f.mailer.sendVerification(payload,expiry),{status:"accepted"});assert.equal(f.calls.length,1);
  const {options,message}=f.calls[0];
  assert.equal(options.host,environment.PRODUCT_SMTP_HOST);assert.equal(options.port,587);
  assert.equal(options.secure,false);assert.equal(options.requireTLS,true);
  assert.deepEqual(options.tls,{servername:environment.PRODUCT_SMTP_HOST,rejectUnauthorized:true,minVersion:"TLSv1.2"});
  assert.equal(options.auth.pass,environment.PRODUCT_SMTP_PASSWORD);
  for(const field of ["pool","logger","debug"])assert.equal(options[field],false);
  for(const field of ["disableFileAccess","disableUrlAccess"]) {assert.equal(options[field],true);assert.equal(message[field],true);}
  assert.equal(options.connectionTimeout,10_000);assert.equal(options.socketTimeout,20_000);
  assert.deepEqual(message.envelope,{from:environment.PRODUCT_SMTP_FROM_ADDRESS,to:[payload.email]});
  assert.deepEqual(message.to,{address:payload.email});assert.equal(message.from.name,environment.PRODUCT_SMTP_FROM_NAME);
  assert.equal(Object.hasOwn(message,"recipient"),false);assert.equal(Object.hasOwn(message,"attachments"),false);
});
test("implicit TLS and address-object SMTP acceptance are supported",async()=>{
  const f=fixture({accepted:[{address:payload.email}],rejected:[]},{...environment,PRODUCT_SMTP_PORT:"465",PRODUCT_SMTP_TLS_MODE:"implicit"});
  assert.deepEqual(await f.mailer.sendVerification(payload,expiry),{status:"accepted"});
  assert.equal(f.calls[0].options.secure,true);assert.equal(f.calls[0].options.requireTLS,false);
});
test("SMTP rejection never becomes success; ambiguous/malformed results fail closed without retries",async()=>{
  const f=fixture({accepted:[],rejected:[payload.email]});
  await assert.rejects(f.mailer.sendVerification(payload,expiry),fixedError("email_delivery_rejected"));assert.equal(f.calls.length,1);
  for(const result of [{},null,{accepted:[],rejected:[]},{accepted:["other@example.invalid"],rejected:[]},
    {accepted:[payload.email],rejected:[payload.email]},{accepted:[payload.email,"other@example.invalid"],rejected:[]}]) {
    const f=fixture(result);await assert.rejects(f.mailer.sendVerification(payload,expiry),fixedError("email_delivery_unconfirmed"));assert.equal(f.calls.length,1);
  }
});
test("transport/provider errors are sanitized and credentials, recipient and OTP are never logged or returned",async t=>{
  const logs=[];for(const method of ["log","warn","error","debug","info"])t.mock.method(console,method,(...args)=>logs.push(args));
  const native=new Error([environment.PRODUCT_SMTP_PASSWORD,payload.otp,payload.email].join(" "));
  native.response="Synthetic provider response containing secrets";
  const f=fixture(native);
  await assert.rejects(f.mailer.sendVerification(payload,expiry),error=>{
    assert.ok(fixedError("email_delivery_unconfirmed")(error));
    for(const secret of [environment.PRODUCT_SMTP_PASSWORD,payload.otp,payload.email,native.response])assert.ok(!String(error.stack).includes(secret));
    assert.ok(!JSON.stringify(error).includes(payload.otp));return true;
  });
  const broken=createVerificationMailer(environment,()=>{throw native;},()=>now);
  await assert.rejects(broken.sendVerification(payload,expiry),fixedError("email_delivery_unconfirmed"));
  assert.deepEqual(logs,[]);assert.equal(f.calls.length,1);
});
test("expired or excessive future deadlines are rejected before SMTP; no new lifetime starts at sending",async()=>{
  for(const deadline of [now,new Date(now.getTime()-1),new Date(now.getTime()+300_001)]) {
    const f=fixture();await assert.rejects(f.mailer.sendVerification(payload,deadline),fixedError("email_invalid_message"));assert.equal(f.calls.length,0);
  }
});

test("installed Nodemailer binding is import/construction-lazy and runs real MIME generation with offline SMTP stub",async t=>{
  const require=createRequire(import.meta.url);
  const metadata=JSON.parse(readFileSync(require.resolve("nodemailer/package.json"),"utf8"));
  assert.equal(metadata.version,"10.2.1");
  let networkCalls=0;
  const deny=()=>{networkCalls++;throw new Error("Network is forbidden in the binding test");};
  t.mock.method(net.Socket.prototype,"connect",deny);t.mock.method(tls,"connect",deny);
  for(const name of ["lookup","resolve4","resolve6"])t.mock.method(dns,name,deny);
  const realCreate=nodemailer.createTransport;let constructions=0, sends=0, mime="";
  t.mock.method(nodemailer,"createTransport",options=>{
    constructions++;
    assert.equal(options.tls.rejectUnauthorized,true);assert.equal(options.requireTLS,true);
    assert.equal(options.auth.pass,environment.PRODUCT_SMTP_PASSWORD);
    const transport=realCreate(options);
    assert.equal(transport.transporter.name,"SMTP");
    // Exercise real sendMail/MIME/envelope handling; replace only the external
    // SMTP handoff. This acceptance is synthetic, not delivery evidence.
    t.mock.method(transport.transporter,"send",(mail,callback)=>{
      sends++;
      void (async()=>{
        const chunks=[];for await(const chunk of mail.message.createReadStream())chunks.push(Buffer.from(chunk));
        mime=Buffer.concat(chunks).toString("utf8");
        const envelope=mail.message.getEnvelope();
        assert.deepEqual(envelope.to,[payload.email]);
        callback(null,{accepted:envelope.to,rejected:[],envelope,messageId:mail.message.messageId(),response:"Synthetic offline acceptance"});
      })().catch(callback);
    });
    return transport;
  });
  const fresh=await import("../../lib/product-auth/smtp.server.ts?offline-binding-import");
  assert.equal(constructions,0);assert.equal(sends,0);
  const mailer=fresh.createVerificationMailer(environment,undefined,()=>now);
  assert.equal(constructions,0);
  assert.throws(()=>fresh.createVerificationMailer({}),fixedError("email_configuration_unavailable"));
  assert.equal(constructions,0);
  assert.deepEqual(await mailer.sendVerification(payload,expiry),{status:"accepted"});
  assert.equal(constructions,1);assert.equal(sends,1);assert.equal(networkCalls,0);
  assert.match(mime,/multipart\/alternative/u);assert.match(mime,/Content-Type: text\/plain/u);assert.match(mime,/Content-Type: text\/html/u);
  assert.match(mime,/004281/u);assert.match(mime,/Subject: Verify your StitchTrack email address/u);
  assert.ok(!mime.includes(environment.PRODUCT_SMTP_PASSWORD));
});
test("default Nodemailer factory failure remains lazy and sanitized",async t=>{
  let calls=0;
  t.mock.method(nodemailer,"createTransport",()=>{calls++;throw new Error(environment.PRODUCT_SMTP_PASSWORD+" "+payload.otp);});
  const mailer=createVerificationMailer(environment,undefined,()=>now);
  assert.equal(calls,0);
  await assert.rejects(mailer.sendVerification(payload,expiry),error=>{
    assert.ok(fixedError("email_delivery_unconfirmed")(error));
    assert.ok(!String(error.stack).includes(environment.PRODUCT_SMTP_PASSWORD));assert.ok(!String(error.stack).includes(payload.otp));return true;
  });
  assert.equal(calls,1);
});
