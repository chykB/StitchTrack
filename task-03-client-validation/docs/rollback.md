# Task Three, Step 9 — Git Rollback

The StitchTrack development checkpoint was saved as `bcd1b37`.
A temporary note was committed separately as `3009fe1`.

## Rollback
Command: `git revert --no-edit 3009fe1`
Result: Git created revert commit `c019741`.
The temporary file was removed and the working tree was clean.

## Why use an exact commit ID?
An exact commit ID identifies the specific change to reverse without affecting unrelated development work.
A vague instruction such as "undo the last changes" could reverse the wrong commit and lose valuable work.

## Evidence
See `../evidence/17-commit-list-and-rollback.txt` for the actual commands, commit history and output.
