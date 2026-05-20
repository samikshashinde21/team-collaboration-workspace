import { useState } from "react";
import { LogIn, Mail, LockKeyhole } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import api from "../api/api";
import Loader from "../components/Loader";
import PasswordField from "../components/PasswordField";
import { useAuth } from "../hooks/useAuth";
import { emailValidationMessage, isValidEmail, normalizeEmail } from "../utils/emailValidation";

const Login = () => {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [formData, setFormData] = useState({ email: "", password: "" });
  const [forgotEmail, setForgotEmail] = useState("");
  const [error, setError] = useState("");
  const [forgotMessage, setForgotMessage] = useState("");
  const [forgotError, setForgotError] = useState("");
  const [isForgotOpen, setIsForgotOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isForgotSubmitting, setIsForgotSubmitting] = useState(false);

  const handleChange = (event) => {
    setFormData({
      ...formData,
      [event.target.name]: event.target.value,
    });
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError("");

    if (!isValidEmail(formData.email)) {
      setError(emailValidationMessage);
      return;
    }

    setIsSubmitting(true);

    try {
      await login({ ...formData, email: normalizeEmail(formData.email) });
      navigate("/dashboard", { replace: true });
    } catch (err) {
      setError(err.response?.data?.message || "Login failed. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleForgotOpen = () => {
    setForgotEmail(normalizeEmail(formData.email));
    setForgotError("");
    setForgotMessage("");
    setIsForgotOpen(true);
  };

  const handleForgotSubmit = async (event) => {
    event.preventDefault();
    setForgotError("");
    setForgotMessage("");

    if (!isValidEmail(forgotEmail)) {
      setForgotError(emailValidationMessage);
      return;
    }

    setIsForgotSubmitting(true);

    try {
      const { data } = await api.post("/auth/forgot-password", {
        email: normalizeEmail(forgotEmail),
      });
      setForgotMessage(data.message || "If an account exists, password reset instructions will be sent.");
    } catch (err) {
      setForgotError(err.response?.data?.message || "Could not process password reset request.");
    } finally {
      setIsForgotSubmitting(false);
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
          <PasswordField
            id="password"
            name="password"
            value={formData.password}
            onChange={handleChange}
            required
            autoComplete="current-password"
          />
          <div className="mt-2 text-right">
            <button
              type="button"
              onClick={handleForgotOpen}
              className="text-sm font-bold text-lavender-500 hover:text-navy-900"
            >
              Forgot password?
            </button>
          </div>
        </div>

        <button
          type="submit"
          disabled={isSubmitting}
          className="btn-primary w-full"
        >
          {isSubmitting ? <Loader label="Logging in" size="sm" /> : <LogIn className="h-4 w-4" />}
          Login
        </button>
      </form>

      <p className="mt-6 text-center text-sm text-slate-600">
        New here?{" "}
        <Link to="/register" className="font-bold text-lavender-500">
          Create an account
        </Link>
      </p>

      {isForgotOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-navy-950/55 px-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl border border-white/70 bg-white/95 p-6 shadow-lift">
            <div className="mb-5 flex items-start justify-between gap-4">
              <div>
                <h2 className="text-xl font-black text-navy-900">Forgot password</h2>
                <p className="mt-1 text-sm text-slate-600">Enter your account email to request reset instructions.</p>
              </div>
              <button
                type="button"
                onClick={() => setIsForgotOpen(false)}
                className="btn-secondary px-3 py-1.5"
              >
                Close
              </button>
            </div>

            {forgotError && (
              <div className="mb-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                {forgotError}
              </div>
            )}
            {forgotMessage && (
              <div className="mb-4 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
                {forgotMessage}
              </div>
            )}

            <form onSubmit={handleForgotSubmit} className="space-y-4">
              <div>
                <label htmlFor="forgotEmail" className="flex items-center gap-2 text-sm font-semibold text-slate-700">
                  <Mail className="h-4 w-4 text-lavender-500" />
                  Email
                </label>
                <input
                  id="forgotEmail"
                  name="forgotEmail"
                  type="email"
                  value={forgotEmail}
                  onChange={(event) => setForgotEmail(event.target.value)}
                  required
                  className="field-input"
                />
              </div>
              <button type="submit" disabled={isForgotSubmitting} className="btn-primary w-full">
                {isForgotSubmitting ? <Loader label="Sending request" size="sm" /> : <Mail className="h-4 w-4" />}
                Send reset request
              </button>
            </form>
          </div>
        </div>
      )}
    </section>
  );
};

export default Login;
