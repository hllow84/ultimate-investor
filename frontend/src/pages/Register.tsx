import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { TrendingUp } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";

export default function Register() {
  const { register } = useAuth();
  const navigate = useNavigate();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (password !== confirm) {
      setError("Passwords don't match");
      return;
    }
    if (password.length < 8) {
      setError("Password must be at least 8 characters");
      return;
    }
    setLoading(true);
    try {
      await register(email.trim(), password);
      navigate("/");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Registration failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4" style={{ backgroundColor: "var(--bg)" }}>
      <div className="w-full max-w-sm">
        <div className="flex items-center justify-center gap-2 mb-8">
          <TrendingUp size={28} style={{ color: "var(--accent)" }} />
          <span className="text-xl font-bold" style={{ color: "var(--accent)" }}>Ultimate Investor</span>
        </div>

        <div className="rounded-xl p-8" style={{ backgroundColor: "var(--surface)", border: "1px solid var(--border)" }}>
          <h1 className="text-xl font-semibold mb-6" style={{ color: "var(--text)" }}>Create account</h1>

          {error && (
            <div className="mb-4 p-3 rounded-lg text-sm" style={{ backgroundColor: "#ff444420", color: "#ff6666", border: "1px solid #ff444440" }}>
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm mb-1.5" style={{ color: "var(--muted)" }}>Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoFocus
                className="w-full px-3 py-2 rounded-lg text-sm outline-none"
                style={{ backgroundColor: "var(--bg)", border: "1px solid var(--border)", color: "var(--text)" }}
                placeholder="you@example.com"
              />
            </div>

            <div>
              <label className="block text-sm mb-1.5" style={{ color: "var(--muted)" }}>Password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="w-full px-3 py-2 rounded-lg text-sm outline-none"
                style={{ backgroundColor: "var(--bg)", border: "1px solid var(--border)", color: "var(--text)" }}
                placeholder="Min. 8 characters"
              />
            </div>

            <div>
              <label className="block text-sm mb-1.5" style={{ color: "var(--muted)" }}>Confirm password</label>
              <input
                type="password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                required
                className="w-full px-3 py-2 rounded-lg text-sm outline-none"
                style={{ backgroundColor: "var(--bg)", border: "1px solid var(--border)", color: "var(--text)" }}
                placeholder="••••••••"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 rounded-lg text-sm font-medium transition-opacity"
              style={{ backgroundColor: "var(--accent)", color: "#fff", opacity: loading ? 0.6 : 1 }}
            >
              {loading ? "Creating account…" : "Create account"}
            </button>
          </form>

          <p className="mt-5 text-sm text-center" style={{ color: "var(--muted)" }}>
            Already have an account?{" "}
            <Link to="/login" style={{ color: "var(--accent)" }}>
              Sign in
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
