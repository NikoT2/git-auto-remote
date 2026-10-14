import type { ClassifiedCommit } from './classify.js';
import { git, gitTry } from './git.js';

/**
 * Mirror commits that only bring back a change `target` already has: it crossed the other way earlier and is now
 * replayed toward where it started. `git am --empty=drop` drops such a copy only while no later target commit has
 * touched its lines; once one has, the 3-way merge conflicts. A copy keeps its original's author time (git am,
 * rebase and cherry-pick all keep it), so the original is a target commit authored in the same second that changed
 * every file the copy would apply from the same content to the same content.
 */
export function findEchoes(commits: readonly ClassifiedCommit[], target: string): ReadonlySet<string> {
  const byTime = new Map<string, string[]>();
  for (const line of (gitTry('log', '--format=%at %H', target) ?? '').split('\n')) {
    const [time, sha] = line.split(' ');
    if (time && sha) byTime.set(time, [...(byTime.get(time) ?? []), sha]);
  }
  const echoes = new Set<string>();
  for (const { sha, classification } of commits) {
    if (classification.kind === 'out-of-scope') continue;
    const paths =
      classification.kind === 'partial' ? [...classification.included, ...classification.review] : classification.included;
    if (paths.length === 0) continue;
    const change = fileChanges(sha, paths);
    const originals = byTime.get(git('log', '-1', '--format=%at', sha)) ?? [];
    if (originals.some((original) => fileChanges(original, paths) === change)) echoes.add(sha);
  }
  return echoes;
}

/** How <sha> changed <paths>: each path's mode and content before and after, as `git diff-tree` reports them. */
function fileChanges(sha: string, paths: readonly string[]): string | null {
  return gitTry('--literal-pathspecs', 'diff-tree', '-r', '--root', '--no-renames', '--no-commit-id', sha, '--', ...paths);
}
