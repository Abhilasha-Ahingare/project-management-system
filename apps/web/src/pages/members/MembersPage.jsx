import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useSelector } from "react-redux";
import {
  MoreHorizontal,
  Pencil,
  Search,
  Trash2,
  UserRound,
  Check,
  UserX,
} from "lucide-react";
import { useForm } from "react-hook-form";
import { toast } from "react-toastify";
import { members } from "../../api/resources.api";
import { apiMessage } from "../../api/client";
import { Loading, Failed, Empty } from "../../components/ui/States";

const list = (value) =>
  Array.isArray(value) ? value : value?.items || value?.data || [];

const defaultValues = {
  name: "",
  email: "",
  password: "",
  designation: "Developer",
  role: "user",
  contactNumber: "",
  address: "",
  isActive: true,
};

export default function MembersPage() {
  const [q, setQ] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editingMember, setEditingMember] = useState(null);
  const [menuOpenId, setMenuOpenId] = useState(null);
  const role = useSelector((state) => state.auth.user?.role);
  const canList = role === "admin";
  const qc = useQueryClient();

  const query = useQuery({
    queryKey: ["members", q, canList],
    queryFn: () => (q.length > 1 ? members.search(q) : members.list()),
  });

  const create = useMutation({
    mutationFn: (values) => {
      if (!editingMember) return members.create(values);
      const payload = { ...values };
      if (!payload.password) delete payload.password;
      return members.update(editingMember._id || editingMember.id, payload);
    },
    onSuccess: () => {
      setShowForm(false);
      setEditingMember(null);
      reset(defaultValues);
      qc.invalidateQueries({ queryKey: ["members"] });
      toast.success(
        editingMember
          ? "Member updated successfully."
          : "Member created successfully.",
      );
    },
    onError: (error) =>
      toast.error(
        apiMessage(
          error,
          editingMember ? "Unable to update member" : "Unable to create member",
        ),
      ),
  });

  const setMemberStatus = useMutation({
    mutationFn: ({ memberId, isActive }) =>
      members.update(memberId, { isActive }),
    onSuccess: () => {
      setMenuOpenId(null);
      qc.invalidateQueries({ queryKey: ["members"] });
      toast.success("Member status updated successfully.");
    },
    onError: (error) =>
      toast.error(apiMessage(error, "Unable to update member status")),
  });

  const deleteMember = useMutation({
    mutationFn: (memberId) => members.remove(memberId),
    onSuccess: () => {
      setMenuOpenId(null);
      qc.invalidateQueries({ queryKey: ["members"] });
      toast.success("Member deleted successfully.");
    },
    onError: (error) =>
      toast.error(apiMessage(error, "Unable to delete member")),
  });

  useEffect(() => {
    if (!menuOpenId) return undefined;
    const closeMenu = (event) => {
      if (!event.target.closest(".member-menu")) setMenuOpenId(null);
    };
    const closeOnEscape = (event) => {
      if (event.key === "Escape") setMenuOpenId(null);
    };
    document.addEventListener("mousedown", closeMenu);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("mousedown", closeMenu);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [menuOpenId]);

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    formState: { isSubmitting },
  } = useForm({ defaultValues });

  const openCreateForm = () => {
    setEditingMember(null);
    reset(defaultValues);
    setShowForm(true);
  };

  const openEditForm = (member) => {
    setEditingMember(member);
    setValue("name", member.name || "");
    setValue("email", member.email || "");
    setValue("designation", member.designation || "Developer");
    setValue("role", member.role || "user");
    setValue("contactNumber", member.contactNumber || "");
    setValue("address", member.address || "");
    setValue("isActive", member.isActive !== false);
    setValue("password", "");
    setShowForm(true);
  };

  if (query.isLoading)
    return <Loading text="Loading members..." />;
  if (query.isError)
    return (
      <Failed
        retry={() => {
          query.refetch();
        }}
      />
    );

  const data = list(query.data);

  return (
    <div className="stack">
      <div className="page-head">
        <div>
          <small className="eyebrow">MEMBERS</small>
          <h1>The people behind the work.</h1>
          <p className="muted">
            {canList
              ? "Manage users and access."
              : "Search for an authorized member by name or email."}
          </p>
        </div>
        <button
          className="button primary"
          onClick={canList ? openCreateForm : undefined}
          disabled={!canList}
          title={canList ? "Create member" : "Admins only"}
        >
          Create member
        </button>
      </div>

      <div className="search">
        <Search size={18} />
        <input
          placeholder="Search name or email"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      </div>

      {showForm && canList && (
        <div className="modal-backdrop" onClick={() => setShowForm(false)}>
          <div
            className="modal-card surface"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="modal-header">
              <div>
                <small className="eyebrow">MEMBER</small>
                <h2>{editingMember ? "Edit member" : "Create member"}</h2>
              </div>
              <button
                className="icon small-icon"
                type="button"
                onClick={() => setShowForm(false)}
              >
                ×
              </button>
            </div>

            <form
              className="form-panel"
              onSubmit={handleSubmit((values) => create.mutate(values))}
            >
              <input
                className="field"
                placeholder="Full name"
                {...register("name", { required: true })}
              />
              <div className="two-col-form">
                <input
                  className="field"
                  type="email"
                  placeholder="Email"
                  {...register("email", { required: true })}
                />
                <input
                  className="field"
                  type="password"
                  placeholder="Password"
                  {...register("password", { required: !editingMember })}
                />
              </div>
              <div className="two-col-form">
                <select className="select" {...register("designation")}>
                  <option value="Developer">Developer</option>
                  <option value="Designer">Designer</option>
                  <option value="Tester">Tester</option>
                  <option value="Project Manager">Project Manager</option>
                </select>
                <select className="select" {...register("role")}>
                  <option value="user">User</option>
                  <option value="admin">Admin</option>
                </select>
              </div>
              <div className="two-col-form">
                <input
                  className="field"
                  placeholder="Contact number"
                  {...register("contactNumber")}
                />
                <select
                  className="select"
                  {...register("isActive", {
                    setValueAs: (value) => value === true || value === "true",
                  })}
                >
                  <option value={true}>Active</option>
                  <option value={false}>Deactive</option>
                </select>
              </div>
              <textarea
                className="field textarea"
                placeholder="Address"
                {...register("address")}
              />

              <div className="form-actions">
                <button
                  type="button"
                  className="button secondary"
                  onClick={() => setShowForm(false)}
                >
                  Cancel
                </button>
                <button
                  className="button primary"
                  disabled={isSubmitting || create.isPending}
                >
                  {create.isPending
                    ? "Saving..."
                    : editingMember
                      ? "Save member"
                      : "Create member"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {data.length ? (
        <div className="cards member-grid">
          {data.map((member) => (
            <article
              className="surface card member-card"
              key={member._id || member.id}
            >
              <div className="member-head">
                <div className="avatar">
                  <UserRound size={18} />
                </div>
                <div className="member-actions">
                  <span className="badge">
                    {member.role === "admin" ? "ADMIN" : "USER"}
                  </span>
                </div>
              </div>

              <h3>{member.name}</h3>
              <p>{member.email}</p>
              <div className="meta-block compact">
                <small>{member.designation || "ProjectHub member"}</small>
                <small>{member.contactNumber || "No contact number"}</small>
                <small>{member.address || "No address added"}</small>
                <small
                  className={
                    member.isActive === false ? "soft-danger" : "soft-success"
                  }
                >
                  {member.isActive === false ? "Deactive" : "Active"}
                </small>
              </div>
              <div className="member-card-actions">
                <div className="menu-wrap member-menu">
                  <button
                    type="button"
                    className="icon small-icon"
                    disabled={!canList}
                    aria-label={`Actions for ${member.name}`}
                    onClick={() => {
                      if (!canList) return;
                      setMenuOpenId((current) =>
                        current === (member._id || member.id)
                          ? null
                          : member._id || member.id,
                      );
                    }}
                  >
                    <MoreHorizontal size={16} />
                  </button>
                  {canList && menuOpenId === (member._id || member.id) && (
                    <div className="menu-popover">
                      <button
                        type="button"
                        onClick={() => openEditForm(member)}
                      >
                        <Pencil size={14} />
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          setMemberStatus.mutate({
                            memberId: member._id || member.id,
                            isActive: true,
                          })
                        }
                        disabled={
                          member.isActive !== false || setMemberStatus.isPending
                        }
                      >
                        <Check size={14} />
                        Activate
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          setMemberStatus.mutate({
                            memberId: member._id || member.id,
                            isActive: false,
                          })
                        }
                        disabled={
                          member.isActive === false || setMemberStatus.isPending
                        }
                      >
                        <UserX size={14} />
                        Deactivate
                      </button>
                      <button
                        type="button"
                        className="danger"
                        onClick={() =>
                          deleteMember.mutate(member._id || member.id)
                        }
                        disabled={deleteMember.isPending}
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
          title="No members found"
          text={
            q
              ? "Try a different search term."
              : "No authorized members are available."
          }
        />
      )}
    </div>
  );
}
