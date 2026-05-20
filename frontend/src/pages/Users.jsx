import { useEffect, useState } from "react";
import { Shield, UsersRound } from "lucide-react";
import api from "../api/api";
import Loader from "../components/Loader";

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
    <section className="space-y-6">
      <div className="page-hero">
        <p className="section-kicker">Admin</p>
        <h1 className="mt-2 flex items-center gap-3 text-4xl font-black text-navy-900">
          <UsersRound className="h-9 w-9 text-lavender-500" />
          Users
        </h1>
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

      <div className="premium-card overflow-hidden">
        {isLoading ? (
          <Loader label="Loading users" className="p-5" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead className="border-b border-violet-100 bg-lavender-200/20 text-slate-600">
                <tr>
                  <th className="px-4 py-3 font-medium">Name</th>
                  <th className="px-4 py-3 font-medium">Email</th>
                  <th className="px-4 py-3 font-medium">
                    <span className="inline-flex items-center gap-2"><Shield className="h-4 w-4" /> Role</span>
                  </th>
                  <th className="px-4 py-3 font-medium">Change role</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {users.map((user) => (
                  <tr key={user._id} className="transition hover:bg-white/70">
                    <td className="px-4 py-3 font-medium text-slate-900">{user.name}</td>
                    <td className="px-4 py-3 text-slate-600">{user.email}</td>
                    <td className="px-4 py-3 capitalize text-slate-600">{user.role}</td>
                    <td className="px-4 py-3">
                      <select
                        value={user.role}
                        onChange={(event) => updateRole(user._id, event.target.value)}
                        className="rounded-xl border border-violet-100 bg-white/80 px-3 py-2 outline-none transition focus:border-lavender-500 focus:ring-4 focus:ring-lavender-200/40"
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
