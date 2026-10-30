# Task Four: interview answers

The owner supplied these exact 19 questions in order during documentation completion. Answers distinguish implemented/internal tests, assessment fixtures and proposed production controls. No personal experience or new measurement is invented. Each answer is at most 200 words.

## A. Password hashing (Questions 1-5)

### 1. Why should you hash passwords?

Hashing lets a service check a password without retaining the original. At registration, StitchTrack derives an Argon2id hash with a fresh salt. At verification, the library uses the encoded parameters and salt to test the submitted password. It does not decrypt the stored value.

That reduces the damage of a stolen credential table, but does not make it harmless. Attackers can guess candidate passwords offline and compare their results. Weak passwords may still be recovered, so hashing must be deliberately expensive and supported by breach screening and other controls. Password hashes must also be protected from logs and unnecessary access.

StitchTrack preserves the exact accepted password, including meaningful spaces and Unicode differences. The owner tested internal registration and verification; the public forms are not yet connected to a working sign-in service.

### 2. Why use bcrypt instead of SHA-256 for passwords?

Bcrypt is designed to make password guesses expensive, with an adjustable cost. SHA-256 is a fast general-purpose digest. Its speed is useful for other purposes but lets an attacker test many password guesses cheaply after stealing a table. Adding a random salt prevents shared precomputation, but does not fix that speed problem.

StitchTrack actually selected Argon2id, rather than bcrypt. It adds a configurable memory cost as well as computation cost, increasing the resources required for parallel guessing. Our initial profile uses 64 MiB, three passes and one lane.

Bcrypt can still be a reasonable supported password-hashing choice, but its implementation and input-length behavior need care. I would not silently truncate StitchTrack passwords or switch algorithms. The existing choice must preserve accepted characters and be calibrated on deployment hardware.

### 3. What is a salt and why do you need it?

A salt is a random value generated separately for each password hash. It is stored with the hash and does not need to be secret. Verification needs it to repeat the same calculation for the submitted password.

If two people choose the same password, fresh salts normally produce different encoded hashes. This prevents simple equality comparisons between stored hashes and makes precomputed lookup tables much less reusable. An attacker must still work against each salted target.

StitchTrack generates a fresh 16-byte salt with cryptographic randomness. Evidence 07 shows the same synthetic password producing different Argon2id hashes, both verifying successfully. Salt is not an encryption key, a substitute for a slow algorithm, or a way to strengthen a weak password by itself. An offline attacker can still guess using the publicly stored salt.

### 4. What salt rounds, or what work factor, should you use? Give a number and defend it.

For StitchTrack's current Argon2id implementation, the numbers are 65,536 KiB of memory, three passes, parallelism one and a 32-byte output, with a fresh 16-byte salt. These are Argon2 parameters, not bcrypt salt rounds. The encoded version is 19.

On the owner's machine, five sequential operations averaged 125.815770 milliseconds each. That gives a concrete starting point: password checking is noticeably costly, while one interactive request remains practical in that local test. It is not production calibration.

Before public use I would measure concurrent hashing and verification on the actual deployment hardware, including memory and worker-pool contention. Excessive cost can create an availability problem. Raising parameters also needs an accepted-profile and rehash plan so existing users are not locked out. There is no universal work factor that stays correct on every machine forever.

### 5. You are storing user passwords in a database. Of plain text, SHA-256, AES-256 encryption and adaptive hashing, which is correct and why are the other three wrong? Note that one of the three wrong answers is wrong for a different reason from the other two.

Adaptive password hashing is the correct category: StitchTrack uses salted Argon2id. It supports password checking while making each offline guess costly. The salt and work parameters can be stored with its output.

Plain text gives a database thief the passwords immediately. SHA-256 is one-way, but is deliberately fast, so a thief can test likely passwords cheaply; a salt does not remove that weakness.

AES-256 is different: it is reversible encryption, not an unsuitable one-way hash. Anyone obtaining the decryption key can recover the stored passwords, and the authentication system does not need that recovery capability. Encryption has legitimate uses elsewhere: StitchTrack encrypts queued verification-email payloads because a sender needs to recover their contents. That does not make reversible password storage appropriate. Adaptive hashing still needs protected storage, strong passwords and a reviewed cost.

## B. Server-side validation (Questions 6-11)

### 6. Why is client-side validation not enough?

The browser is controlled by the requester. Someone can remove required attributes, change JavaScript, edit a request or skip the interface and send HTTP directly. Good browser feedback prevents mistakes; it cannot establish trust at the server boundary.

Task Three demonstrated this with a deliberately synthetic local fixture returning HTTP 200. Task Four's validation-only Signup boundary rejected the malformed direct payload with HTTP 422. These were different endpoints with different purposes, not a vulnerable registration endpoint repaired in place.

The server must validate the actual received data before account logic and persistence, then enforce transactional and authorization rules. A parsed email is not proof of email control. Our internal registration service validates input and records its dependent writes together, but public registration, Login and Reset are still not functionally wired.

### 7. What security checks belong in the frontend, and what must the server enforce regardless?

The frontend should explain required fields, likely email mistakes, password guidance and correction steps accessibly. It should associate errors with inputs, preserve useful focus and avoid accidental submission. StitchTrack's visible guarded button helps users understand incomplete input; it does not secure the backend.

The server independently enforces types, accepted fields, request bounds, canonical email, the current password policy, required approved Terms version and verification lifecycle. It must check credentials, business authorization, invitation scope and allowed state transitions, regardless of what the browser displayed. Uniqueness and related writes also need database constraints and transactions.

Passwords must remain unchanged across registration and sign-in. The local draft acknowledgement is not approved Terms acceptance. Shared Zod schemas reduce drift, but the public credential previews still return unavailable, and production abuse controls and complete session/recovery integration remain outstanding.

### 8. The user interface hides the delete button for non-administrators. Is that enough? If not, what does an attacker do instead?

No. A hidden button does not prevent the underlying operation. An attacker can inspect the application or observe a request, then send the same HTTP method and resource identifier directly. A disabled control or frontend role flag has the same limitation.

The server must authenticate the requester and authorize that specific operation on that specific record. In StitchTrack V1, the meaningful boundary is authorized tailor/client access and business ownership, not an invented administrator role. A tailor must not delete or change another business's records merely by learning an ID.

Some actions are prohibited even for an otherwise authorized owner: approved agreements and recorded payments cannot simply disappear. The server needs the permitted correction or change workflow, preserving history. Authentication, authorization and domain integrity are separate checks; visibility only helps present the available actions.

### 9. What is the difference between validation, encoding and sanitisation?

Validation asks whether input fits the operation's rules. For example, StitchTrack accepts a verification code only as exactly six ASCII digits and requires a nonblank Signup name. It should reject invalid input rather than pretend it was acceptable.

Encoding represents data safely in an output context. The email renderer escapes dynamic HTML text so characters cannot become markup. HTML encoding is not the same as SQL protection; database queries need parameterized values rather than string concatenation.

Sanitisation removes or restricts unwanted content when an operation actually permits that transformation, such as a carefully defined rich-text allow-list. It is not a universal replacement for validation or encoding. Email trim/lowercase is explicit canonicalization. Passwords must not be silently sanitised or normalized: their spaces and Unicode representation are meaningful. Valid text can still require output encoding.

### 10. Why would you replace the incoming request body with the parsed and validated data rather than leaving both available?

A validation schema may transform input as well as reject it. StitchTrack trims and lowercases email in parsed output while preserving the accepted password. If downstream code keeps using the original body, it can bypass those transformations or accidentally consume fields that the operation did not accept.

The application should keep the raw body confined to parsing and validation, then pass only the typed successful result into domain logic. Our request boundary forwards a discriminated ValidatedAuth value with parsed data to its callback. The registration service also parses its own complete input contract before proceeding.

This does not mean request bytes cease to exist in memory or should be logged for comparison. It means there is one trusted application representation. Database uniqueness, Terms approval, verification and authorization still need their own checks after syntactic validation.

### 11. Why validate route parameters and query strings, not just the body?

Route and query values are also attacker-controlled input. They can select a different mode, identify another person's record or alter pagination and resource use. Validating only the JSON body leaves those other entry points unexamined.

StitchTrack uses a strict auth URL contract: supported key-only states such as /auth?signup or /auth?verify are accepted, while unknown, valued, repeated or conflicting parameters are rejected with genuine 404 behavior. That keeps document and RSC handling consistent and avoids ambiguous mode selection.

For future business resources, the server must validate an identifier's shape and then separately check that the current user is authorized for the referenced record. A well-formed UUID is not permission. Request methods, headers and body bounds also matter. Validation should cover the complete operation contract without treating a valid route as evidence of ownership.

## C. Rate limiting (Questions 12-16)

### 12. How do you rate limit unauthenticated requests, and what is the problem with the header you would reach for first?

Before authentication, I can limit by a reliably established source IP, combined with account/email controls when that identifier is available. The tempting header is X-Forwarded-For, but a caller can forge it if the application trusts arbitrary forwarded headers.

Only a known ingress should supply trusted forwarding information, with clear stripping and proxy-chain rules. The application's peer may be the proxy rather than the user; that must be configured, not guessed. Our local assessment adapter uses the actual socket peer because the existing Next request interface does not reliably supply that peer itself.

Evidence 14 changed the real loopback source from 127.0.0.1 to 127.0.0.2. The new peer was admitted while the original remained blocked in the same process. This proves an IP-only limitation, not successful authentication or permission to trust a header.

### 13. Which rate limiting algorithm would you choose for a production API, and what is the boundary burst problem?

I would propose a token bucket with atomic shared state for the production authentication API. The bucket allows a defined small burst and refills at a controlled rate. Different registration, login, reset and OTP operations need separately justified policies. This is a recommendation, not an implemented production control.

The assessment adapter currently uses fixed windows. A fixed window can admit its full allowance just before a boundary and another full allowance immediately afterward, producing nearly twice the intended short-term burst. Token buckets make burst capacity explicit; they do not mean requests are perfectly evenly spaced. A sliding-window design is another defensible option if exact rolling-window behavior is needed.

Whichever algorithm is chosen, updates must be atomic across instances. IP-only limits still miss distributed abuse and can inconvenience people sharing an office or campus connection, so account controls and monitoring remain necessary.

### 14. Why use a shared store for your counters rather than in-memory counters on each server?

Each server's memory contains only the requests that server has seen. With several application instances, a requester can spread traffic between them and obtain several separate allowances. Restarting an instance also loses its counters. Our single-process assessment limiter deliberately has these limitations.

A shared store lets all relevant instances consult the same counter or bucket. The check and update must be atomic; separate read-then-write operations can lose concurrent increments and admit extra traffic. Keys need appropriate expiry and scope, without exposing raw email addresses unnecessarily.

Shared storage costs network time, money and operational work. It also introduces an outage dependency, so timeout and failure policies must be explicit. Merely adding a database table does not solve concurrency. StitchTrack still needs an approved shared-counter implementation and trusted ingress integration before exposing functional public authentication.

### 15. What HTTP status code should a rate limiter return, and why is 403 the wrong choice?

A rate limiter should return HTTP 429 Too Many Requests. It tells the requester that the current allowance has been exceeded and that waiting may help. Our assessment responses include Retry-After and rate-limit information, with a safe message and no credential echo.

HTTP 403 means the request is forbidden under the authorization policy. It is misleading for an otherwise permitted action that is temporarily throttled; waiting does not usually change an authorization decision. A malformed request may deserve 400 or 422 instead, depending on where it failed.

Status codes should match the real outcome. Evidence 13 records the triggered limit, and Evidence 14 records an admitted synthetic request from a different actual source IP. That HTTP 200 means the assessment adapter admitted the request, not that an account or session was created. Client retries should respect backoff rather than flood the endpoint.

### 16. What do you do when your rate limit store is unavailable: fail open or fail closed? Answer for your own application specifically.

For StitchTrack's intended public authentication, my recommendation is fail closed if the shared rate-limit decision cannot be obtained: do not issue a code, attempt unrestricted sign-in or create an account. Return a generic temporary-unavailable response, normally 503, rather than claiming a known limit was exceeded with 429. The actual shared-store outage policy is not wired yet.

The reason is that registration and recovery consume resources, and repeated authentication or code guesses threaten private business records. An outage must not silently remove the control. The trade-off is that legitimate users can temporarily lose access, so storage availability, bounded timeouts, monitoring and recovery procedures matter.

That does not automatically require shutting down unrelated public information or already-authorized operations. Their dependencies need separate analysis. A fallback that permits unlimited requests would defeat the policy; any emergency alternative needs explicit review and enforceable bounds.

## D. Questions about the actual work (Questions 17-19)

### 17. You have two timing numbers for hashing, from your own machine. Walk me through what they mean for an attacker who has stolen your user table.

The owner's sequential benchmark measured five Argon2id operations in 629.078850 ms: 125.815770 ms each, about 7.948 operations per second. SHA-256 took 204.225886 ms for 100,000 operations: about 0.002042 ms each and 489653.892 operations per second. The arithmetic is count times 1000 divided by total milliseconds.

A thief with the credential hashes can guess offline, without contacting StitchTrack. The comparison shows why a fast digest makes guessing cheap and why Argon2id adds deliberate CPU/memory cost. Our credential hashes live in Account, linked to User; stealing only a profile table is a different exposure.

These are application timings on one local machine, not attacker GPU throughput, production concurrency or a cracking prediction. Hashes include fresh salts, encoding and scheduling overhead. Salts require per-target work but do not prevent guessing. Evidence 07/08 preserves the actual results; no measurements were rerun for this answer.

### 18. How does a breached password check avoid sending the password anywhere? Explain the mechanism in your own words, then say what the naive version would leak.

The server calculates SHA-1 locally from the exact submitted password and sends only the first five uppercase hexadecimal characters to the HIBP range API. The response contains suffixes and occurrence counts for that prefix. StitchTrack compares the remaining digest portion locally; a matching positive count means rejection. SHA-1 here is a lookup protocol, never credential storage.

The request does not contain the password, email or full digest. Padding reduces response-size information, but the provider can still observe the prefix and connection metadata; this is limited disclosure, not anonymity. Timeouts and malformed responses fail closed.

A naive service might send plaintext passwords to an external checker or put them in URLs and logs. Sending the full unsalted digest is also unnecessary disclosure and can enable cheap candidate matching. The code never trims passwords, and the screenshot proves rejection at the preview boundary, not completed registration.

### 19. Wrong-answer analysis. A candidate says: "I hash passwords with SHA-256 plus a random salt per user, which means even if the database is stolen the passwords cannot be reversed, because hashing is one-way. I also rate limit login attempts by IP, so brute force is not possible." Every sentence contains something true. Say what is wrong, in order of severity, and what the candidate has misunderstood about the threat model.

Most severely, the candidate mixes up offline and online attacks. After stealing hashes, an attacker guesses locally; login rate limiting never sees those guesses. SHA-256 remains cheap even with salts, so it is inappropriate password storage. Salt prevents identical outputs and shared precomputation, not efficient per-user guessing. Use a reviewed adaptive password hash such as StitchTrack's Argon2id.

Next, one-way does not mean unguessable. Attackers do not need to reverse the hash mathematically: they hash likely passwords and compare. Weak passwords can still fall despite salting.

Finally, IP limiting cannot make online brute force impossible. Attackers can distribute requests across real addresses, while legitimate users share addresses. Our controlled source-IP bypass demonstrates that limitation. Account-aware controls, trusted proxy handling, shared counters, verification attempt limits and monitoring are also needed. None removes the need to protect the hashes and calibrate password-hashing cost.

Sources for the actual work: [hashing and arithmetic](hashing.md), [validation boundary](validation-placement.md), [source-IP evidence](../evidence/14-rate-limit-defeated.txt), [breach checker](breach-check.md), [OTP evidence](verification-design.md#owner-executed-otp-results) and [remaining product gaps](defects.md).

Assumptions: none. Proposed production limiter choices still require owner review.
