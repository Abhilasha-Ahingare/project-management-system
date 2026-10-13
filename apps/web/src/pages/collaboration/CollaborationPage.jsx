import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useSelector } from "react-redux";
import { Excalidraw } from "@excalidraw/excalidraw";
import "@excalidraw/excalidraw/index.css";
import {
  ArrowLeft,
  Clock3,
  Check,
  FolderKanban,
  History,
  MessageCircle,
  Plus,
  RotateCcw,
  Send,
  Sparkles,
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
import { mergeSceneElements } from "./sceneSync.js";
import { playNotificationSound } from "../../utils/notificationSound";

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
const memberInitial = (member) =>
  (member?.name || member?.email || "?").trim().slice(0, 1).toUpperCase();

const normalizeAppState = (appState) => {
  if (!appState) return undefined;
  const normalized = { ...appState };
  if (normalized.collaborators && !(normalized.collaborators instanceof Map)) {
    normalized.collaborators = new Map(
      Array.isArray(normalized.collaborators)
        ? normalized.collaborators
        : Object.entries(normalized.collaborators),
    );
  }
  return normalized;
};

function BoardCanvas({
  boardId,
  isEditor,
  snapshot,
  onPresence,
  onChatUpdate,
  onSessionUpdate,
  onJoinRequestUpdate,
}) {
  const token = localStorage.getItem("projecthub_access_token");
  const apiRef = useRef(null);
  const socketRef = useRef(null);
  const saveTimer = useRef(null);
  const pendingSnapshot = useRef(null);
  const applyingRemote = useRef(false);
  const presenceRef = useRef(onPresence);
  const chatUpdateRef = useRef(onChatUpdate);
  const sessionUpdateRef = useRef(onSessionUpdate);
  const joinRequestUpdateRef = useRef(onJoinRequestUpdate);
  presenceRef.current = onPresence;
  chatUpdateRef.current = onChatUpdate;
  sessionUpdateRef.current = onSessionUpdate;
  joinRequestUpdateRef.current = onJoinRequestUpdate;
  const initialData = snapshot?.elements
    ? {
        elements: snapshot.elements,
        appState: normalizeAppState(snapshot.appState),
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
      const currentElements = apiRef.current.getSceneElementsIncludingDeleted();
      const merged = mergeSceneElements(remote.elements, currentElements);
      applyingRemote.current = true;
      if (remote.files) apiRef.current.addFiles(Object.values(remote.files));
      apiRef.current.updateScene({
        elements: merged.elements,
      });
      window.setTimeout(() => {
        applyingRemote.current = false;
        if (merged.hasLocalChanges && apiRef.current && socketRef.current) {
          const mergedSnapshot = {
            elements: apiRef.current.getSceneElementsIncludingDeleted(),
            appState: apiRef.current.getAppState(),
            files: apiRef.current.getFiles(),
          };
          pendingSnapshot.current = mergedSnapshot;
          if (saveTimer.current) window.clearTimeout(saveTimer.current);
          saveTimer.current = null;
          socketRef.current.emit("collaboration_board_update", {
            boardId,
            snapshot: mergedSnapshot,
          });
        }
      }, 80);
    };
    const refreshChat = () => chatUpdateRef.current?.();
    const refreshSessions = () => sessionUpdateRef.current?.();
    const joinRequestCreated = (event) =>
      joinRequestUpdateRef.current?.({ ...event, type: "created" });
    const joinRequestUpdated = (event) =>
      joinRequestUpdateRef.current?.({ ...event, type: "updated" });
    socket.on("collaboration_board_updated", applyRemoteUpdate);
    socket.on("chat:message", refreshChat);
    socket.on("chat:message-deleted", refreshChat);
    socket.on("collaboration_session_updated", refreshSessions);
    socket.on("collaboration_join_request_created", joinRequestCreated);
    socket.on("collaboration_join_request_updated", joinRequestUpdated);
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
      if (pendingSnapshot.current && socketRef.current) {
        socketRef.current.emit("collaboration_board_update", {
          boardId,
          snapshot: pendingSnapshot.current,
        });
      }
      socket.emit("leave_collaboration_board", boardId);
      socket.off("collaboration_board_updated", applyRemoteUpdate);
      socket.off("chat:message", refreshChat);
      socket.off("chat:message-deleted", refreshChat);
      socket.off("collaboration_session_updated", refreshSessions);
      socket.off("collaboration_join_request_created", joinRequestCreated);
      socket.off("collaboration_join_request_updated", joinRequestUpdated);
      socket.off("collaboration_participant_joined", joined);
      socket.off("collaboration_participant_left", left);
      socket.off("collaboration_participants");
      socket.disconnect();
      socketRef.current = null;
    };
  }, [boardId, token]);

  const handleChange = (elements, appState, files) => {
    if (!isEditor || !token || applyingRemote.current) return;
    pendingSnapshot.current = { elements, appState, files };
    if (saveTimer.current) return;
    saveTimer.current = window.setTimeout(() => {
      saveTimer.current = null;
      const snapshotToSend = pendingSnapshot.current;
      if (!snapshotToSend) return;
      socketRef.current?.emit(
        "collaboration_board_update",
        { boardId, snapshot: snapshotToSend },
        (result) => {
          if (!result?.success) {
            console.error(
              "[ProjectHub] collaboration update failed",
              result?.message,
            );
            return;
          }
          if (pendingSnapshot.current === snapshotToSend)
            pendingSnapshot.current = null;
        },
      );
    }, 100);
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
  const [aiPrompt, setAiPrompt] = useState("");
  const [aiAnswer, setAiAnswer] = useState("");
  const [selectedMemberIds, setSelectedMemberIds] = useState([]);
  const [invitePermission, setInvitePermission] = useState("editor");
  const [drawerMode, setDrawerMode] = useState(null);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [sessionTitle, setSessionTitle] = useState("Collaboration session");
  const [activeParticipants, setActiveParticipants] = useState([]);
  const [liveJoinRequests, setLiveJoinRequests] = useState([]);
  const [myJoinRequest, setMyJoinRequest] = useState(null);
  const [selectedSessionId, setSelectedSessionId] = useState(null);

  useEffect(() => {
    setLiveJoinRequests([]);
  }, [boardId]);

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
    refetchInterval: projectId && !boardId ? 3000 : false,
  });
  const board = useQuery({
    queryKey: ["collaboration-board", boardId],
    queryFn: () => collaboration.detail(boardId),
    enabled: Boolean(boardId),
    refetchInterval: (query) =>
      boardId && !query.state.data?.canViewBoardContent ? 3000 : false,
  });
  const messages = useQuery({
    queryKey: ["collaboration-chat", boardId],
    queryFn: () => collaboration.chat(boardId),
    enabled: Boolean(boardId && board.data?.canViewBoardContent),
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
  const joinRequests = useQuery({
    queryKey: ["collaboration-join-requests", boardId],
    queryFn: () => collaboration.pendingJoinRequests(boardId),
    enabled: Boolean(
      boardId &&
      board.data?.activeSession &&
      String(
        idOf(
          board.data.activeSession.createdBy ||
            board.data.activeSession.participants?.[0],
        ),
      ) === String(user?.id || user?._id),
    ),
  });
  const history = useQuery({
    queryKey: ["collaboration-history", boardId],
    queryFn: () => collaboration.history(boardId),
    enabled: Boolean(boardId && board.data?.canViewBoardContent),
  });
  useEffect(() => {
    setMyJoinRequest(board.data?.myJoinRequest || null);
  }, [board.data?.myJoinRequest]);

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
      if (boardId) {
        return collaboration.invite(boardId, {
          userIds: selectedMemberIds,
          permission: invitePermission,
        });
      }
      return collaboration.inviteProject(projectId, {
        userIds: selectedMemberIds,
        permission: invitePermission,
      });
    },
    onSuccess: () => {
      setSelectedMemberIds([]);
      qc.invalidateQueries({ queryKey: ["collaboration-project", projectId] });
      if (boardId) {
        qc.invalidateQueries({ queryKey: ["collaboration-board", boardId] });
      }
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
  const askAI = useMutation({
    mutationFn: () => collaboration.askAI(boardId, aiPrompt.trim()),
    onSuccess: (result) => {
      setAiAnswer(result.answer || "No answer returned.");
      setAiPrompt("");
    },
    onError: (error) => toast.error(apiMessage(error, "Unable to ask AI")),
  });
  const closeDrawer = () => {
    setDrawerMode(null);
    setAiPrompt("");
    setAiAnswer("");
  };
  const startSession = useMutation({
    mutationFn: (data) => collaboration.startSession(boardId, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["collaboration-sessions", boardId] });
      qc.invalidateQueries({ queryKey: ["collaboration-board", boardId] });
      qc.invalidateQueries({ queryKey: ["collaboration-boards", projectId] });
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
  const requestJoin = useMutation({
    mutationFn: () => collaboration.requestJoin(boardId),
    onSuccess: (request) => {
      setMyJoinRequest(request);
      toast.success("Request sent to the people in this meeting.");
    },
    onError: (error) =>
      toast.error(apiMessage(error, "Unable to request meeting access")),
  });
  const respondJoinRequest = useMutation({
    mutationFn: ({ requestId, decision }) =>
      collaboration.respondJoinRequest(requestId, decision),
    onSuccess: (_, variables) => {
      qc.invalidateQueries({
        queryKey: ["collaboration-join-requests", boardId],
      });
      qc.invalidateQueries({ queryKey: ["collaboration-sessions", boardId] });
      qc.invalidateQueries({ queryKey: ["collaboration-board", boardId] });
      qc.invalidateQueries({ queryKey: ["collaboration-boards", projectId] });
      toast.success(
        variables.decision === "approved"
          ? "Collaborator added to the meeting."
          : "Join request rejected.",
      );
    },
    onError: (error) =>
      toast.error(apiMessage(error, "Unable to respond to join request")),
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
  const canViewBoardContent =
    board.data?.canViewBoardContent || user?.role === "admin";
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
  const acceptedBoardParticipantIds = new Set(
    (board.data?.board?.participants || [])
      .filter((participant) => participant.status === "accepted")
      .map((participant) => String(idOf(participant.user))),
  );
  const pendingBoardInviteIds = new Set(
    (board.data?.pendingInvitations || []).map((invitation) =>
      String(idOf(invitation.recipient)),
    ),
  );
  const canInviteBoard = !boardId || Boolean(board.data?.isManager);
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
  const collaborationPeople = [
    user,
    ...(board.data?.board?.participants || [])
      .filter((participant) => participant.status !== "removed")
      .map((participant) => participant.user),
    ...members.filter((member) =>
      selectedProject.data?.collaborators?.some(
        (collaborator) =>
          String(idOf(collaborator.user)) === String(idOf(member)) &&
          collaborator.status === "accepted",
      ),
    ),
    ...activeParticipants,
  ]
    .filter(Boolean)
    .filter(
      (member, index, values) =>
        values.findIndex(
          (item) => String(idOf(item)) === String(idOf(member)),
        ) === index,
    );
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
  const meetingCreatorId = idOf(
    activeSession?.createdBy ||
      activeSession?.participants?.[0] ||
      board.data?.activeSession?.createdBy ||
      board.data?.activeSession?.participants?.[0],
  );
  const isMeetingCreator = String(meetingCreatorId) === String(currentUserId);
  const sessionParticipants = activeSession?.participants || [];
  const inActiveSession = sessionParticipants.some(
    (participant) => String(idOf(participant)) === String(currentUserId),
  );
  const activeBoardParticipantIds = new Set(
    activeParticipants.map((participant) => String(idOf(participant))),
  );
  const pendingJoinRequests = [
    ...list(joinRequests.data),
    ...liveJoinRequests,
  ].filter(
    (request, index, requests) =>
      request.status === "pending" &&
      requests.findIndex(
        (item) => String(idOf(item)) === String(idOf(request)),
      ) === index,
  );
  const handleJoinRequestEvent = (event) => {
    const request = event?.request;
    if (!request && event?.requestId) {
      if (String(idOf(myJoinRequest)) === String(event.requestId)) {
        setMyJoinRequest(null);
      }
      qc.invalidateQueries({
        queryKey: ["collaboration-join-requests", boardId],
      });
      return;
    }
    if (!request) return;
    if (event.type === "created") {
      if (String(idOf(request.requester)) === String(currentUserId)) {
        setMyJoinRequest(request);
      } else {
        playNotificationSound();
        setLiveJoinRequests((current) => [
          request,
          ...current.filter(
            (item) => String(idOf(item)) !== String(idOf(request)),
          ),
        ]);
      }
    } else if (event.type === "updated") {
      if (String(idOf(myJoinRequest)) === String(idOf(request))) {
        setMyJoinRequest(null);
      }
      setLiveJoinRequests((current) =>
        current.filter((item) => String(idOf(item)) !== String(idOf(request))),
      );
    }
    qc.invalidateQueries({
      queryKey: ["collaboration-join-requests", boardId],
    });
    qc.invalidateQueries({ queryKey: ["collaboration-sessions", boardId] });
  };

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
            {boardId
              ? activeSession
                ? "Invites close when a meeting starts. Team members can request to join instead."
                : "Invite team members to this whiteboard before starting its meeting."
              : "Invite team members to collaborate on this project."}
          </p>
          <select
            className="select"
            value={invitePermission}
            disabled={
              !canInviteProject ||
              !canInviteBoard ||
              (Boolean(boardId) && Boolean(activeSession))
            }
            onChange={(event) => setInvitePermission(event.target.value)}
          >
            <option value="editor">Can edit</option>
            <option value="viewer">Can view</option>
          </select>
          <div className="collaboration-member-list">
            {inviteMembers.map((member) => {
              const id = idOf(member);
              const memberId = String(id);
              const added = boardId
                ? acceptedBoardParticipantIds.has(memberId)
                : acceptedCollaboratorIds.has(memberId);
              const invited = boardId
                ? pendingBoardInviteIds.has(memberId)
                : pendingCollaboratorIds.has(memberId);
              const inMeeting = sessionParticipants.some(
                (participant) => String(idOf(participant)) === memberId,
              );
              const onlineOnBoard = activeBoardParticipantIds.has(memberId);
              return (
                <label
                  key={id}
                  className={`collaboration-member-row ${added || inMeeting ? "is-added" : ""} ${invited ? "is-invited" : ""}`}
                >
                  <input
                    type="checkbox"
                    disabled={
                      !canInviteProject ||
                      !canInviteBoard ||
                      (Boolean(boardId) && Boolean(activeSession)) ||
                      added ||
                      invited ||
                      inMeeting ||
                      onlineOnBoard
                    }
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
                      {inMeeting
                        ? "In this meeting"
                        : onlineOnBoard
                          ? "On this whiteboard"
                          : added
                            ? boardId
                              ? "Approved for this whiteboard"
                              : "Joined collaboration"
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
              !selectedMemberIds.length ||
              invite.isPending ||
              !canInviteProject ||
              !canInviteBoard ||
              (Boolean(boardId) && Boolean(activeSession))
            }
            onClick={() => invite.mutate()}
          >
            <Users size={15} />
            {boardId ? "Invite to whiteboard" : "Invite to project"}
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
                    <span className="collaboration-board-link-label">
                      <span>{item.name}</span>
                      {item.activeSession && (
                        <small className="collaboration-live-board-status">
                          <span /> LIVE ·{" "}
                          {item.activeSession.participants?.length || 0}{" "}
                          {item.activeSession.participants?.length === 1
                            ? "person"
                            : "people"}
                          {item.activeSession.participants?.length > 0 &&
                            ` · ${item.activeSession.participants
                              .map((participant) => participant.name)
                              .filter(Boolean)
                              .join(", ")}`}
                        </small>
                      )}
                    </span>
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
                  {activeSession && (
                    <span className="collaboration-meeting-status">
                      <span /> LIVE · {sessionParticipants.length} in meeting
                    </span>
                  )}
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
                            memberInitial(member)
                          )}
                        </span>
                      ))}
                  </div>
                  <button
                    className="icon small-icon collaboration-drawer-toggle"
                    type="button"
                    title="Open collaboration chat"
                    aria-label="Open collaboration chat"
                    disabled={!canViewBoardContent}
                    onClick={() => setDrawerMode("chat")}
                  >
                    <MessageCircle size={16} />
                  </button>
                  <button
                    className="icon small-icon collaboration-drawer-toggle"
                    type="button"
                    title="Open AI assistant"
                    aria-label="Open AI assistant"
                    disabled={!canViewBoardContent}
                    onClick={() => setDrawerMode("ai")}
                  >
                    <Sparkles size={16} />
                  </button>
                  <button
                    className="icon small-icon collaboration-drawer-toggle"
                    type="button"
                    title="Open session history"
                    aria-label="Open session history"
                    disabled={!canViewBoardContent}
                    onClick={() => setDrawerMode("history")}
                  >
                    <History size={16} />
                  </button>
                  <button
                    className="button secondary collaboration-chat-toggle"
                    type="button"
                    disabled={!canInviteBoard || Boolean(activeSession)}
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
                      {inActiveSession ? (
                        <>
                          <button
                            className="button secondary"
                            type="button"
                            disabled={leaveSession.isPending}
                            onClick={() =>
                              leaveSession.mutate(activeSession._id)
                            }
                          >
                            Leave session
                          </button>
                          <button
                            className="button secondary"
                            type="button"
                            disabled={
                              endSession.isPending || !board.data.isManager
                            }
                            onClick={() => endSession.mutate(activeSession._id)}
                          >
                            <Clock3 size={15} /> End session
                          </button>
                        </>
                      ) : board.data.canRequestJoin ? (
                        <button
                          className="button primary"
                          type="button"
                          disabled={
                            requestJoin.isPending || Boolean(myJoinRequest)
                          }
                          onClick={() => requestJoin.mutate()}
                        >
                          <Users size={15} />
                          {myJoinRequest
                            ? "Request sent · awaiting approval"
                            : "Request to join"}
                        </button>
                      ) : (
                        <button
                          className="button primary"
                          type="button"
                          disabled={startSession.isPending}
                          onClick={() =>
                            startSession.mutate({ title: sessionTitle })
                          }
                        >
                          <Users size={15} /> Join meeting
                        </button>
                      )}
                    </>
                  ) : board.data.isManager ||
                    board.data.participant?.status === "accepted" ? (
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
                  ) : (
                    <span className="collaboration-invite-required">
                      A board manager must invite you before the meeting starts.
                    </span>
                  )}
                </div>
              </div>
              {canViewBoardContent ? (
                <BoardCanvas
                  boardId={boardId}
                  isEditor={isEditor}
                  snapshot={board.data.board.snapshot}
                  onPresence={updatePresence}
                  onChatUpdate={() =>
                    qc.invalidateQueries({
                      queryKey: ["collaboration-chat", boardId],
                    })
                  }
                  onSessionUpdate={() => {
                    qc.invalidateQueries({
                      queryKey: ["collaboration-sessions", boardId],
                    });
                    qc.invalidateQueries({
                      queryKey: ["collaboration-board", boardId],
                    });
                    qc.invalidateQueries({
                      queryKey: ["collaboration-boards", projectId],
                    });
                    qc.invalidateQueries({
                      queryKey: ["collaboration-join-requests", boardId],
                    });
                    qc.invalidateQueries({
                      queryKey: ["collaboration-history", boardId],
                    });
                  }}
                  onJoinRequestUpdate={handleJoinRequestEvent}
                />
              ) : (
                <div className="collaboration-board-approval-gate">
                  <Users size={24} />
                  <h3>
                    {activeSession
                      ? "Meeting in progress"
                      : "Whiteboard access required"}
                  </h3>
                  <p>
                    {sessionParticipants.length > 0
                      ? `Currently in the meeting: ${sessionParticipants
                          .map((participant) => participant.name)
                          .filter(Boolean)
                          .join(", ")}`
                      : "Only people invited to this whiteboard can see its contents."}
                  </p>
                  <strong>
                    {myJoinRequest
                      ? "Your request is waiting for approval."
                      : activeSession
                        ? "Use Request to join to ask the meeting participants."
                        : "Ask a whiteboard manager to invite you."}
                  </strong>
                </div>
              )}
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
            className={`surface collaboration-chat ${drawerMode ? "open" : ""} ${drawerMode === "ai" ? "ai-mode" : ""}`}
          >
            <div className="collaboration-chat-header">
              <div className="section-title">
                {drawerMode === "ai" ? (
                  <Sparkles size={18} />
                ) : drawerMode === "history" ? (
                  <History size={18} />
                ) : (
                  <MessageCircle size={18} />
                )}
                <div>
                  <h2>
                    {drawerMode === "ai"
                      ? "ProjectHub AI"
                      : drawerMode === "history"
                        ? "Session history"
                        : "Collaboration chat"}
                  </h2>
                  {drawerMode === "chat" && (
                    <div className="collaboration-chat-participants">
                      {collaborationPeople.map((member) => (
                        <span
                          className="collaboration-chat-person"
                          key={idOf(member)}
                          title={member.name || "Participant"}
                        >
                          <span className="chat-avatar">
                            {member.avatar ? (
                              <img
                                src={member.avatar}
                                alt={member.name || ""}
                              />
                            ) : (
                              memberInitial(member)
                            )}
                          </span>
                          <small>{member.name || "Member"}</small>
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
              <button
                className="icon small-icon"
                type="button"
                title="Close collaboration chat"
                aria-label="Close collaboration chat"
                onClick={closeDrawer}
              >
                <X size={16} />
              </button>
            </div>
            {drawerMode === "ai" && (
              <div className="collaboration-ai">
                <p className="muted small-note">
                  Ask questions about this board's saved chat and activity.
                </p>
                {aiAnswer && (
                  <p className="collaboration-ai-answer">{aiAnswer}</p>
                )}
                <div className="collaboration-ai-form">
                  <input
                    type="text"
                    placeholder="What has been completed?"
                    value={aiPrompt}
                    onChange={(event) => setAiPrompt(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" && aiPrompt.trim())
                        askAI.mutate();
                    }}
                  />
                  <button
                    className="icon send"
                    type="button"
                    disabled={!aiPrompt.trim() || askAI.isPending}
                    onClick={() => askAI.mutate()}
                    aria-label="Ask AI"
                  >
                    <Send size={16} />
                  </button>
                </div>
              </div>
            )}
            {drawerMode === "chat" && (
              <>
                <div className="collaboration-chat-thread">
                  {messageData.map((message) => (
                    <div
                      className={`collaboration-chat-message ${String(idOf(message.sender)) === String(currentUserId) ? "is-own" : "is-other"}`}
                      key={idOf(message)}
                    >
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
              </>
            )}
            {drawerMode === "history" && (
              <div className="collaboration-history collaboration-history-drawer">
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
                      <strong>
                        {session.title || "Collaboration session"}
                      </strong>
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
            )}
          </aside>
        )}
      </div>
      {boardId &&
        activeSession &&
        isMeetingCreator &&
        pendingJoinRequests.length > 0 && (
          <aside className="collaboration-join-requests" aria-live="polite">
            <div className="collaboration-join-requests-header">
              <div>
                <small>MEETING ACCESS</small>
                <strong>{pendingJoinRequests.length} request(s) to join</strong>
              </div>
              <span className="collaboration-meeting-status">
                <span /> LIVE
              </span>
            </div>
            {pendingJoinRequests.map((request) => (
              <div className="collaboration-join-request" key={idOf(request)}>
                <span className="presence-avatar">
                  {request.requester?.avatar ? (
                    <img
                      src={request.requester.avatar}
                      alt={request.requester.name || ""}
                    />
                  ) : (
                    memberInitial(request.requester)
                  )}
                </span>
                <div className="collaboration-join-request-person">
                  <strong>{request.requester?.name || "Team member"}</strong>
                  <small>wants to join this meeting</small>
                </div>
                <button
                  className="icon small-icon join-request-approve"
                  type="button"
                  title="Approve request"
                  aria-label={`Approve ${request.requester?.name || "member"}`}
                  disabled={respondJoinRequest.isPending}
                  onClick={() =>
                    respondJoinRequest.mutate({
                      requestId: idOf(request),
                      decision: "approved",
                    })
                  }
                >
                  <Check size={16} />
                </button>
                <button
                  className="icon small-icon danger"
                  type="button"
                  title="Reject request"
                  aria-label={`Reject ${request.requester?.name || "member"}`}
                  disabled={respondJoinRequest.isPending}
                  onClick={() =>
                    respondJoinRequest.mutate({
                      requestId: idOf(request),
                      decision: "rejected",
                    })
                  }
                >
                  <X size={16} />
                </button>
              </div>
            ))}
          </aside>
        )}
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
