# Task Two, Step 7: Independent README setup test

## Scope and evidence source

An independent tester successfully installed dependencies and ran the StitchTrack homepage on native Windows 10 using Command Prompt, without WSL or PostgreSQL.

This account records the verified observations and additional tester feedback supplied by the project owner for this documentation follow-up. No new installation, application run, security audit or database test was performed while writing it. No historical evidence was edited, and no new screenshot filename or verbatim tester statement is invented.

The walkthrough required troubleshooting assistance. It demonstrates an assisted installation and homepage launch from an existing clone, not an unaided, clean-machine reproduction of the revised README.

## Environment

| Item | Recorded value |
| --- | --- |
| Operating system | Native Windows 10 |
| Successful terminal | Command Prompt (CMD) |
| Initial Node.js | 26.5.0 |
| Selected Node.js | 24.22.1, using fnm |
| npm | 11.19.1 |
| Prisma Client generated | 7.10.1 |
| Next.js | 16.4.2 |
| WSL / PostgreSQL | Not required or used for the homepage test |

The repository requires Node.js 24.x. The initial 26.5.0 installation was outside that requirement; this does not establish that Node.js 26 caused the later EPERM failure. The fnm version and hardware specifications were not supplied.

## Genuine sequence and troubleshooting assistance

1. The tester initially had Node.js 26.5.0 and switched to Node.js 24.22.1 with fnm. npm was 11.19.1.
2. The owner reported confusion about version switching, restarting PowerShell and what to do next in an already-cloned repository. These are paraphrased observations, not direct quotes. Troubleshooting assistance addressed the terminal/version context and continuing setup; the successful retry used CMD.
3. An attempt to clone again failed because the repository already existed. The existing clone was retained and setup resumed there, rather than treating a second clone as necessary.
4. The initial `npm ci` failed with EPERM while removing a Next.js SWC binary. Installation was incomplete at that point.
5. Processes were closed and the incomplete `node_modules` installation was removed. The tester retried from the existing project in CMD.
6. The explicitly versioned install command succeeded:

   ```bat
   fnm exec --using=24.22.1 npm.cmd ci
   ```

   npm reported 177 packages installed, zero vulnerabilities and lifecycle-script warnings. The exact warning text was not supplied; this account does not claim that the warnings were resolved or that a separate `npm audit` command ran.
7. Prisma Client 7.10.1 generated successfully.
8. Next.js 16.4.2 reported Ready in 1731ms. The homepage GET returned HTTP 200 in 1209ms.
9. The supplied browser screenshot confirms that the homepage rendered at http://127.0.0.1:3000/.

Only the successful dependency-install command above was supplied verbatim. The README's generation and startup commands are reproducible instructions based on the project's existing npm scripts; they are not presented as a verbatim transcript of the tester's session.

## Final result and what it proves

The native Windows homepage run succeeded after assistance and dependency-install recovery. The rendered page, successful GET and server-ready output support that result. It did not require WSL, PostgreSQL, assessment database credentials or a migration.

The reported startup and GET timings describe this development-mode run. They are not a production benchmark, repeated measurement or proof that a performance target was met.

The developer's earlier WSL verification remains separate from this independent Windows CMD test. PowerShell was encountered during troubleshooting but was not the successful verified path.

## README corrections arising from the test

- Make CMD with fnm the recorded Windows setup path, explicitly selecting Node.js 24.22.1 for each npm invocation.
- Separate a new-clone step from resuming in an existing clone. A directory-already-exists error is not a reason to delete the repository or clone repeatedly.
- Explain a short EPERM recovery: stop relevant processes, remove only the incomplete project's `node_modules`, preserve `package-lock.json` and retry installation.
- Explain that PowerShell fnm initialization applies to the current session unless configured in its shell profile; explicit `fnm exec` selects a version for each command.
- Keep PowerShell syntax separate from CMD, recommend CMD when shell-related difficulties occur, and mark the PowerShell alternative as unverified.
- Distinguish shell syntax, a Node.js version mismatch, incomplete dependency installation and locked Windows files; stop on failed installation before generation or startup.
- Preserve Linux/WSL instructions and distinguish prior developer verification from the independent Windows result.
- Replace the outdated blanket statement that no other person has tested setup with the narrower, accurate assisted-test result and remaining coverage limits.

The seven mandatory root README sections and their order remain unchanged.

## Additional tester feedback reported by the project owner

The project owner reported that the tester was confused about:

1. How to move from an already installed Node.js version to the version required by StitchTrack.
2. What to do after switching versions, especially when the repository had already been cloned.
3. The lack of guidance about possible compatibility problems with an unverified Node.js version.
4. The absence of a CMD alternative when PowerShell instructions caused difficulties.

These are **owner-reported paraphrases of tester feedback**, not verbatim quotations. No original wording was supplied, and the exact-quote placeholder below remains pending.

The documentation response is to explain the verified Node.js 24.x choice; separate installing a version from selecting it for a command; show the existing-clone continuation in order; explain PowerShell's session-specific initialization; provide a complete CMD alternative; and tell readers to stop after a failed dependency installation.

The feedback does not establish that Node.js 26 caused the observed EPERM. Compatibility with Node.js 26 was not established, while the actual recorded installation failure was EPERM during removal of a Next.js SWC binary. These must remain separate findings.

## Exact tester feedback — placeholder

**Pending: exact quotes to be supplied by the developer.**

[Insert the tester's exact wording here once supplied. No verbatim tester feedback has been provided for this document.]

The observations above are factual paraphrases of the supplied account. They must not be relabelled as direct quotes.

## Remaining limitations

- A complete unaided fresh-clone walkthrough of the revised README has not been independently repeated. The successful recovery used an existing clone.
- The PowerShell alternative, other Windows versions and other machines have not been established as verified by this test.
- The exact lifecycle-script warnings and their implications remain to be reviewed when the original text is supplied. Zero reported vulnerabilities does not itself explain those warnings.
- No Windows production build, typecheck, assessment unit-test run, assessment submission or PostgreSQL persistence verification is claimed here.
- This test covers the homepage only. It does not verify planned StitchTrack product workflows or resolve the separate HTTP 500 database-failure classification defect.
- Exact tester quotes are still pending.

No passwords, tokens or database connection strings are included. No application code, dependencies, tests, PRD, migrations or historical evidence were modified by this documentation follow-up.

Assumptions: none
