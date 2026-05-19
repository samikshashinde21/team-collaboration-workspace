import { useState } from "react";
import { LogIn, Mail, LockKeyhole } from "lucide-react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";

const Login = () => {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [formData, setFormData] = useState({ email: "", password: "" });
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleChange = (event) => {
    setFormData({
      ...formData,
      [event.target.name]: event.target.value,
    });
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError("");
    setIsSubmitting(true);

    try {
      await login(formData);
      navigate(location.state?.from?.pathname || "/dashboard", { replace: true });
    } catch (err) {
      setError(err.response?.data?.message || "Login failed. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <section className="premium-card overflow-hidden p-6">
      <div className="mb-6">
        <div className="icon-chip mb-4">
          <LogIn className="h-5 w-5" />
        </div>
        <p className="section-kicker">Secure workspace</p>
        <h1 className="mt-2 text-3xl font-black text-navy-900">Welcome back</h1>
        <p className="mt-2 text-sm text-slate-600">Login to continue to your collaboration hub.</p>
      </div>

      {error && (
        <div className="mb-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor="email" className="flex items-center gap-2 text-sm font-semibold text-slate-700">
            <Mail className="h-4 w-4 text-lavender-500" />
            Email
          </label>
          <input
            id="email"
            name="email"
            type="email"
            value={formData.email}
            onChange={handleChange}
            required
            className="field-input"
          />
        </div>

        <div>
          <label htmlFor="password" className="flex items-center gap-2 text-sm font-semibold text-slate-700">
            <LockKeyhole className="h-4 w-4 text-lavender-500" />
            Password
          </label>
          <input
            id="password"
            name="password"
            type="password"
            value={formData.password}
            onChange={handleChange}
            required
            className="field-input"
          />
        </div>

        <button
          type="submit"
          disabled={isSubmitting}
          className="btn-primary w-full"
        >
          <LogIn className="h-4 w-4" />
          {isSubmitting ? "Logging in..." : "Login"}
        </button>
      </form>

      <p className="mt-6 text-center text-sm text-slate-600">
        New here?{" "}
        <Link to="/register" className="font-bold text-lavender-500">
          Create an account
        </Link>
      </p>
    </section>
  );
};

export default Login;
