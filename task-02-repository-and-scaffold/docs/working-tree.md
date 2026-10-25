# Task Two, Step 8: Working tree and Git workflow

My [hand-drawn workflow](../evidence/14-working-tree-drawing.jpg) shows the path from my computer to GitHub and a future production deployment. The drawing is stored as `.jpeg`. StitchTrack has **not been deployed to production**.

## From editing to shared history

When I edit StitchTrack files, the changes first exist in my working directory. They are not automatically part of a commit.

`git add` stages the selected files' current contents for the next commit. Staging does not move the files out of the working directory. If I edit a staged file again, I need to stage the new edits if I want them included.

`git commit` records the staged snapshot in my local Git repository, with a message and a link to earlier history. A new local commit has not yet been uploaded to GitHub.

`git push` sends the required commits and updates the chosen branch on GitHub. This is where my new history becomes shared with people who have access to the repository. Uncommitted edits are not included in a push.

A pull request proposes bringing one branch's changes into another. It provides a place to compare changes, discuss them and review checks before deciding to merge. Opening a pull request does not merge or deploy the code.

## The information-design merge

I developed the information-design improvements on `feat/information-design`. [Pull Request #1](https://github.com/chykB/StitchTrack/pull/1) merged that work into `main` as merge commit `e70de85`.

Merging combines the histories and incorporates the changes into the target branch. This merge commit has two parents: the previous main commit `e9c1c85` and feature commit `95ada9a`. The feature work therefore became part of main's shared history.

## The rejected experiment

I then used `experiment/rejected-hero-copy` to try the heading “Manage everything in one place” in commit `1efaa14`. I rejected it because it was too general. “Keep tailoring orders and agreements clear” explained StitchTrack's purpose better.

I deleted the experimental branch locally without merging it. Its heading did not enter main. The [saved Git evidence](../evidence/15-git-log-graph.txt) records the experiment, rejection reason and branch deletion.

Deleting a branch removes its branch reference; it does not immediately erase the commit object. That is why the rejected commit can still be inspected locally even though the branch is gone.

## Why separate branches matter

Working only on main would mix unfinished experiments with changes ready for review. It would become harder to review one change or prepare a release without including unrelated work. The rejected heading shows why keeping an experiment separate is useful.

After a future deployment, this becomes more serious: releasing an unfinished change could affect customers using the application. Separate branches and pull requests help control what reaches main, but they still need review and testing. I am describing a risk, not a production incident that happened to StitchTrack.

## GitHub is not production

The final arrow in my drawing represents a **future** deployment: taking a chosen revision, building it and releasing it to the production hosting environment. Deployed changes become visible to users when that environment serves the new release.

A push or merge does not, by itself, prove deployment. GitHub makes source history shared; a production release makes application behavior available to customers. StitchTrack's homepage has been tested locally, including on Windows, but that is not production deployment.
