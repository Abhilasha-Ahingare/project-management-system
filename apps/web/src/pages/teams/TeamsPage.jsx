import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { MoreHorizontal, Pencil, Plus, Trash2, UsersRound } from "lucide-react";
import { useState } from "react";
import { useSelector } from "react-redux";
import { toast } from "react-toastify";
import { members, projects, teams } from "../../api/resources.api";
import { apiMessage } from "../../api/client";
import { Loading, Failed, Empty } from "../../components/ui/States";

const list = (value) =>
  Array.isArray(value) ? value : value?.items || value?.data || [];

const emptyForm = { name: "", description: "", projectId: "" };

export default function TeamsPage() {
  const isAdmin = useSelector((state) => state.auth.user?.role === "admin");
  const query = useQuery({
    queryKey: ["teams"],
    queryFn: teams.list,
  });
  const membersQuery = useQuery({
    queryKey: ["all-members"],
    queryFn: members.list,
    enabled: isAdmin,
  });
  const projectsQuery = useQuery({
    queryKey: ["projects"],
    queryFn: projects.list,
    enabled: isAdmin,
  });
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [editingTeam, setEditingTeam] = useState(null);
  const [menuOpenId, setMenuOpenId] = useState(null);
  const [selectedMemberIds, setSelectedMemberIds] = useState([]);
  const [form, setForm] = useState(emptyForm);

  const create = useMutation({
    mutationFn: () => {
      const selectedMembers = memberList.filter((member) =>
        selectedMemberIds.includes(String(member._id || member.id)),
      );
      return teams.create({
        ...form,
        memberEmails: selectedMembers.map((member) => member.email),
      });
    },
    onSuccess: (result) => {
      setForm(emptyForm);
      setSelectedMemberIds([]);
      setShowForm(false);
      qc.invalidateQueries({ queryKey: ["teams"] });
      qc.invalidateQueries({ queryKey: ["projects"] });
      const failed = result?.invitationErrors?.length || 0;
      toast.success(
        failed
          ? `Team created, but ${failed} invitation(s) could not be sent.`
          : `Team created and ${result?.invitationsSent || 0} invitation(s) sent.`,
      );
    },
    onError: (error) => toast.error(apiMessage(error, "Unable to create team")),
  });

  const update = useMutation({
    mutationFn: () => {
      const existingMemberIds = new Set(
        (editingTeam.members || []).map((member) =>
          String(member.user?._id || member.user || member.id),
        ),
      );
      const selectedMembersForInvite = memberList.filter(
        (member) =>
          selectedMemberIds.includes(String(member._id || member.id)) &&
          !existingMemberIds.has(String(member._id || member.id)),
      );
      return teams.update(editingTeam._id || editingTeam.id, {
        ...form,
        memberEmails: selectedMembersForInvite.map((member) => member.email),
      });
    },
    onSuccess: (result) => {
      setForm(emptyForm);
      setEditingTeam(null);
      setShowForm(false);
      qc.invalidateQueries({ queryKey: ["teams"] });
      qc.invalidateQueries({ queryKey: ["projects"] });
      const failed = result?.invitationErrors?.length || 0;
      toast.success(
        failed
          ? `Team updated, but ${failed} invitation(s) could not be sent.`
          : `Team updated and ${result?.invitationsSent || 0} invitation(s) sent.`,
      );
    },
    onError: (error) => toast.error(apiMessage(error, "Unable to update team")),
  });

  const remove = useMutation({
    mutationFn: (teamId) => teams.remove(teamId),
    onSuccess: () => {
      setMenuOpenId(null);
      qc.invalidateQueries({ queryKey: ["teams"] });
      toast.success("Team deleted successfully.");
    },
    onError: (error) => toast.error(apiMessage(error, "Unable to delete team")),
  });

  const removeMember = useMutation({
    mutationFn: ({ teamId, memberId }) => teams.removeMember(teamId, memberId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["teams"] });
      toast.success("Team member removed successfully.");
    },
    onError: (error) =>
      toast.error(apiMessage(error, "Unable to remove team member")),
  });

  const saveTeam = () => {
    if (!form.name.trim()) return;
    if (editingTeam) update.mutate();
    else create.mutate();
  };

  if (query.isLoading) return <Loading text="Loading teams..." />;
  if (query.isError) return <Failed retry={() => query.refetch()} />;

  const data = list(query.data);
  const memberList = list(membersQuery.data);
  const selectedMembers = memberList.filter((member) =>
    selectedMemberIds.includes(String(member._id || member.id)),
  );

  return (
    <div className="stack">
      <div className="page-head">
        <div>
          <small className="eyebrow">TEAMS</small>
          <h1>Make collaboration easier to see.</h1>
          <p className="muted">
            Every team, member roster, and role in one place.
          </p>
        </div>
        {isAdmin && (
          <button
            className="button primary"
            onClick={
              isAdmin
                ? () => {
                    setEditingTeam(null);
                    setForm(emptyForm);
                    setShowForm(true);
                  }
                : undefined
            }
            disabled={!isAdmin}
            title={isAdmin ? "Create team" : "Admins only"}
          >
            <Plus size={16} />
            Create team
          </button>
        )}
      </div>

      {data.length ? (
        <div className="project-grid team-grid cards">
          {data.map((team) => (
            <article
              className="surface card team-card"
              key={team._id || team.id}
            >
              <div className="card-top-row">
                <div className="card-icon teal">
                  <UsersRound size={18} />
                </div>
              </div>

              <span className="badge">
                {(team.members?.length || 0) +
                  (team.pendingMembers?.length || 0)}{" "}
                MEMBERS
              </span>
              <h3>{team.name}</h3>
              <p>{team.description || "No description added yet."}</p>

              <div className="meta-block">
                <small>Lead: {team.lead?.name || "Not set"}</small>
                {team.members?.length ? (
                  <div className="selected-member-list">
                    {team.members.map((member) => {
                      const memberId = member.user?._id || member.user;
                      const leadId = team.lead?._id || team.lead;
                      return (
                        <span
                          className="selected-member"
                          key={String(memberId)}
                        >
                          {member.user?.name || member.user?.email || "Member"}
                          {String(memberId) !== String(leadId) && (
                            <button
                              type="button"
                              aria-label={`Remove ${member.user?.name || "team member"}`}
                              disabled={removeMember.isPending}
                              onClick={() =>
                                removeMember.mutate({
                                  teamId: team._id || team.id,
                                  memberId,
                                })
                              }
                            >
                              ×
                            </button>
                          )}
                        </span>
                      );
                    })}
                  </div>
                ) : null}
                <small>
                  {[
                    ...(team.members || []).map((member) => ({
                      name: member.user?.name || member.user?.email || "Member",
                      status: "active",
                    })),
                    ...(team.pendingMembers || []).map((member) => ({
                      name: member.name || member.email || "Member",
                      status: "pending",
                    })),
                  ].length
                    ? [
                        ...(team.members || []).map((member) => ({
                          name:
                            member.user?.name || member.user?.email || "Member",
                          status: "active",
                        })),
                        ...(team.pendingMembers || []).map((member) => ({
                          name: member.name || member.email || "Member",
                          status: "pending",
                        })),
                      ]
                        .map(
                          (member) =>
                            `${member.name}${member.status === "pending" ? " (pending)" : ""}`,
                        )
                        .join(", ")
                    : "No members assigned"}
                </small>
                <small>
                  Project: {team.project?.name || "No project assigned"}
                </small>
              </div>

              <div className="team-card-actions">
                <div className="menu-wrap">
                  <button
                    type="button"
                    className="icon small-icon"
                    disabled={!isAdmin}
                    aria-label={`Actions for ${team.name}`}
                    onClick={() => {
                      if (!isAdmin) return;
                      setMenuOpenId((current) =>
                        current === (team._id || team.id)
                          ? null
                          : team._id || team.id,
                      );
                    }}
                  >
                    <MoreHorizontal size={16} />
                  </button>
                  {isAdmin && menuOpenId === (team._id || team.id) && (
                    <div className="menu-popover">
                      <button
                        type="button"
                        onClick={() => {
                          setEditingTeam(team);
                          setSelectedMemberIds(
                            team.members?.map((member) =>
                              String(
                                member.user?._id || member.user || member.id,
                              ),
                            ) || [],
                          );
                          setForm({
                            name: team.name || "",
                            description: team.description || "",
                            projectId: team.project?._id || team.project || "",
                          });
                          setShowForm(true);
                        }}
                      >
                        <Pencil size={14} />
                        Edit
                      </button>
                      <button
                        type="button"
                        className="danger"
                        onClick={() => remove.mutate(team._id || team.id)}
                      >
                        <Trash2 size={14} />
                        Delete
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <Empty
          title="No teams found"
          text="Teams created by the admin will appear here."
        />
      )}

      {showForm && isAdmin && (
        <div className="modal-backdrop" onClick={() => setShowForm(false)}>
          <div
            className="modal-card surface"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="modal-header">
              <div>
                <small className="eyebrow">TEAM</small>
                <h2>{editingTeam ? "Edit team" : "Create team"}</h2>
              </div>
              <button
                className="icon small-icon"
                type="button"
                onClick={() => setShowForm(false)}
              >
                ×
              </button>
            </div>

            <div className="form-panel">
              <input
                className="field"
                placeholder="New team name"
                value={form.name}
                onChange={(event) =>
                  setForm({ ...form, name: event.target.value })
                }
              />
              <textarea
                className="field textarea"
                placeholder="Description"
                value={form.description}
                onChange={(event) =>
                  setForm({ ...form, description: event.target.value })
                }
              />
              <select
                className="select"
                value={form.projectId}
                onChange={(event) =>
                  setForm({ ...form, projectId: event.target.value })
                }
              >
                <option value="">No project assigned</option>
                {list(projectsQuery.data).map((project) => (
                  <option
                    key={project._id || project.id}
                    value={project._id || project.id}
                  >
                    {project.name}
                  </option>
                ))}
              </select>
              <div className="field-label">Team members</div>
              <select
                className="select"
                value=""
                onChange={(event) => {
                  const memberId = event.target.value;
                  if (memberId && !selectedMemberIds.includes(memberId)) {
                    setSelectedMemberIds((current) => [...current, memberId]);
                  }
                }}
              >
                <option value="">
                  {memberList.length ? "Select a member" : "No members found"}
                </option>
                {memberList.map((member) => {
                  const memberId = String(member._id || member.id);
                  return (
                    <option
                      key={memberId}
                      value={memberId}
                      disabled={selectedMemberIds.includes(memberId)}
                    >
                      {member.name}
                    </option>
                  );
                })}
              </select>
              {(selectedMembers.length > 0 ||
                (editingTeam?.pendingMembers?.length || 0) > 0) && (
                <div className="selected-member-list">
                  {selectedMembers.map((member) => {
                    const memberId = String(member._id || member.id);
                    return (
                      <span className="selected-member" key={memberId}>
                        {member.name}
                        <button
                          type="button"
                          onClick={() =>
                            setSelectedMemberIds((current) =>
                              current.filter((id) => id !== memberId),
                            )
                          }
                          aria-label={`Remove ${member.name}`}
                        >
                          ×
                        </button>
                      </span>
                    );
                  })}
                  {editingTeam?.pendingMembers?.map((member) => (
                    <span
                      className="selected-member"
                      key={`pending-${member._id}`}
                    >
                      {member.name || member.email} (pending)
                    </span>
                  ))}
                </div>
              )}
              <div className="form-actions">
                <button
                  type="button"
                  className="button secondary"
                  onClick={() => setShowForm(false)}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="button primary"
                  onClick={saveTeam}
                  disabled={
                    !form.name.trim() || create.isPending || update.isPending
                  }
                >
                  {create.isPending || update.isPending
                    ? "Saving..."
                    : editingTeam
                      ? "Save team"
                      : "Create team"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
