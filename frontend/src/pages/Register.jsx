import { useState } from "react";
import { Mail, LockKeyhole, UserPlus, UserRound } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import Loader from "../components/Loader";
import PasswordField from "../components/PasswordField";
import { useAuth } from "../hooks/useAuth";
import { isStrongPassword, passwordRequirementText } from "../utils/passwordValidation";

const Register = () => {
  const { register } = useAuth();
  const navigate = useNavigate();
  const [formData, setFormData] = useState({ name: "", email: "", password: "" });
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

    if (!isStrongPassword(formData.password)) {
      setError(passwordRequirementText);
      return;
    }

    setIsSubmitting(true);

    try {
      await register(formData);
      navigate("/dashboard", { replace: true });
    } catch (err) {
      setError(err.response?.data?.message || "Registration failed. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <section className="premium-card overflow-hidden p-6">
      <div className="mb-6">
        <div className="icon-chip mb-4">
          <UserPlus className="h-5 w-5" />
        </div>
        <p className="section-kicker">Team access</p>
        <h1 className="mt-2 text-3xl font-black text-navy-900">Create your account</h1>
        <p className="mt-2 text-sm text-slate-600">Start collaborating with your team.</p>
      </div>

      {error && (
        <div className="mb-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor="name" className="flex items-center gap-2 text-sm font-semibold text-slate-700">
            <UserRound className="h-4 w-4 text-lavender-500" />
            Name
          </label>
          <input
            id="name"
            name="name"
            type="text"
            value={formData.name}
            onChange={handleChange}
            required
            className="field-input"
          />
        </div>

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
          <PasswordField
            id="password"
            name="password"
            value={formData.password}
            onChange={handleChange}
            minLength="7"
            required
            autoComplete="new-password"
          />
          <p className="mt-2 text-xs font-medium text-slate-500">{passwordRequirementText}</p>
        </div>

        <button
          type="submit"
          disabled={isSubmitting}
          className="btn-primary w-full"
        >
          {isSubmitting ? <Loader label="Creating account" size="sm" /> : <UserPlus className="h-4 w-4" />}
          Register
        </button>
      </form>

      <p className="mt-6 text-center text-sm text-slate-600">
        Already have an account?{" "}
        <Link to="/login" className="font-bold text-lavender-500">
          Login
        </Link>
      </p>
    </section>
  );
};

export default Register;
