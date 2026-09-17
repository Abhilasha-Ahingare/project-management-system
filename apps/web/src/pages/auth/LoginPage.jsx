import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useDispatch } from "react-redux";
import { useNavigate } from "react-router-dom";
import { toast } from "react-toastify";
import { ArrowRight, LockKeyhole } from "lucide-react";
import { auth } from "../../api/resources.api";
import { apiMessage, setAccessToken } from "../../api/client";
import { session } from "../../app/store";
const schema = z.object({
  email: z.string().email("Enter a valid email"),
  password: z.string().min(1, "Password is required"),
});
export default function LoginPage() {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm({ resolver: zodResolver(schema) });
  const submit = async (values) => {
    try {
      const result = await auth.login(values);
      setAccessToken(result.accessToken);
      dispatch(session(result.user));
      navigate("/overview");
    } catch (error) {
      toast.error(apiMessage(error, "Unable to sign in"));
    }
  };
  return (
    <main className="login">
      <section className="login-art">
        <small>PROJECTHUB / WORKSPACE INTELLIGENCE</small>
        <h1>
          Make the work <span>visible.</span>
        </h1>
        <p>A calm, connected place for teams to turn plans into progress.</p>
      </section>
      <section className="login-form">
        <div className="login-box">
          <div className="lock">
            <LockKeyhole size={18} />
          </div>
          <small>WELCOME BACK</small>
          <h2>Sign in to your workspace</h2>
          <p>Use the account provided by your administrator.</p>
          <form onSubmit={handleSubmit(submit)}>
            <label>
              Email
              <input type="email" {...register("email")} />
              {errors.email && <em>{errors.email.message}</em>}
            </label>
            <label>
              Password
              <input type="password" {...register("password")} />
              {errors.password && <em>{errors.password.message}</em>}
            </label>
            <button className="button primary" disabled={isSubmitting}>
              {isSubmitting ? (
                "Signing in..."
              ) : (
                <>
                  Continue <ArrowRight size={17} />
                </>
              )}
            </button>
          </form>
        </div>
      </section>
    </main>
  );
}
