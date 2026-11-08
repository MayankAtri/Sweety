import { useId, useState } from "react";
import { ArrowRight, Droplet, Eye, EyeOff } from "lucide-react";
import { api } from "../lib.js";

export default function AuthScreen({ onAuthenticated, notice }) {
  const id = useId();
  const [mode, setMode] = useState("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const registering = mode === "register";

  function changeMode(next) {
    setMode(next);
    setError("");
    setPassword("");
    setShowPassword(false);
  }

  async function submit(event) {
    event.preventDefault();
    if (pending) return;
    setError("");
    const cleanEmail = email.trim();
    if (
      registering &&
      (!name.trim() || [...name.trim()].length > 100 || name.includes("\0"))
    ) {
      setError("Please enter a name between 1 and 100 characters.");
      return;
    }
    if (
      cleanEmail.length > 254 ||
      cleanEmail.includes("\0") ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)
    ) {
      setError("Please enter a valid email address.");
      return;
    }
    if (
      [...password].length < 8 ||
      new TextEncoder().encode(password).length > 72
    ) {
      setError(
        "Password must have at least 8 characters and at most 72 UTF-8 bytes.",
      );
      return;
    }
    setPending(true);
    try {
      const result = await api(`/auth/${mode}`, {
        method: "POST",
        body: {
          email: cleanEmail,
          password,
          ...(registering ? { name: name.trim() } : {}),
        },
      });
      onAuthenticated(result.user);
    } catch (failure) {
      setError(failure.message || "We couldn’t sign you in. Please try again.");
    } finally {
      setPending(false);
    }
  }

  return (
    <main className="auth-layout">
      <section className="auth-story" aria-labelledby={`${id}-story`}>
        <a className="brand" href="/" aria-label="Sweety home">
          <span className="brand-mark">
            <Droplet aria-hidden="true" size={23} />
          </span>
          Sweety<span className="brand-dot">.</span>
        </a>
        <div className="auth-story-content">
          <p className="eyebrow">Your blood glucose journal</p>
          <h1 id={`${id}-story`}>
            A little record.
            <br />A clearer picture.
          </h1>
          <p className="auth-intro">
            Keep your readings together. Make room for a simple daily habit.
          </p>
          <ol className="auth-benefits">
            <li>
              <span>01</span>
              <div>
                <strong>Four moments a day</strong>
                <p>A place for each of your daily readings.</p>
              </div>
            </li>
            <li>
              <span>02</span>
              <div>
                <strong>See the bigger picture</strong>
                <p>Daily and monthly reports, in one place.</p>
              </div>
            </li>
            <li>
              <span>03</span>
              <div>
                <strong>Your own space</strong>
                <p>Only your account can access your readings.</p>
              </div>
            </li>
          </ol>
        </div>
        <p className="auth-footer">A simple record for your everyday care.</p>
      </section>
      <section className="auth-panel" aria-labelledby={`${id}-heading`}>
        <div className="auth-form-wrap">
          <div className="auth-tabs" aria-label="Account access">
            <button
              type="button"
              className={!registering ? "active" : ""}
              aria-pressed={!registering}
              disabled={pending}
              onClick={() => changeMode("login")}
            >
              Log in
            </button>
            <button
              type="button"
              className={registering ? "active" : ""}
              aria-pressed={registering}
              disabled={pending}
              onClick={() => changeMode("register")}
            >
              Create account
            </button>
          </div>
          <p className="eyebrow">
            {registering ? "Start your journal" : "Good to see you"}
          </p>
          <h2 id={`${id}-heading`}>
            {registering ? "A fresh start." : "Welcome back."}
          </h2>
          <p className="auth-description">
            {registering
              ? "Create an account to start recording your readings."
              : "Log in to pick up where you left off."}
          </p>
          {notice && (
            <p className="notice" role="status">
              {notice}
            </p>
          )}
          <form onSubmit={submit} noValidate aria-busy={pending}>
            {registering && (
              <div className="field">
                <label htmlFor={`${id}-name`}>Full name</label>
                <input
                  id={`${id}-name`}
                  name="name"
                  autoComplete="name"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  disabled={pending}
                  required
                  placeholder="Your name"
                />
              </div>
            )}
            <div className="field">
              <label htmlFor={`${id}-email`}>Email address</label>
              <input
                id={`${id}-email`}
                name="email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                disabled={pending}
                required
                placeholder="you@example.com"
              />
            </div>
            <div className="field">
              <label htmlFor={`${id}-password`}>Password</label>
              <div className="password-input">
                <input
                  id={`${id}-password`}
                  name="password"
                  type={showPassword ? "text" : "password"}
                  autoComplete={
                    registering ? "new-password" : "current-password"
                  }
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  disabled={pending}
                  required
                  aria-describedby={
                    registering ? `${id}-password-help` : undefined
                  }
                  placeholder={
                    registering
                      ? "At least 8 characters"
                      : "Enter your password"
                  }
                />
                <button
                  className="icon-button"
                  type="button"
                  disabled={pending}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  onClick={() => setShowPassword((value) => !value)}
                >
                  {showPassword ? (
                    <EyeOff size={18} aria-hidden="true" />
                  ) : (
                    <Eye size={18} aria-hidden="true" />
                  )}
                </button>
              </div>
              {registering && (
                <p id={`${id}-password-help`} className="field-hint">
                  Use at least 8 characters.
                </p>
              )}
            </div>
            {error && (
              <p className="form-error" role="alert">
                {error}
              </p>
            )}
            <button
              className="button auth-submit"
              type="submit"
              disabled={pending}
            >
              {pending
                ? registering
                  ? "Creating account…"
                  : "Logging in…"
                : registering
                  ? "Create account"
                  : "Log in"}
              <ArrowRight size={18} aria-hidden="true" />
            </button>
          </form>
          {!registering && (
            <div className="demo-access">
              <p>Just taking a look?</p>
              <button
                className="text-button"
                type="button"
                disabled={pending}
                onClick={() => {
                  setEmail("demo@sweety.example");
                  setPassword("SweetyDemo123!");
                  setError("");
                }}
              >
                Fill demo credentials{" "}
                <ArrowRight size={15} aria-hidden="true" />
              </button>
              <small>Explore sample readings in the demo account.</small>
            </div>
          )}
        </div>
      </section>
    </main>
  );
}
