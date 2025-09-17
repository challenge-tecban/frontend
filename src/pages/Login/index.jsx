import { useForm } from "react-hook-form";
import { useContext } from "react";
import { useNavigate } from "react-router-dom";
import { AuthContext } from "../../context/AuthContext";

export default function Login() {
  const {
    register,
    handleSubmit,
    watch,
    formState: { errors },
  } = useForm();
    const navigate = useNavigate();
  const { handleSignin } = useContext(AuthContext);

    const onSubmit = (data) => {
        handleSignin(data);
        navigate('/');
    };

  return (
    <div className="min-h-screen flex items-center justify-center bg-black relative overflow-hidden">
      {/* decorative corner connectors */}
      <div className="corner-decor top-left" />
      <div className="corner-decor top-right" />
      <div className="corner-decor bottom-left" />
      <div className="corner-decor bottom-right" />

      <div className="w-full max-w-sm">
        <div className="bg-gray-900/90 border border-gray-800 rounded-xl p-8 shadow-lg">
          <div className="flex flex-col items-center mb-6">
            <div className="w-12 h-12 rounded-md bg-gray-800 flex items-center justify-center mb-3">{/* logo placeholder */}
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><circle cx="12" cy="12" r="9" stroke="#374151" strokeWidth="1.2"/></svg>
            </div>
            <h2 className="text-white text-lg font-semibold">Unamed</h2>
            <p className="text-gray-400 text-sm mt-1">Access your account</p>
          </div>

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            {/* email floating */}
            <div className="relative floating">
              <input
                id="email"
                type="text"
                {...register('email', { required: 'E-mail is required', pattern: { value: /^[^\s@]+@[^\s@]+\.[^\s@]+$/, message: 'Invalid e-mail' } })}
                className="w-full px-3 py-3 bg-gray-800 border border-gray-700 rounded-md text-gray-100 placeholder-transparent focus:outline-none focus:ring-2 focus:ring-red-600"
                placeholder=" "
              />
              <label htmlFor="email" className={`floating-label ${watch('email') ? 'active' : ''}`}>Email</label>
              {errors.email && <p className="text-red-400 text-xs mt-1">{errors.email.message}</p>}
            </div>

            {/* password floating */}
            <div className="relative floating">
              <input
                id="password"
                type="password"
                {...register('password', { required: 'Password is required' })}
                className="w-full px-3 py-3 bg-gray-800 border border-gray-700 rounded-md text-gray-100 placeholder-transparent focus:outline-none focus:ring-2 focus:ring-red-600"
                placeholder=" "
              />
              <label htmlFor="password" className={`floating-label ${watch('password') ? 'active' : ''}`}>Password</label>
              {errors.password && <p className="text-red-400 text-xs mt-1">{errors.password.message}</p>}
            </div>

            <button className="w-full py-2 rounded-md cursor-pointer bg-red-700 hover:bg-red-600 text-white font-medium">Login</button>
          </form>
          <div className="mt-4 text-center text-sm text-gray-400">Don't have an account yet? <button className="text-red-400 underline">Sign up</button></div>
        </div>
      </div>
    </div>
  );
}
