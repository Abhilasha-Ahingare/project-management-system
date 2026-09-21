import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useSelector } from "react-redux";
import { Excalidraw } from "@excalidraw/excalidraw";
import "@excalidraw/excalidraw/index.css";
import {
  ArrowLeft,
  Clock3,
  FolderKanban,
  History,
  MessageCircle,
  Plus,
  RotateCcw,
  Send,
  Trash2,
  UserPlus,
  UserMinus,
  Users,
  X,
} from "lucide-react";
import { toast } from "react-toastify";
import { collaboration, projects } from "../../api/resources.api";
import { apiMessage } from "../../api/client";
import { connectRealtime } from "../../api/socket";
import { Loading, Failed, Empty } from "../../components/ui/States";

const list = (value) =>
  Array.isArray(value) ? value : value?.items || value?.data || [];
const idOf = (value) => value?._id || value?.id || value;
const memberLabel = (member) => {
  const name = member?.name || member?.user?.name;
  const email = member?.email || member?.user?.email;
  if (name) return email ? `${name}` : name;
  if (email) return email;
  const identifier = idOf(member);
  return identifier
    ? `Team member ${String(identifier).slice(-6)}`
    : "Team member";
};

function BoardCanvas({ boardId, isEditor, snapshot, onPresence }) {
  const token = localStorage.getItem("projecthub_access_token");
  const apiRef = useRef(null);
  const socketRef = useRef(null);
  const saveTimer = useRef(null);
  const presenceRef = useRef(onPresence);
  presenceRef.current = onPresence;
  const initialData = snapshot?.elements
    ? {
        elements: snapshot.elements,
        appState: snapshot.appState || undefined,
        files: snapshot.files || {},
      }
    : undefined;

  useEffect(() => {
    if (!token) return undefined;
    const socket = connectRealtime(token);
    socketRef.current = socket;
    socket.emit("join_collaboration_board", boardId);
    const applyRemoteUpdate = (update) => {
      if (String(update?.boardId) !== String(boardId) || !apiRef.current)
        return;
      const remote = update.snapshot;
      if (!remote?.elements) return;
      apiRef.current.updateScene({
        elements: remote.elements,
        appState: remote.appState,
      });
      if (remote.files) apiRef.current.addFiles(Object.values(remote.files));
    };
    socket.on("collaboration_board_updated", applyRemoteUpdate);
    const joined = (participant) =>
      presenceRef.current?.({ type: "joined", participant });
    const left = (participant) =>
      presenceRef.current?.({ type: "left", participant });
    socket.on("collaboration_participant_joined", joined);
    socket.on("collaboration_participant_left", left);
    socket.on("collaboration_participants", (participants) =>
      presenceRef.current?.({ type: "roster", participants }),
    );
    return () => {
      if (saveTimer.current) window.clearTimeout(saveTimer.current);
      socket.emit("leave_collaboration_board", boardId);
      socket.off("collaboration_board_updated", applyRemoteUpdate);
      socket.off("collaboration_participant_joined", joined);
      socket.off("collaboration_participant_left", left);
      socket.off("collaboration_participants");
      socket.disconnect();
      socketRef.current = null;
    };
  }, [boardId, token]);

  const handleChange = (elements, appState, files) => {
    if (!isEditor || !token) return;
    if (saveTimer.current) window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => {
      socketRef.current?.emit("collaboration_board_update", {
        boardId,
        snapshot: { elements, appState, files },
      });
    }, 350);
  };

  return (
    <div className="collaboration-canvas" data-readonly={!isEditor}>
      <Excalidraw
        initialData={initialData}
        onChange={handleChange}
        viewModeEnabled={!isEditor}
        excalidrawAPI={(api) => {
          apiRef.current = api;
        }}
      />
    </div>
  );
}

export default function CollaborationPage() {
  const { projectId, boardId } = useParams();
  const navigate = useNavigate();
  const user = useSelector((state) => state.auth.user);
  const qc = useQueryClient();
  const [boardName, setBoardName] = useState("");
  const [chatText, setChatText] = useState("");
  const [selectedMemberIds, setSelectedMemberIds] = useState([]);
  const [invitePermission, setInvitePermission] = useState("editor");
  const [chatOpen, setChatOpen] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [sessionTitle, setSessionTitle] = useState("Collaboration session");
  const [activeParticipants, setActiveParticipants] = useState([]);
  const [selectedSessionId, setSelectedSessionId] = useState(null);

  const projectList = useQuery({
    queryKey: ["collaboration-projects"],
    queryFn: projects.list,
  });
  const selectedProject = useQuery({
    queryKey: ["collaboration-project", projectId],
    queryFn: () => projects.detail(projectId),
    enabled: Boolean(projectId),
  });
  const boards = useQuery({
    queryKey: ["collaboration-boards", projectId],
    queryFn: () => collaboration.boards(projectId),
    enabled: Boolean(projectId),
  });
  const board = useQuery({
    queryKey: ["collaboration-board", boardId],
    queryFn: () => collaboration.detail(boardId),
    enabled: Boolean(boardId),
  });
  const messages = useQuery({
    queryKey: ["collaboration-chat", boardId],
    queryFn: () => collaboration.chat(boardId),
    enabled: Boolean(boardId),
  });
  const sessions = useQuery({
    queryKey: ["collaboration-sessions", boardId],
    queryFn: () => collaboration.sessions(boardId),
    enabled: Boolean(boardId),
  });
  const sessionDetails = useQuery({
    queryKey: ["collaboration-session", selectedSessionId],
    queryFn: () => collaboration.sessionDetails(selectedSessionId),
    enabled: Boolean(selectedSessionId),
  });
  const history = useQuery({
    queryKey: ["collaboration-history", boardId],
    queryFn: () => collaboration.history(boardId),
    enabled: Boolean(boardId),
  });

  useEffect(() => {
    if (!projectId || !boardId) return undefined;
    const token = localStorage.getItem("projecthub_access_token");
    if (!token) return undefined;
    const socket = connectRealtime(token);
    const refreshBoardChat = (message) => {
      if (
        message?.scopeType === "CollaborationBoard" &&
        String(message.scopeId) === String(boardId)
      ) {
        qc.invalidateQueries({ queryKey: ["collaboration-chat", boardId] });
      }
    };
    socket.emit("join_project", projectId);
    socket.on("chat:message", refreshBoardChat);
    return () => {
      socket.off("chat:message", refreshBoardChat);
      socket.emit("leave_project", projectId);
      socket.disconnect();
    };
  }, [boardId, projectId, qc]);

  const createBoard = useMutation({
    mutationFn: () => collaboration.createBoard(projectId, { name: boardName }),
    onSuccess: (created) => {
      setBoardName("");
      qc.invalidateQueries({ queryKey: ["collaboration-boards", projectId] });
      navigate(`/collaboration/${projectId}/${idOf(created)}`);
    },
    onError: (error) =>
      toast.error(apiMessage(error, "Unable to create board")),
  });
  const invite = useMutation({
    mutationFn: () => {
      if (!selectedMemberIds.length) {
        throw new Error("Select at least one team member.");
      }
      return collaboration.inviteProject(projectId, {
        userIds: selectedMemberIds,
        permission: invitePermission,
      });
    },
    onSuccess: () => {
      setSelectedMemberIds([]);
      qc.invalidateQueries({ queryKey: ["collaboration-project", projectId] });
      toast.success("Collaboration invitations sent.");
    },
    onError: (error) =>
      toast.error(apiMessage(error, "Unable to invite collaborators")),
  });
  const removeCollaborator = useMutation({
    mutationFn: (userId) =>
      collaboration.removeProjectMember(projectId, userId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["collaboration-project", projectId] });
      toast.success("Member removed from collaboration.");
    },
    onError: (error) =>
      toast.error(apiMessage(error, "Unable to remove collaboration member")),
  });
  const removeBoard = useMutation({
    mutationFn: () => collaboration.removeBoard(boardId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["collaboration-boards", projectId] });
      navigate(`/collaboration/${projectId}`);
      toast.success("Whiteboard deleted.");
    },
    onError: (error) =>
      toast.error(apiMessage(error, "Unable to delete whiteboard")),
  });
  const clearSessions = useMutation({
    mutationFn: () => collaboration.clearSessions(boardId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["collaboration-sessions", boardId] });
      toast.success("Session summaries cleared.");
    },
    onError: (error) =>
      toast.error(apiMessage(error, "Unable to clear session summaries")),
  });
  const sendMessage = useMutation({
    mutationFn: () =>
      collaboration.sendChat(boardId, { text: chatText.trim() }),
    onSuccess: () => {
      setChatText("");
      qc.invalidateQueries({ queryKey: ["collaboration-chat", boardId] });
    },
    onError: (error) =>
      toast.error(apiMessage(error, "Unable to send collaboration message")),
  });
  const startSession = useMutation({
    mutationFn: (data) => collaboration.startSession(boardId, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["collaboration-sessions", boardId] });
      toast.success("Collaboration session started.");
    },
    onError: (error) =>
      toast.error(apiMessage(error, "Unable to start collaboration session")),
  });
  const endSession = useMutation({
    mutationFn: (sessionId) => collaboration.endSession(sessionId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["collaboration-sessions", boardId] });
      qc.invalidateQueries({ queryKey: ["collaboration-board", boardId] });
      qc.invalidateQueries({ queryKey: ["collaboration-history", boardId] });
      toast.success("Session ended and summary saved.");
    },
    onError: (error) =>
      toast.error(apiMessage(error, "Unable to end collaboration session")),
  });
  const continueSession = useMutation({
    mutationFn: (session) =>
      collaboration.continueSession(session._id, {
        title: `Continuation of ${session.title || "collaboration"}`,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["collaboration-sessions", boardId] });
      qc.invalidateQueries({ queryKey: ["collaboration-board", boardId] });
      toast.success("New session started from the saved board.");
    },
    onError: (error) =>
      toast.error(apiMessage(error, "Unable to continue collaboration")),
  });
  const leaveSession = useMutation({
    mutationFn: (sessionId) => collaboration.leaveSession(sessionId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["collaboration-sessions", boardId] });
      toast.success("You left the collaboration session.");
    },
    onError: (error) =>
      toast.error(apiMessage(error, "Unable to leave session")),
  });

  const members = useMemo(() => {
    const team = selectedProject.data?.team;
    // Get all team members including lead and multiple team members
    const teamMembers = [
      team?.lead,
      ...(team?.members || []).map((member) => member.user || member),
    ].filter(Boolean);
    const projectMembers = (selectedProject.data?.members || [])
      .map((member) => member.user || member)
      .filter(Boolean);

    // Also include all collaborators
    const collaborators = (selectedProject.data?.collaborators || [])
      .filter((collab) => collab.status === "accepted")
      .map((collab) => collab.user || collab);

    const values = [...teamMembers, ...projectMembers, ...collaborators];
    return [
      ...new Map(values.map((member) => [idOf(member), member])).values(),
    ];
  }, [selectedProject.data]);

  const isEditor = board.data?.isEditor || user?.role === "admin";
  const projectOwnerId =
    selectedProject.data?.owner?._id || selectedProject.data?.owner;
  const currentUserId = user?.id || user?._id;

  // Check if current user is a team member
  const isTeamMember = members.some(
    (member) => String(idOf(member)) === String(currentUserId),
  );

  const projectCollaborator = selectedProject.data?.collaborators?.find(
    (item) =>
      String(idOf(item.user)) === String(currentUserId) &&
      item.status === "accepted",
  );

  // Allow any team member or accepted collaborator to invite others and manage project
  const canInviteProject =
    user?.role === "admin" ||
    String(projectOwnerId) === String(currentUserId) ||
    isTeamMember ||
    !!projectCollaborator;

  const canManageProject =
    user?.role === "admin" ||
    String(projectOwnerId) === String(currentUserId) ||
    isTeamMember ||
    projectCollaborator?.permission === "manager";

  const inviteMembers = members.filter(
    (member) => String(idOf(member)) !== String(currentUserId),
  );
  const acceptedCollaboratorIds = new Set(
    (selectedProject.data?.collaborators || [])
      .filter((item) => item.status === "accepted")
      .map((item) => String(idOf(item.user))),
  );
  const pendingCollaboratorIds = new Set(
    (selectedProject.data?.pendingCollaborators || []).map((item) =>
      String(idOf(item)),
    ),
  );
  const updatePresence = (event) => {
    if (event.type === "roster") {
      setActiveParticipants(event.participants || []);
      return;
    }
    if (event.type === "joined" && event.participant) {
      setActiveParticipants((current) => [
        ...current.filter(
          (item) => String(idOf(item)) !== String(idOf(event.participant)),
        ),
        event.participant,
      ]);
    }
    if (event.type === "left") {
      setActiveParticipants((current) =>
        current.filter(
          (item) => String(idOf(item)) !== String(event.participant?.userId),
        ),
      );
    }
  };
  if (
    projectList.isLoading ||
    selectedProject.isLoading ||
    boards.isLoading ||
    board.isLoading ||
    sessions.isLoading ||
    history.isLoading
  )
    return <Loading text="Loading collaboration workspace..." />;
  if (
    projectList.isError ||
    selectedProject.isError ||
    boards.isError ||
    board.isError
  )
    return <Failed retry={() => projectList.refetch()} />;
  const projectsData = list(projectList.data);
  const boardsData = list(boards.data);
  const messageData = list(messages.data);
  const sessionData = list(sessions.data);
  const historyData = list(history.data);
  const activeSession = sessionData.find((session) => !session.endedAt);

  if (!projectId) {
    return (
      <div className="stack">
        <div>
          <small className="eyebrow">PROJECT COLLABORATION</small>
          <h1>Build ideas together.</h1>
          <p className="muted">
            Choose a project to open its shared whiteboards.
          </p>
        </div>
        {projectsData.length ? (
          <div className="surface list">
            {projectsData.map((project) => (
              <Link
                className="task-row"
                key={idOf(project)}
                to={`/collaboration/${idOf(project)}`}
              >
                <FolderKanban size={19} />
                <div>
                  <strong>{project.name}</strong>
                  <p>{project.description || "Open collaboration workspace"}</p>
                </div>
              </Link>
            ))}
          </div>
        ) : (
          <Empty
            title="No projects available"
            text="Accepted project access is required for collaboration."
          />
        )}
      </div>
    );
  }

  return (
    <div
      className={`stack collaboration-page ${boardId ? "board-workspace" : ""}`}
    >
      <Link className="back" to="/collaboration">
        <ArrowLeft size={16} /> Back to projects
      </Link>
      <header className="surface project-hero">
        <small className="eyebrow">PROJECT COLLABORATION</small>
        <h1>{selectedProject.data.name}</h1>
        <p>
          {selectedProject.data.description ||
            "Shared project ideas and design workspace"}
        </p>
      </header>
      <div className="collaboration-grid">
        <aside
          className={`surface collaboration-sidebar ${inviteOpen ? "open" : ""}`}
        >
          <div className="section-title">
            <UserPlus size={18} />
            <h2>Invite team members</h2>
          </div>
          <p className="muted collaboration-help">
            Invite team members to collaborate on this project. You can add
            multiple team members who can work together.
          </p>
          <select
            className="select"
            value={invitePermission}
            disabled={!canInviteProject}
            onChange={(event) => setInvitePermission(event.target.value)}
          >
            <option value="editor">Can edit</option>
            <option value="viewer">Can view</option>
          </select>
          <div className="collaboration-member-list">
            {inviteMembers.map((member) => {
              const id = idOf(member);
              const memberId = String(id);
              const added = acceptedCollaboratorIds.has(memberId);
              const invited = pendingCollaboratorIds.has(memberId);
              return (
                <label
                  key={id}
                  className={`collaboration-member-row ${added ? "is-added" : ""} ${invited ? "is-invited" : ""}`}
                >
                  <input
                    type="checkbox"
                    disabled={!canInviteProject || added || invited}
                    checked={selectedMemberIds.includes(id)}
                    onChange={() =>
                      setSelectedMemberIds((current) =>
                        current.includes(id)
                          ? current.filter((value) => value !== id)
                          : [...current, id],
                      )
                    }
                  />
                  <span>
                    {memberLabel(member)}
                    <small className="collaboration-member-status">
                      {added
                        ? "Joined collaboration"
                        : invited
                          ? "Invitation pending"
                          : "Available to invite"}
                    </small>
                  </span>
                  {added && (
                    <button
                      className="icon tiny-icon danger"
                      type="button"
                      title={`Remove ${memberLabel(member)} from collaboration`}
                      aria-label={`Remove ${memberLabel(member)} from collaboration`}
                      disabled={removeCollaborator.isPending}
                      onClick={(event) => {
                        event.preventDefault();
                        event.stopPropagation();
                        removeCollaborator.mutate(id);
                      }}
                    >
                      <UserMinus size={14} />
                    </button>
                  )}
                </label>
              );
            })}
          </div>
          <button
            className="button primary"
            disabled={
              !selectedMemberIds.length || invite.isPending || !canInviteProject
            }
            onClick={() => invite.mutate()}
          >
            <Users size={15} /> Invite selected
          </button>
        </aside>
        <main className="surface collaboration-main">
          <section className="collaboration-board-picker">
            <div className="collaboration-picker-heading">
              <div className="section-title">
                <FolderKanban size={18} />
                <div>
                  <h2>Whiteboards</h2>
                  <p className="muted">Choose a board or create a fresh one.</p>
                </div>
              </div>
              <div className="collaboration-create-board">
                <input
                  className="field"
                  placeholder="Whiteboard name"
                  value={boardName}
                  onChange={(event) => setBoardName(event.target.value)}
                />
                <button
                  className="button primary"
                  type="button"
                  disabled={
                    !boardName.trim() ||
                    createBoard.isPending ||
                    !canManageProject
                  }
                  onClick={() => createBoard.mutate()}
                >
                  <Plus size={15} /> New board
                </button>
              </div>
            </div>
            <div className="collaboration-board-list">
              {boardsData.length ? (
                boardsData.map((item) => (
                  <Link
                    className={`collaboration-board-link ${idOf(item) === boardId ? "active" : ""}`}
                    key={idOf(item)}
                    to={`/collaboration/${projectId}/${idOf(item)}`}
                  >
                    <FolderKanban size={15} />
                    <span>{item.name}</span>
                  </Link>
                ))
              ) : (
                <span className="muted small-note">
                  No whiteboards yet. Create the first one.
                </span>
              )}
            </div>
          </section>
          {boardId && board.data ? (
            <>
              <div className="collaboration-board-header">
                <div>
                  <small className="eyebrow">WHITEBOARD</small>
                  <h2>{board.data.board.name}</h2>
                </div>
                <div className="collaboration-board-actions">
                  <div
                    className="collaboration-presence"
                    title="Active participants"
                  >
                    {[user, ...activeParticipants]
                      .filter(Boolean)
                      .filter(
                        (member, index, values) =>
                          values.findIndex(
                            (item) =>
                              String(idOf(item)) === String(idOf(member)),
                          ) === index,
                      )
                      .slice(0, 6)
                      .map((member) => (
                        <span className="presence-avatar" key={idOf(member)}>
                          {member.avatar ? (
                            <img src={member.avatar} alt={member.name || ""} />
                          ) : (
                            (member.name || "?").slice(0, 2).toUpperCase()
                          )}
                        </span>
                      ))}
                  </div>
                  <button
                    className="button secondary collaboration-chat-toggle"
                    type="button"
                    onClick={() => setChatOpen((current) => !current)}
                  >
                    <MessageCircle size={15} /> Chat
                  </button>
                  <button
                    className="button secondary collaboration-chat-toggle"
                    type="button"
                    onClick={() => setInviteOpen((current) => !current)}
                  >
                    <UserPlus size={15} /> Invite
                  </button>
                  <button
                    className="icon small-icon"
                    type="button"
                    title="Close whiteboard"
                    aria-label="Close whiteboard"
                    onClick={() => navigate(`/collaboration/${projectId}`)}
                  >
                    <X size={17} />
                  </button>
                  <span className="badge">
                    {isEditor ? "EDITOR" : "VIEWER"}
                  </span>
                  <button
                    className="icon small-icon danger"
                    type="button"
                    title="Delete whiteboard"
                    aria-label="Delete whiteboard"
                    disabled={!board.data.isManager || removeBoard.isPending}
                    onClick={() => {
                      if (
                        window.confirm(
                          "Delete this whiteboard and its sessions?",
                        )
                      )
                        removeBoard.mutate();
                    }}
                  >
                    <Trash2 size={16} />
                  </button>
                  {activeSession ? (
                    <>
                      <button
                        className="button secondary"
                        type="button"
                        disabled={leaveSession.isPending}
                        onClick={() => leaveSession.mutate(activeSession._id)}
                      >
                        Leave session
                      </button>
                      <button
                        className="button secondary"
                        type="button"
                        disabled={endSession.isPending}
                        onClick={() => endSession.mutate(activeSession._id)}
                      >
                        <Clock3 size={15} /> End session
                      </button>
                    </>
                  ) : (
                    <button
                      className="button secondary"
                      type="button"
                      disabled={startSession.isPending}
                      onClick={() =>
                        startSession.mutate({ title: sessionTitle })
                      }
                    >
                      <Clock3 size={15} />
                      Start session
                    </button>
                  )}
                </div>
              </div>
              <BoardCanvas
                boardId={boardId}
                isEditor={isEditor}
                snapshot={board.data.board.snapshot}
                onPresence={updatePresence}
              />
            </>
          ) : (
            <Empty
              title="Select or create a whiteboard"
              text="Each whiteboard is persisted separately inside this project."
            />
          )}
        </main>
        {boardId && (
          <aside
            className={`surface collaboration-chat ${chatOpen ? "open" : ""}`}
          >
            <div className="section-title">
              <MessageCircle size={18} />
              <h2>Collaboration chat</h2>
            </div>
            <div className="collaboration-chat-thread">
              {messageData.map((message) => (
                <div className="collaboration-chat-message" key={idOf(message)}>
                  <strong>{message.sender?.name || "Member"}</strong>
                  <p>{message.text}</p>
                  <small>
                    {new Date(message.createdAt).toLocaleTimeString([], {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </small>
                </div>
              ))}
            </div>
            <div className="composer">
              <input
                placeholder="Discuss this board..."
                value={chatText}
                onChange={(event) => setChatText(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") sendMessage.mutate();
                }}
              />
              <button
                className="icon send"
                disabled={!chatText.trim() || sendMessage.isPending}
                onClick={() => sendMessage.mutate()}
              >
                <Send size={16} />
              </button>
            </div>
            <div className="collaboration-history">
              <div className="collaboration-history-header">
                <div className="section-title">
                  <History size={17} />
                  <h2>Session history</h2>
                </div>
                <button
                  className="button text-button"
                  type="button"
                  disabled={
                    !sessionData.length ||
                    !board.data.isManager ||
                    clearSessions.isPending
                  }
                  onClick={() => {
                    if (window.confirm("Clear all saved session summaries?"))
                      clearSessions.mutate();
                  }}
                >
                  <RotateCcw size={14} /> Clear all
                </button>
              </div>
              {sessionData.length ? (
                sessionData.map((session) => (
                  <article
                    className="collaboration-session"
                    key={idOf(session)}
                  >
                    <strong>{session.title || "Collaboration session"}</strong>
                    <small>
                      {session.endedAt
                        ? `${new Date(session.startedAt).toLocaleDateString()} · ${Math.round((session.durationSeconds || 0) / 60)} min · ${session.participants?.length || 0} participants`
                        : "In progress"}
                    </small>
                    {session.summary && <p>{session.summary}</p>}
                    <button
                      className="button text-button"
                      type="button"
                      onClick={() => setSelectedSessionId(session._id)}
                    >
                      View saved collaboration
                    </button>
                    {session.endedAt && (
                      <button
                        className="button secondary"
                        type="button"
                        disabled={continueSession.isPending}
                        onClick={() => continueSession.mutate(session)}
                      >
                        Continue collaboration
                      </button>
                    )}
                  </article>
                ))
              ) : (
                <span className="muted small-note">
                  No sessions recorded yet.
                </span>
              )}
              {historyData.length > 0 && (
                <small className="muted">
                  Latest activity:{" "}
                  {new Date(historyData[0].createdAt).toLocaleString()}
                </small>
              )}
            </div>
          </aside>
        )}
      </div>
      {selectedSessionId && sessionDetails.data?.session && (
        <div
          className="modal-backdrop"
          onClick={() => setSelectedSessionId(null)}
        >
          <section
            className="modal-card surface collaboration-session-detail"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="modal-header">
              <div>
                <small className="eyebrow">COLLABORATION HISTORY</small>
                <h2>{sessionDetails.data.session.title}</h2>
              </div>
              <button
                className="icon small-icon"
                type="button"
                aria-label="Close saved collaboration"
                onClick={() => setSelectedSessionId(null)}
              >
                <X size={17} />
              </button>
            </div>
            <div className="collaboration-session-detail-meta">
              <span>
                {new Date(
                  sessionDetails.data.session.startedAt,
                ).toLocaleString()}
              </span>
              <span>
                {sessionDetails.data.session.participants?.length || 0}{" "}
                participants
              </span>
              <span>
                {Math.round(
                  (sessionDetails.data.session.durationSeconds || 0) / 60,
                )}{" "}
                min
              </span>
            </div>
            <div className="collaboration-session-detail-people">
              {sessionDetails.data.session.participants?.map((participant) => (
                <span key={idOf(participant)}>
                  {participant.avatar ? (
                    <img src={participant.avatar} alt={participant.name} />
                  ) : (
                    (participant.name || "?").slice(0, 2).toUpperCase()
                  )}
                  {participant.name}
                </span>
              ))}
            </div>
            <p>
              {sessionDetails.data.session.summary || "No summary recorded."}
            </p>
            <div className="collaboration-session-detail-chat">
              {sessionDetails.data.messages?.map((message) => (
                <p key={idOf(message)}>
                  <strong>{message.sender?.name || "Member"}:</strong>{" "}
                  {message.text}
                </p>
              ))}
            </div>
            {sessionDetails.data.session.snapshot && (
              <BoardCanvas
                boardId={boardId}
                isEditor={false}
                snapshot={sessionDetails.data.session.snapshot}
              />
            )}
            <button
              className="button primary"
              type="button"
              disabled={continueSession.isPending}
              onClick={() => {
                continueSession.mutate(sessionDetails.data.session);
                setSelectedSessionId(null);
              }}
            >
              Start new session from this board
            </button>
          </section>
        </div>
      )}
    </div>
  );
}
