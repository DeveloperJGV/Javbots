import type { GithubRepo } from '../../../core/src/messages.js';
import type { MessageTransport } from '../../../core/src/transport.js';
import { Modal } from '../../../webview-ui/src/components/ui/Modal.js';
import { CABINET_GOLD_COMMITS, CABINET_METAL_COMMITS, CABINET_SHEET_COMMITS } from './constants.js';
import { cabinetLevel, isRecent, LEVEL_LABELS } from './githubFurniture.js';
import { githubStore } from './githubStore.js';
import { lastDays, nextLevelText, sinceText } from './githubText.js';
import { useGithub } from './useGithub.js';

function RepoRow({ repo, focused, now }: { repo: GithubRepo; focused: boolean; now: Date }) {
  const level = cabinetLevel(repo.commits);
  return (
    <tr className={focused ? 'text-accent-bright' : undefined}>
      <td>
        <a href={repo.url} target="_blank" rel="noreferrer" className="hover:underline">
          {repo.name}
        </a>
        {repo.private && <span className="text-text-muted"> · privado</span>}
        {isRecent(repo, now) && <span className="text-status-success"> ●</span>}
      </td>
      <td>
        {LEVEL_LABELS[level]}
        <span className="text-text-muted"> {nextLevelText(repo.commits)}</span>
      </td>
      <td className="text-right">{repo.commits}</td>
      <td className="text-right">{repo.openPullRequests || '—'}</td>
      <td className="text-right">{repo.stars || '—'}</td>
      <td className="text-right text-text-muted">{sinceText(repo.pushedAt, now)}</td>
    </tr>
  );
}

/**
 * The GitHub room (features/github): the detail (repositories with their cabinet level, open PRs) that opens on a
 * click in the room. The sign over a cabinet or the graph is the office's hover sign (office/hint).
 */
export function GithubPanel({ transport }: { transport: MessageTransport }) {
  const github = useGithub(transport);
  const { status } = github;
  if (!status) return null;
  const now = new Date();
  const totalCommits = status.repos.reduce((sum, r) => sum + r.commits, 0);
  const weekCommits = lastDays(status.weeks, 7);
  const focused = status.repos.find((r) => r.name === github.focusRepo);
  const repos = focused ? [focused, ...status.repos.filter((r) => r !== focused)] : status.repos;
  return (
    <>
      {github.detailOpen && (
        <Modal
          isOpen
          onClose={() => githubStore.close()}
          title={`GitHub · ${status.login}`}
          className="w-[min(820px,94vw)]"
        >
          <div className="max-h-[70vh] overflow-y-auto px-10 pb-6">
            <p className="text-sm text-text-muted">
              {status.totalRepos} repos · {totalCommits} commits en los {status.repos.length} más
              recientes · {weekCommits} contribuciones en los últimos 7 días. Cada archivero sube de
              nivel con los commits: madera, metal ({CABINET_METAL_COMMITS}) y oro (
              {CABINET_GOLD_COMMITS}), y junta una hoja más a los {CABINET_SHEET_COMMITS.join(', ')}
              . El foco verde es un push de los últimos 7 días.
            </p>
            {status.pullRequests.length > 0 && (
              <div className="mt-4">
                <div className="text-lg text-accent-bright">PRs abiertos</div>
                <ul className="mt-2 text-sm text-text">
                  {status.pullRequests.map((pr) => (
                    <li key={pr.url}>
                      <a href={pr.url} target="_blank" rel="noreferrer" className="hover:underline">
                        {pr.repo} #{pr.number}
                      </a>{' '}
                      {pr.title}
                      {pr.author && <span className="text-text-muted"> · {pr.author}</span>}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <table className="mt-4 w-full text-sm text-text">
              <thead className="text-text-muted text-left">
                <tr>
                  <th className="font-normal">Repo</th>
                  <th className="font-normal">Archivero</th>
                  <th className="font-normal text-right">Commits</th>
                  <th className="font-normal text-right">PRs</th>
                  <th className="font-normal text-right">Estrellas</th>
                  <th className="font-normal text-right">Último push</th>
                </tr>
              </thead>
              <tbody>
                {repos.map((r) => (
                  <RepoRow key={r.name} repo={r} focused={r === focused} now={now} />
                ))}
              </tbody>
            </table>
          </div>
        </Modal>
      )}
    </>
  );
}
