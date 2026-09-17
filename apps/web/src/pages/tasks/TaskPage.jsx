import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useParams } from "react-router-dom";
import { useEffect, useMemo, useRef, useState } from "react";
import { useSelector } from "react-redux";
import {
  ArrowLeft,
  Check,
  CheckCheck,
  Download,
  FileText,
  ListTodo,
  MessageCircle,
  MoreVertical,
  Pin,
  Send,
  Smile,
  Trash2,
  Upload,
} from "lucide-react";
import { toast } from "react-toastify";
import EmojiPicker from "emoji-picker-react";
import { chat, files, projects, todos } from "../../api/resources.api";
import { apiMessage } from "../../api/client";
import { connectRealtime } from "../../api/socket";
import { Loading, Failed, Empty } from "../../components/ui/States";

const list = (value) =>
  Array.isArray(value) ? value : value?.items || value?.data || [];
const idOf = (value) => value?._id || value?.id || value;
function ChatImage({ attachment, onOpen }) {
  const [url, setUrl] = useState(null);
  useEffect(() => {
    let live = true;
    let objectUrl = null;
    files
      .download(idOf(attachment))
      .then((response) => {
        objectUrl = URL.createObjectURL(response.data);
        if (live) setUrl(objectUrl);
      })
      .catch(() => {});
    return () => {
      live = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [attachment]);
  return url ? (
    <button
      className="chat-image-button"
      type="button"
      onClick={(event) => {
        event.stopPropagation();
        onOpen();
      }}
    >
      <img src={url} alt={attachment.originalName} />
    </button>
  ) : (
    <span>Loading image...</span>
  );
}

export default function TaskPage() {
  const { taskId: projectId } = useParams();
  const currentUser = useSelector((state) => state.auth.user);
  const queryClient = useQueryClient();
  const [todoInput, setTodoInput] = useState("");
  const [chatText, setChatText] = useState("");
  const [mentionIds, setMentionIds] = useState([]);
  const [pendingFile, setPendingFile] = useState(null);
  const [mentionQuery, setMentionQuery] = useState(null);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [preview, setPreview] = useState(null);
  const [selectedMessageId, setSelectedMessageId] = useState(null);
  const [showChatMenu, setShowChatMenu] = useState(false);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [completingTodoId, setCompletingTodoId] = useState(null);
  const selectedMessageRef = useRef(null);

  const project = useQuery({
    queryKey: ["project", projectId],
    queryFn: () => projects.detail(projectId),
  });
  const todoQuery = useQuery({
    queryKey: ["todos", projectId],
    queryFn: () => todos.list(projectId),
    enabled: project.isSuccess,
  });
  const chatQuery = useQuery({
    queryKey: ["chat", "Project", projectId],
    queryFn: () => chat.list("Project", projectId),
    enabled: project.isSuccess,
  });

  useEffect(() => {
    if (!project.isSuccess) return undefined;
    const token = localStorage.getItem("projecthub_access_token");
    if (!token) return undefined;
    const socket = connectRealtime(token);
    socket.emit("join_project", projectId);
    socket.on("chat:message", () => {
      queryClient.invalidateQueries({
        queryKey: ["chat", "Project", projectId],
      });
    });
    return () => {
      socket.emit("leave_project", projectId);
      socket.disconnect();
    };
  }, [project.isSuccess, projectId, queryClient]);

  useEffect(() => {
    if (!selectedMessageId) return undefined;
    const clearSelectionOutsideMessage = (event) => {
      if (!selectedMessageRef.current?.contains(event.target)) {
        setSelectedMessageId(null);
      }
    };
    document.addEventListener("mousedown", clearSelectionOutsideMessage);
    return () =>
      document.removeEventListener("mousedown", clearSelectionOutsideMessage);
  }, [selectedMessageId]);

  const invalidateTodos = () =>
    queryClient.invalidateQueries({ queryKey: ["todos", projectId] });
  const todoCreate = useMutation({
    mutationFn: () => todos.create(projectId, todoInput.trim()),
    onSuccess: () => {
      setTodoInput("");
      invalidateTodos();
    },
    onError: (error) => toast.error(apiMessage(error, "Unable to add todo")),
  });
  const todoRemove = useMutation({
    mutationFn: (id) => todos.remove(id),
    onSuccess: () => {
      setCompletingTodoId(null);
      invalidateTodos();
    },
    onError: (error) => toast.error(apiMessage(error, "Unable to remove todo")),
  });
  const refreshChat = () =>
    queryClient.invalidateQueries({ queryKey: ["chat", "Project", projectId] });
  const send = useMutation({
    mutationFn: async ({ text, file }) => {
      let attachmentId;
      if (file) {
        const uploaded = await files.upload("Project", projectId, file);
        attachmentId = idOf(uploaded);
      }
      return chat.send("Project", projectId, {
        text,
        attachmentId,
        mentionedUserIds: mentionIds,
      });
    },
    onSuccess: () => {
      setChatText("");
      setMentionIds([]);
      setPendingFile(null);
      setMentionQuery(null);
      setShowEmojiPicker(false);
      refreshChat();
    },
    onError: (error) => toast.error(apiMessage(error, "Message failed")),
  });
  const pin = useMutation({
    mutationFn: ({ id, isPinned }) => chat.pin(id, isPinned),
    onSuccess: refreshChat,
    onError: (error) => toast.error(apiMessage(error, "Unable to update pin")),
  });
  const removeMessage = useMutation({
    mutationFn: (messageId) => chat.remove(messageId),
    onSuccess: () => {
      setSelectedMessageId(null);
      refreshChat();
    },
    onError: (error) =>
      toast.error(apiMessage(error, "Unable to delete message")),
  });
  const clearChat = useMutation({
    mutationFn: () => chat.clear(projectId),
    onSuccess: () => {
      setSelectedMessageId(null);
      setShowChatMenu(false);
      setShowClearConfirm(false);
      refreshChat();
    },
    onError: (error) => toast.error(apiMessage(error, "Unable to clear chats")),
  });

  const members = useMemo(() => {
    if (!project.data) return [];
    const direct = list(project.data.members).map(
      (member) => member.user || member,
    );
    const team = list(project.data.team?.members).map(
      (member) => member.user || member,
    );
    const teamLead = project.data.team?.lead ? [project.data.team.lead] : [];
    const owner = project.data.owner ? [project.data.owner] : [];
    return [
      ...new Map(
        [...owner, ...direct, ...teamLead, ...team]
          .filter((member) => idOf(member))
          .map((member) => [idOf(member), member]),
      ).values(),
    ];
  }, [project.data]);

  const sendText = () => {
    if (!chatText.trim() && !pendingFile) return;
    send.mutate({ text: chatText.trim(), file: pendingFile });
  };
  const selectMention = (member) => {
    const mention = `@${member.name} `;
    setChatText((current) => {
      const atIndex = current.lastIndexOf("@");
      return `${current.slice(0, atIndex)}${mention}`;
    });
    setMentionIds((current) =>
      current.includes(idOf(member)) ? current : [...current, idOf(member)],
    );
    setMentionQuery(null);
  };
  const handleChatTextChange = (event) => {
    const value = event.target.value;
    setChatText(value);
    const match = value.match(/(?:^|\s)@([^\s@]*)$/);
    setMentionQuery(match ? match[1].toLowerCase() : null);
  };
  const download = async (attachment, showPreview = false) => {
    try {
      const response = await files.download(idOf(attachment));
      const url = URL.createObjectURL(response.data);
      if (showPreview) {
        setPreview({
          url,
          name: attachment.originalName || "Image preview",
          attachment,
        });
        return;
      }
      const link = document.createElement("a");
      link.href = url;
      link.download = attachment.originalName || "download";
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch (error) {
      toast.error(apiMessage(error, "Download failed"));
    }
  };

  if (project.isLoading) return <Loading text="Loading project workspace..." />;
  if (project.isError) return <Failed retry={project.refetch} />;
  const item = project.data;
  const todoItems = list(todoQuery.data);
  const messages = list(chatQuery.data);

  return (
    <div className="stack">
      <Link className="back" to="/tasks">
        <ArrowLeft size={16} /> Back to projects
      </Link>
      <header className="surface project-hero">
        <small className="eyebrow">PROJECT WORKSPACE</small>
        <h1>{item.name}</h1>
        <p>{item.description || "Project team workspace"}</p>
        <div className="project-chat-members">
          <strong>{item.team?.name || "Project team"}</strong>
          <span>
            {members.length
              ? `Members: ${members
                  .map((member) => member.name)
                  .filter(Boolean)
                  .join(", ")}`
              : "No members listed"}
          </span>
        </div>
      </header>

      <div className="columns task-layout">
        <aside className="surface task-checklist-panel">
          <div className="section-title">
            <ListTodo size={18} />
            <h2>My todo</h2>
          </div>
          <div className="todo-list">
            {todoItems.length ? (
              todoItems.map((todo) => (
                <div
                  className={`todo-item ${todo.completed || completingTodoId === idOf(todo) ? "complete" : ""}`}
                  key={idOf(todo)}
                >
                  <button
                    className="icon small-icon"
                    type="button"
                    onClick={() => {
                      if (todo.completed || completingTodoId === idOf(todo))
                        return;
                      setCompletingTodoId(idOf(todo));
                      todoRemove.mutate(idOf(todo));
                    }}
                    title="Complete todo"
                  >
                    {todo.completed || completingTodoId === idOf(todo) ? (
                      <CheckCheck size={14} />
                    ) : (
                      <Check size={14} />
                    )}
                  </button>
                  <span>{todo.title}</span>
                  <button
                    className="icon small-icon danger"
                    type="button"
                    onClick={() => todoRemove.mutate(idOf(todo))}
                    title="Remove todo"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              ))
            ) : (
              <Empty
                title="No todos yet"
                text="Add a private todo for this project."
              />
            )}
          </div>
          <div className="todo-input-row">
            <input
              className="field"
              value={todoInput}
              placeholder="Add a todo item"
              onChange={(event) => setTodoInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") todoCreate.mutate();
              }}
            />
            <button
              className="button primary"
              type="button"
              disabled={!todoInput.trim() || todoCreate.isPending}
              onClick={() => todoCreate.mutate()}
            >
              Add
            </button>
          </div>
          <p className="muted small-note">
            Only you can see and change these todos.
          </p>
        </aside>

        <section className="surface task-conversation-panel">
          <div className="section-title">
            <MessageCircle size={18} />
            <h2>{item.team?.name || "Team group chat"}</h2>
            {selectedMessageId && (
              <button
                className="icon chat-delete-button"
                type="button"
                disabled={removeMessage.isPending}
                title="Delete selected message"
                aria-label="Delete selected message"
                onMouseDown={(event) => event.stopPropagation()}
                onClick={() => removeMessage.mutate(selectedMessageId)}
              >
                <Trash2 size={17} />
              </button>
            )}
            <div className="chat-menu-wrap">
              <button
                className="icon"
                type="button"
                title="Chat options"
                aria-label="Chat options"
                onMouseDown={(event) => event.stopPropagation()}
                onClick={() => setShowChatMenu((current) => !current)}
              >
                <MoreVertical size={18} />
              </button>
              {showChatMenu && (
                <div className="chat-menu-popover">
                  <button
                    type="button"
                    disabled={clearChat.isPending || !messages.length}
                    onMouseDown={(event) => event.stopPropagation()}
                    onClick={() => {
                      setShowChatMenu(false);
                      setShowClearConfirm(true);
                    }}
                  >
                    <Trash2 size={14} /> Clear all chats
                  </button>
                </div>
              )}
            </div>
          </div>
          <div className="chat-thread">
            {messages.length ? (
              messages.map((message) => (
                <div
                  className={`chat-message ${idOf(message.sender) === idOf(currentUser) ? "mine" : ""} ${selectedMessageId === idOf(message) ? "selected" : ""}`}
                  key={idOf(message)}
                  ref={
                    selectedMessageId === idOf(message)
                      ? selectedMessageRef
                      : null
                  }
                  onDoubleClick={() =>
                    setSelectedMessageId((current) =>
                      current === idOf(message) ? null : idOf(message),
                    )
                  }
                >
                  <div className="chat-bubble">
                    <strong>
                      {message.sender?.name || message.sender?.email || "Member"}
                    </strong>
                    {message.text && <p>{message.text}</p>}
                    {message.attachment && (
                      <div className="chat-attachment">
                        {message.attachment.mimeType?.startsWith("image/") ? (
                          <ChatImage
                            attachment={message.attachment}
                            onOpen={() => download(message.attachment, true)}
                          />
                        ) : (
                          <FileText size={22} />
                        )}
                        <span>{message.attachment.originalName}</span>
                        <button
                          className="button subtle-button chat-download-button"
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            download(message.attachment);
                          }}
                          title="Download file"
                        >
                          <Download size={13} /> Download
                        </button>
                      </div>
                    )}
                    <div className="chat-message-meta">
                      <span>
                        {new Date(message.createdAt).toLocaleTimeString([], {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </span>
                      <button
                        className="icon small-icon"
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          pin.mutate({
                            id: idOf(message),
                            isPinned: !message.isPinned,
                          });
                        }}
                        title={
                          message.isPinned ? "Unpin message" : "Pin message"
                        }
                      >
                        <Pin
                          size={13}
                          fill={message.isPinned ? "currentColor" : "none"}
                        />
                      </button>
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <Empty
                title="No messages yet"
                text="Start the project team conversation."
              />
            )}
          </div>
          {mentionQuery !== null && (
            <div className="mention-menu">
              {members
                .filter((member) =>
                  member.name?.toLowerCase().includes(mentionQuery),
                )
                .map((member) => (
                  <button
                    type="button"
                    key={idOf(member)}
                    onClick={() => selectMention(member)}
                  >
                    <span className="avatar small-avatar">
                      {member.name?.[0]?.toUpperCase() || "M"}
                    </span>
                    <span>{member.name}</span>
                  </button>
                ))}
              {!members.some((member) =>
                member.name?.toLowerCase().includes(mentionQuery),
              ) && (
                <span className="mention-empty">No matching team member</span>
              )}
            </div>
          )}
          <div className="composer chat-composer">
            <label className="button secondary task-upload-button">
              <Upload size={17} /> Attach
              <input
                hidden
                type="file"
                accept="image/*,.pdf,.txt,.zip"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) setPendingFile(file);
                  event.target.value = "";
                }}
              />
            </label>
            {pendingFile && (
              <div className="pending-attachment composer-attachment">
                <FileText size={15} />
                <span>{pendingFile.name}</span>
                <button
                  className="icon small-icon danger"
                  type="button"
                  onClick={() => setPendingFile(null)}
                  title="Remove attachment"
                >
                  <Trash2 size={13} />
                </button>
              </div>
            )}
            <div className="emoji-picker-wrap">
              <button
                className="icon"
                type="button"
                onClick={() => setShowEmojiPicker((current) => !current)}
                title="Open emoji picker"
              >
                <Smile size={17} />
              </button>
              {showEmojiPicker && (
                <div
                  className="emoji-picker-panel"
                  role="dialog"
                  aria-label="Emoji picker"
                >
                  <EmojiPicker
                    lazyLoadEmojis
                    searchDisabled={false}
                    onEmojiClick={(emojiData) => {
                      setChatText((current) => `${current}${emojiData.emoji}`);
                      setShowEmojiPicker(false);
                    }}
                  />
                </div>
              )}
            </div>
            <input
              placeholder="Write to the project team..."
              value={chatText}
              onChange={handleChatTextChange}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  sendText();
                }
              }}
            />
            <button
              className="icon send"
              disabled={(!chatText.trim() && !pendingFile) || send.isPending}
              onClick={sendText}
              title="Send message"
            >
              <Send size={17} />
            </button>
          </div>
        </section>
      </div>
      {showClearConfirm && (
        <div
          className="modal-backdrop delete-confirm-backdrop"
          role="presentation"
          onClick={() => {
            if (!clearChat.isPending) setShowClearConfirm(false);
          }}
        >
          <div
            className="surface delete-confirm-card"
            role="dialog"
            aria-modal="true"
            aria-labelledby="clear-chat-title"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="delete-confirm-icon">
              <Trash2 size={22} />
            </div>
            <h2 id="clear-chat-title">Clear all chats?</h2>
            <p>
              This will permanently delete every message and attachment from
              this project chat. This action cannot be undone.
            </p>
            <div className="delete-confirm-actions">
              <button
                className="button secondary"
                type="button"
                disabled={clearChat.isPending}
                onClick={() => setShowClearConfirm(false)}
              >
                Cancel
              </button>
              <button
                className="button danger-button"
                type="button"
                disabled={clearChat.isPending}
                onClick={() => clearChat.mutate()}
              >
                <Trash2 size={15} />
                {clearChat.isPending ? "Deleting..." : "Delete permanently"}
              </button>
            </div>
          </div>
        </div>
      )}
      {preview && (
        <div
          className="modal-backdrop"
          onClick={() => {
            URL.revokeObjectURL(preview.url);
            setPreview(null);
          }}
        >
          <div
            className="file-preview-modal"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="modal-header">
              <h2>{preview.name}</h2>
              <button
                className="button secondary preview-download-button"
                type="button"
                onClick={() => download(preview.attachment)}
              >
                <Download size={14} /> Download
              </button>
              <button
                className="icon small-icon"
                type="button"
                onClick={() => {
                  URL.revokeObjectURL(preview.url);
                  setPreview(null);
                }}
              >
                ×
              </button>
            </div>
            <img src={preview.url} alt={preview.name} />
          </div>
        </div>
      )}
    </div>
  );
}
