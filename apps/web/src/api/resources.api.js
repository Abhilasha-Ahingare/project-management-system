import api, { unwrap } from "./client";
const get = (path, params) => api.get(path, { params }).then(unwrap);
const write = (method, path, data) => api[method](path, data).then(unwrap);
export const auth = {
  login: (data) => write("post", "/auth/login", data),
  refresh: () => write("post", "/auth/refresh"),
  logout: () => write("post", "/auth/logout"),
  me: () => get("/users/me"),
};
export const members = {
  list: () => get("/users"),
  search: (q) => get("/users/search", { q }),
  create: (data) => write("post", "/users", data),
  update: (id, data) => write("patch", `/users/${id}`, data),
  remove: (id) => write("delete", `/users/${id}`),
};
export const teams = {
  list: () => get("/teams"),
  detail: (id) => get(`/teams/${id}`),
  create: (data) => write("post", "/teams", data),
  update: (id, data) => write("patch", `/teams/${id}`, data),
  remove: (id) => write("delete", `/teams/${id}`),
  addMember: (id, data) => write("post", `/teams/${id}/members`, data),
  removeMember: (teamId, userId) =>
    write("delete", `/teams/${teamId}/members/${userId}`),
};
export const projects = {
  list: () => get("/projects"),
  detail: (id) => get(`/projects/${id}`),
  create: (data) => write("post", "/projects", data),
  update: (id, data) => write("patch", `/projects/${id}`, data),
  remove: (id) => write("delete", `/projects/${id}`),
  addMember: (id, data) => write("post", `/projects/${id}/members`, data),
  removeMember: (projectId, userId) =>
    write("delete", `/projects/${projectId}/members/${userId}`),
};
export const tasks = {
  mine: () => get("/tasks/me"),
  summary: () => get("/tasks/me/summary"),
  report: () => get("/task-report"),
  list: (projectId, params) => get(`/projects/${projectId}/tasks`, params),
  detail: (id) => get(`/tasks/${id}`),
  create: (projectId, data) =>
    write("post", `/projects/${projectId}/tasks`, data),
  update: (id, data) => write("patch", `/tasks/${id}`, data),
  remove: (id) => write("delete", `/tasks/${id}`),
};
export const notifications = {
  list: (params) => get("/notifications", { limit: 100, ...params }),
  read: (id) => write("patch", `/notifications/${id}/read`),
  readAll: () => write("patch", "/notifications/read-all"),
  remove: (id) => write("delete", `/notifications/${id}`),
  clear: () => write("delete", "/notifications"),
};
export const invitations = {
  list: () => get("/invitations"),
  create: (data) => write("post", "/invitations", data),
  respond: (id, decision) =>
    write("patch", `/invitations/${id}/respond`, { decision }),
};
export const chat = {
  list: (scope, id) =>
    get(`/chat/${scope}/${id}`).catch((error) => {
      if (error.response?.status === 404) return [];
      throw error;
    }),
  send: (scope, id, data) => write("post", `/chat/${scope}/${id}`, data),
  pin: (messageId, isPinned) =>
    write("patch", `/chat/messages/${messageId}/pin`, { isPinned }),
  remove: (messageId) => write("delete", `/chat/messages/${messageId}`),
  clear: (projectId) => write("delete", `/chat/Project/${projectId}`),
};
export const todos = {
  list: (projectId) => get(`/projects/${projectId}/todos`),
  create: (projectId, title) =>
    write("post", `/projects/${projectId}/todos`, { title }),
  update: (id, data) => write("patch", `/todos/${id}`, data),
  remove: (id) => write("delete", `/todos/${id}`),
};
export const collaboration = {
  boards: (projectId) => get(`/projects/${projectId}/collaboration/boards`),
  createBoard: (projectId, data) =>
    write("post", `/projects/${projectId}/collaboration/boards`, data),
  inviteProject: (projectId, data) =>
    write("post", `/projects/${projectId}/collaboration/invitations`, data),
  removeProjectMember: (projectId, userId) =>
    write("delete", `/projects/${projectId}/collaboration/members/${userId}`),
  detail: (boardId) => get(`/collaboration/boards/${boardId}`),
  invite: (boardId, data) =>
    write("post", `/collaboration/boards/${boardId}/invitations`, data),
  requestJoin: (boardId) =>
    write("post", `/collaboration/boards/${boardId}/join-requests`),
  pendingJoinRequests: (boardId) =>
    get(`/collaboration/boards/${boardId}/join-requests`),
  respondJoinRequest: (requestId, decision) =>
    write("patch", `/collaboration/join-requests/${requestId}`, { decision }),
  snapshot: (boardId) => get(`/collaboration/boards/${boardId}/snapshot`),
  saveSnapshot: (boardId, snapshot) =>
    write("post", `/collaboration/boards/${boardId}/snapshot`, { snapshot }),
  history: (boardId) => get(`/collaboration/boards/${boardId}/history`),
  sessions: (boardId) => get(`/collaboration/boards/${boardId}/sessions`),
  sessionDetails: (sessionId) => get(`/collaboration/sessions/${sessionId}`),
  startSession: (boardId, data) =>
    write("post", `/collaboration/boards/${boardId}/sessions`, data),
  continueSession: (sessionId, data) =>
    write("post", `/collaboration/sessions/${sessionId}/continue`, data),
  endSession: (sessionId) =>
    write("patch", `/collaboration/sessions/${sessionId}/end`),
  leaveSession: (sessionId) =>
    write("delete", `/collaboration/sessions/${sessionId}/participants/me`),
  removeBoard: (boardId) => write("delete", `/collaboration/boards/${boardId}`),
  clearSessions: (boardId) =>
    write("delete", `/collaboration/boards/${boardId}/sessions`),
  chat: (boardId) => get(`/chat/CollaborationBoard/${boardId}`),
  sendChat: (boardId, data) =>
    write("post", `/chat/CollaborationBoard/${boardId}`, data),
  askAI: (boardId, question) =>
    write("post", `/collaboration/boards/${boardId}/ai`, { question }),
};
export const activities = { mine: () => get("/activities/me/feed") };
export const files = {
  list: (type, id) => get(`/files/${type}/${id}`),
  upload: (type, id, file, onUploadProgress) => {
    const body = new FormData();
    body.append("file", file);
    return api
      .post(`/files/${type}/${id}`, body, {
        headers: { "Content-Type": "multipart/form-data" },
        onUploadProgress,
      })
      .then(unwrap);
  },
  download: (id) => api.get(`/files/${id}/download`, { responseType: "blob" }),
  remove: (id) => write("delete", `/files/${id}`),
};
