import { useEffect, useRef } from "react";
import { useNavigate, useParams } from "react-router";
import { useQueryClient } from "@tanstack/react-query";
import { client } from "../../api";
import { boardPath } from "../../lib/appRoute";
import { useErrorSink } from "../../lib/errorSink";
import { takePendingInvite } from "../../lib/inviteLinks";
import { refreshTeams } from "../../queries/teams";
import { useSession, useTeams } from "../../session/session";

/**
 * /invite/:token inside the signed-in shell: accept the invite and open the team. (Signed out,
 * the shell stashes the token for register and sends the user to /login first.)
 */
export function InviteRoute() {
  const { token } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { report } = useErrorSink();
  const { user } = useSession();
  const { teamsLoaded } = useTeams();
  const handledRef = useRef<string | null>(null);

  useEffect(() => {
    if (!token || !user || !teamsLoaded || handledRef.current === token) return;
    handledRef.current = token;
    takePendingInvite();
    void (async () => {
      try {
        const { team, alreadyMember } = await client.acceptInvite(token);
        await refreshTeams(queryClient);
        const notice = alreadyMember
          ? `Already on team ${team.key} — ${team.name}`
          : `Joined team ${team.key} — ${team.name}`;
        navigate(boardPath(team.key), { replace: true, state: { notice } });
      } catch (err) {
        report(err, "Failed to accept invite");
        navigate("/", { replace: true });
      }
    })();
  }, [token, user, teamsLoaded, navigate, queryClient, report]);

  return null;
}
