import { useEffect, useState } from "react";
import api from "../api/api";

const roles = ["admin", "moderator", "user"];

const Users = () => {
  const [users, setUsers] = useState([]);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchUsers = async () => {
      setError("");

      try {
        const { data } = await api.get("/users");
        setUsers(data);
      } catch (err) {
        setError(err.response?.data?.message || "Could not load users.");
      } finally {
        setIsLoading(false);
      }
    };

    fetchUsers();
  }, []);

  const updateRole = async (userId, role) => {
    setError("");
    setMessage("");

    try {
      const { data } = await api.patch(`/users/${userId}/role`, { role });
      setUsers(users.map((user) => (user._id === userId ? { ...user, role: data.role } : user)));
      setMessage("Role updated successfully.");
    } catch (err) {
      setError(err.response?.data?.message || "Could not update role.");
    }
  };

  return (
    <section>
      <div className="mb-6">
        <p className="text-sm font-medium uppercase tracking-wide text-slate-500">Admin</p>
        <h1 className="mt-2 text-3xl font-semibold">Users</h1>
        <p className="mt-2 text-slate-600">Review users and assign roles.</p>
      </div>

      {error && (
        <div className="mb-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      )}

      {message && (
        <div className="mb-4 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
          {message}
        </div>
      )}

      <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
        {isLoading ? (
          <p className="p-5 text-slate-600">Loading users...</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-slate-600">
                <tr>
                  <th className="px-4 py-3 font-medium">Name</th>
                  <th className="px-4 py-3 font-medium">Email</th>
                  <th className="px-4 py-3 font-medium">Role</th>
                  <th className="px-4 py-3 font-medium">Change role</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {users.map((user) => (
                  <tr key={user._id}>
                    <td className="px-4 py-3 font-medium text-slate-900">{user.name}</td>
                    <td className="px-4 py-3 text-slate-600">{user.email}</td>
                    <td className="px-4 py-3 capitalize text-slate-600">{user.role}</td>
                    <td className="px-4 py-3">
                      <select
                        value={user.role}
                        onChange={(event) => updateRole(user._id, event.target.value)}
                        className="rounded-md border border-slate-300 px-3 py-2 outline-none focus:border-slate-900"
                      >
                        {roles.map((role) => (
                          <option key={role} value={role}>
                            {role}
                          </option>
                        ))}
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
};

export default Users;
