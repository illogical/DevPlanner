import { useNavigate } from 'react-router-dom';
import type { GitState } from '../../api/client';

interface Props {
  filePath: string;
  gitState: GitState | null | undefined;
}

/**
 * Compact diff jump buttons shown in the BottomBar, to the left of GitStatusDot.
 * Renders nothing for clean/untracked/ignored/outside-repo/unknown states.
 *
 * | State           | Buttons                             |
 * |-----------------|-------------------------------------|
 * | modified        | All changes                         |
 * | staged          | Staged diff                         |
 * | modified-staged | All changes · Staged diff · Unstaged|
 */
export function DiffQuickButtons({ filePath, gitState }: Props) {
  const navigate = useNavigate();

  if (!filePath || !gitState) return null;
  if (!['modified', 'staged', 'modified-staged'].includes(gitState)) return null;

  const go = (leftRef: string, rightRef: string) =>
    navigate(`/diff?gitPath=${encodeURIComponent(filePath)}&leftRef=${leftRef}&rightRef=${rightRef}`);

  const btnCls =
    'px-2 py-0.5 text-xs rounded border border-gray-700 text-gray-400 ' +
    'hover:text-gray-200 hover:border-gray-500 hover:bg-gray-800 transition-colors';

  return (
    <div className="flex items-center gap-1 mr-2">
      {/* All changes (HEAD → working): modified and modified-staged only */}
      {(gitState === 'modified' || gitState === 'modified-staged') && (
        <button
          onClick={() => go('HEAD', 'working')}
          title="Compare HEAD → working tree (all uncommitted changes)"
          className={btnCls}
        >
          All changes
        </button>
      )}

      {/* Staged diff (HEAD → staged): staged and modified-staged */}
      {(gitState === 'staged' || gitState === 'modified-staged') && (
        <button
          onClick={() => go('HEAD', 'staged')}
          title="Compare HEAD → staged index (what will be committed)"
          className={btnCls}
        >
          Staged diff
        </button>
      )}

      {/* Unstaged (staged → working): modified-staged only */}
      {gitState === 'modified-staged' && (
        <button
          onClick={() => go('staged', 'working')}
          title="Compare staged → working tree (changes not yet staged)"
          className={btnCls}
        >
          Unstaged
        </button>
      )}
    </div>
  );
}
