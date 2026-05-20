import { useState } from "react";
import { KeyRound, LockKeyhole } from "lucide-react";
import { Link, useNavigate, useParams } from "react-router-dom";
import api from "../api/api";
import Loader from "../components/Loader";
import PasswordField from "../components/PasswordField";
import { isStrongPassword, passwordRequirementText } from "../utils/passwordValidation";

const ResetPassword = () => {
  const { token } = useParams();
  const navigate = useNavigate();
  const [formData, setFormData] = useState({ password: "", confirmPassword: "" });
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleChange = (event) => {
    setFormData((currentFormData) => ({
      ...currentFormData,
      [event.target.name]: event.target.value,
    }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError("");
    setMessage("");

    if (!isStrongPassword(formData.password)) {
      setError(passwordRequirementText);
      return;
    }

    if (formData.password !== formData.confirmPassword) {
      setError("Password confirmation does not match.");
      return;
    }

    setIsSubmitting(true);

    try {
      const { data } = await api.post(`/auth/reset-password/${token}`, {
        password: formData.password,
      });
      setMessage(data.message || "Password reset successfully.");
      window.setTimeout(() => navigate("/login", { replace: true }), 1200);
    } catch (err) {
      setError(err.response?.data?.message || "Could not reset password.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <section className="premium-card overflow-hidden p-6">
      <div className="mb-6">
        <div className="icon-chip mb-4">
          <KeyRound className="h-5 w-5" />
        </div>
        <p className="section-kicker">Account recovery</p>
        <h1 className="mt-2 text-3xl font-black text-navy-900">Reset password</h1>
        <p className="mt-2 text-sm text-slate-600">Choose a new password for your account.</p>
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

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor="password" className="flex items-center gap-2 text-sm font-semibold text-slate-700">
            <LockKeyhole className="h-4 w-4 text-lavender-500" />
            New password
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
        </div>

        <div>
          <label htmlFor="confirmPassword" className="flex items-center gap-2 text-sm font-semibold text-slate-700">
            <LockKeyhole className="h-4 w-4 text-lavender-500" />
            Confirm password
          </label>
          <PasswordField
            id="confirmPassword"
            name="confirmPassword"
            value={formData.confirmPassword}
            onChange={handleChange}
            minLength="7"
            required
            autoComplete="new-password"
          />
          <p className="mt-2 text-xs font-medium text-slate-500">{passwordRequirementText}</p>
        </div>

        <button type="submit" disabled={isSubmitting} className="btn-primary w-full">
          {isSubmitting ? <Loader label="Resetting password" size="sm" /> : <KeyRound className="h-4 w-4" />}
          Reset password
        </button>
      </form>

      <p className="mt-6 text-center text-sm text-slate-600">
        Remembered it?{" "}
        <Link to="/login" className="font-bold text-lavender-500">
          Login
        </Link>
      </p>
    </section>
  );
};

export default ResetPassword;
